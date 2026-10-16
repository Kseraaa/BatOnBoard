import {
  createRng,
  dispatchAction,
  EngineError,
  fireDeadline,
  getDeadline,
  removePlayer,
  startGame,
  viewsFor,
} from '@batonboard/engine';
import type { AnyGameDefinition, GameRegistry, PlayerId, Rng } from '@batonboard/engine';
import {
  createRoomSchema,
  joinRoomSchema,
  kickSchema,
  RoomError,
  settingsSchema,
} from '@batonboard/protocol';
import type {
  Ack,
  JoinedMessage,
  RoomStateMessage,
  RoomStatus,
  ServerToClientEvents,
} from '@batonboard/protocol';

/** host ออฟไลน์นานเกินนี้ โอนสิทธิ์ให้คนที่ออนไลน์ */
export const HOST_GRACE_MS = 30_000;
/** ทุกคนออฟไลน์นานเกินนี้ ลบห้องทิ้ง */
export const ROOM_IDLE_MS = 10 * 60_000;

export interface Transport {
  send<E extends keyof ServerToClientEvents>(
    connectionId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  /** ตัดการเชื่อมต่อ (หลังส่ง room:kicked) */
  close(connectionId: string): void;
}

export interface Scheduler {
  /** ตั้ง timer ใหม่แทนตัวเดิมที่ใช้ key เดียวกัน */
  set(key: string, delayMs: number, fn: () => void): void;
  clear(key: string): void;
}

export interface IdSource {
  roomCode(): string;
  playerId(): string;
  token(): string;
  seed(): number;
}

export interface RoomManagerDeps {
  registry: GameRegistry;
  transport: Transport;
  scheduler: Scheduler;
  ids: IdSource;
  now(): number;
}

interface Player {
  id: PlayerId;
  name: string;
  token: string;
  connectionId: string | null;
}

interface Room {
  code: string;
  game: AnyGameDefinition;
  hostId: PlayerId;
  /** ลำดับการเข้าห้อง — ใช้เลือก host คนถัดไป */
  players: Player[];
  options: unknown;
  status: RoomStatus;
  state: unknown;
  rng: Rng;
}

const ok = <T>(value: T): Ack<T> => ({ ok: true, value });
const fail = <T = undefined>(error: string): Ack<T> => ({ ok: false, error });
const OK: Ack = { ok: true, value: undefined };

/**
 * จัดการห้อง ผู้เล่น และการรันเกม — ไม่รู้จัก socket และไม่รู้จักกติกาเกมใด
 * ทุก method รับ payload เป็น unknown แล้วตรวจด้วย schema เอง
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly connections = new Map<string, { code: string; playerId: PlayerId }>();

  constructor(private readonly deps: RoomManagerDeps) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  createRoom(conn: string, payload: unknown): Ack<JoinedMessage> {
    if (this.connections.has(conn)) return fail(RoomError.AlreadyInRoom);
    const parsed = createRoomSchema.safeParse(payload);
    if (!parsed.success) return fail(RoomError.InvalidPayload);
    const game = this.deps.registry.get(parsed.data.gameId);
    if (!game) return fail(RoomError.UnknownGame);

    let code = this.deps.ids.roomCode();
    while (this.rooms.has(code)) code = this.deps.ids.roomCode();

    const player = this.newPlayer(parsed.data.name, conn);
    const room: Room = {
      code,
      game,
      hostId: player.id,
      players: [player],
      options: game.defaultOptions,
      status: 'lobby',
      state: null,
      rng: createRng(this.deps.ids.seed()),
    };
    this.rooms.set(code, room);
    this.connections.set(conn, { code, playerId: player.id });
    this.publish(room);
    return ok({ code, playerId: player.id, token: player.token });
  }

  joinRoom(conn: string, payload: unknown): Ack<JoinedMessage> {
    if (this.connections.has(conn)) return fail(RoomError.AlreadyInRoom);
    const parsed = joinRoomSchema.safeParse(payload);
    if (!parsed.success) return fail(RoomError.InvalidPayload);
    const { code, name, token } = parsed.data;
    const room = this.rooms.get(code);
    if (!room) return fail(RoomError.RoomNotFound);

    const existing = token === undefined ? undefined : room.players.find((p) => p.token === token);
    if (existing) {
      // กลับเข้าห้องเป็นผู้เล่นคนเดิม — ถ้ายังมีแท็บเก่าค้างอยู่ให้ตัดแท็บเก่า
      if (existing.connectionId !== null) {
        this.deps.transport.send(existing.connectionId, 'room:kicked', { reason: 'replaced' });
        this.connections.delete(existing.connectionId);
        this.deps.transport.close(existing.connectionId);
      }
      existing.connectionId = conn;
      this.connections.set(conn, { code, playerId: existing.id });
      this.deps.scheduler.clear(`idle:${code}`);
      this.publish(room);
      return ok({ code, playerId: existing.id, token: existing.token });
    }

    if (room.players.length >= room.game.maxPlayers) return fail(RoomError.RoomFull);
    const lower = name.toLocaleLowerCase();
    if (room.players.some((p) => p.name.toLocaleLowerCase() === lower)) {
      return fail(RoomError.NameTaken);
    }

    const player = this.newPlayer(name, conn);
    room.players.push(player);
    this.connections.set(conn, { code, playerId: player.id });
    this.deps.scheduler.clear(`idle:${code}`);
    this.publish(room);
    return ok({ code, playerId: player.id, token: player.token });
  }

  /** ออกจากห้องเอง — ลบผู้เล่นทันที */
  leave(conn: string): Ack {
    const ctx = this.context(conn);
    if (!ctx) return fail(RoomError.NotInRoom);
    this.removeFromRoom(ctx.room, ctx.player.id);
    return OK;
  }

  /** เน็ตหลุด/ปิดแท็บ — ไม่ลบผู้เล่น แค่แสดงว่าออฟไลน์ */
  disconnect(conn: string): void {
    const ctx = this.context(conn);
    if (!ctx) return;
    const { room, player } = ctx;
    this.connections.delete(conn);
    player.connectionId = null;

    if (player.id === room.hostId) {
      this.deps.scheduler.set(`host:${room.code}`, HOST_GRACE_MS, () =>
        this.handOverOfflineHost(room.code),
      );
    }
    if (room.players.every((p) => p.connectionId === null)) {
      this.deps.scheduler.set(`idle:${room.code}`, ROOM_IDLE_MS, () => this.reapIdle(room.code));
    }
    this.publishRoomState(room);
  }

  updateSettings(conn: string, payload: unknown): Ack {
    const ctx = this.hostContext(conn);
    if (!ctx.ok) return ctx;
    const room = ctx.value;
    if (room.status !== 'lobby') return fail(RoomError.NotInLobby);
    const parsed = settingsSchema.safeParse(payload);
    if (!parsed.success) return fail(RoomError.InvalidPayload);
    const options = room.game.optionsSchema.safeParse(parsed.data.options);
    if (!options.success) return fail(EngineError.InvalidOptions);
    room.options = options.data;
    this.publishRoomState(room);
    return OK;
  }

  start(conn: string): Ack {
    const ctx = this.hostContext(conn);
    if (!ctx.ok) return ctx;
    const room = ctx.value;
    if (room.status !== 'lobby') return fail(RoomError.NotInLobby);
    const res = startGame(
      room.game,
      room.players.map((p) => p.id),
      room.options,
      room.rng,
      this.deps.now(),
    );
    if (!res.ok) return fail(res.error);
    room.state = res.value;
    room.status = 'playing';
    this.publish(room);
    this.reschedule(room);
    return OK;
  }

  /** host พาห้องกลับล็อบบี้ (จบเกม) */
  backToLobby(conn: string): Ack {
    const ctx = this.hostContext(conn);
    if (!ctx.ok) return ctx;
    const room = ctx.value;
    if (room.status !== 'playing') return fail(RoomError.NotPlaying);
    room.status = 'lobby';
    room.state = null;
    this.deps.scheduler.clear(`deadline:${room.code}`);
    this.publish(room);
    return OK;
  }

  kick(conn: string, payload: unknown): Ack {
    const ctx = this.hostContext(conn);
    if (!ctx.ok) return ctx;
    const room = ctx.value;
    const parsed = kickSchema.safeParse(payload);
    if (!parsed.success) return fail(RoomError.InvalidPayload);
    const target = room.players.find((p) => p.id === parsed.data.playerId);
    if (!target) return fail(RoomError.PlayerNotFound);
    if (target.id === room.hostId) return fail(RoomError.CannotKickSelf);

    if (target.connectionId !== null) {
      this.deps.transport.send(target.connectionId, 'room:kicked', { reason: 'kicked' });
      this.deps.transport.close(target.connectionId);
    }
    this.removeFromRoom(room, target.id);
    return OK;
  }

  /** socket 'game:action' → engine pipeline → ส่ง view แยกรายคน */
  action(conn: string, payload: unknown): Ack {
    const ctx = this.context(conn);
    if (!ctx) return fail(RoomError.NotInRoom);
    const { room, player } = ctx;
    if (room.status !== 'playing') return fail(RoomError.NotPlaying);
    const res = dispatchAction(
      room.game,
      room.state,
      payload,
      player.id,
      { hostId: room.hostId },
      this.deps.now(),
      room.rng,
    );
    if (!res.ok) return fail(res.error);
    room.state = res.value;
    this.publish(room);
    this.reschedule(room);
    return OK;
  }

  // ---- ภายใน ----

  private newPlayer(name: string, conn: string): Player {
    return { id: this.deps.ids.playerId(), name, token: this.deps.ids.token(), connectionId: conn };
  }

  private context(conn: string): { room: Room; player: Player } | null {
    const c = this.connections.get(conn);
    const room = c && this.rooms.get(c.code);
    const player = room?.players.find((p) => p.id === c?.playerId);
    return room && player ? { room, player } : null;
  }

  private hostContext(conn: string): Ack<Room> {
    const ctx = this.context(conn);
    if (!ctx) return fail(RoomError.NotInRoom);
    if (ctx.player.id !== ctx.room.hostId) return fail(RoomError.NotHost);
    return ok(ctx.room);
  }

  private removeFromRoom(room: Room, playerId: PlayerId): void {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    if (player.connectionId !== null) this.connections.delete(player.connectionId);
    room.players = room.players.filter((p) => p.id !== playerId);

    if (room.players.length === 0) {
      this.deleteRoom(room);
      return;
    }
    if (room.hostId === playerId) this.transferHost(room);
    if (room.status === 'playing') {
      room.state = removePlayer(room.game, room.state, playerId, this.deps.now());
      this.reschedule(room);
    }
    this.publish(room);
  }

  private transferHost(room: Room): void {
    const next = room.players.find((p) => p.connectionId !== null) ?? room.players[0];
    if (next) room.hostId = next.id;
    this.deps.scheduler.clear(`host:${room.code}`);
  }

  private handOverOfflineHost(code: string): void {
    const room = this.rooms.get(code);
    const host = room?.players.find((p) => p.id === room.hostId);
    if (!room || !host || host.connectionId !== null) return;
    const next = room.players.find((p) => p.connectionId !== null);
    if (!next) return;
    room.hostId = next.id;
    this.publish(room);
  }

  private reapIdle(code: string): void {
    const room = this.rooms.get(code);
    if (room && room.players.every((p) => p.connectionId === null)) this.deleteRoom(room);
  }

  private deleteRoom(room: Room): void {
    for (const key of ['deadline', 'host', 'idle'])
      this.deps.scheduler.clear(`${key}:${room.code}`);
    for (const p of room.players)
      if (p.connectionId !== null) this.connections.delete(p.connectionId);
    this.rooms.delete(room.code);
  }

  /** ตั้ง timer ของห้องใหม่จาก deadline ล่าสุดของเกม */
  private reschedule(room: Room): void {
    const key = `deadline:${room.code}`;
    this.deps.scheduler.clear(key);
    if (room.status !== 'playing') return;
    const deadline = getDeadline(room.game, room.state);
    if (deadline === null) return;
    this.deps.scheduler.set(key, Math.max(0, deadline - this.deps.now()), () =>
      this.onDeadline(room.code),
    );
  }

  private onDeadline(code: string): void {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const next = fireDeadline(room.game, room.state, this.deps.now());
    if (next !== room.state) {
      room.state = next;
      this.publish(room);
    }
    this.reschedule(room);
  }

  private roomStateMessage(room: Room): RoomStateMessage {
    return {
      code: room.code,
      gameId: room.game.id,
      hostId: room.hostId,
      status: room.status,
      options: room.options,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        online: p.connectionId !== null,
      })),
      serverNow: this.deps.now(),
    };
  }

  private publishRoomState(room: Room): void {
    const msg = this.roomStateMessage(room);
    for (const p of room.players) {
      if (p.connectionId !== null) this.deps.transport.send(p.connectionId, 'room:state', msg);
    }
  }

  /** room:state ให้ทุกคน + game:view แยกรายคน (กฎข้อ 2: ห้าม broadcast state เดียว) */
  private publish(room: Room): void {
    this.publishRoomState(room);
    if (room.status !== 'playing') return;
    const online = room.players.filter((p) => p.connectionId !== null);
    const views = viewsFor(
      room.game,
      room.state,
      online.map((p) => p.id),
    );
    const serverNow = this.deps.now();
    for (const p of online) {
      this.deps.transport.send(p.connectionId as string, 'game:view', {
        view: views.get(p.id),
        serverNow,
      });
    }
  }
}
