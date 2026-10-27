import {
  botAction,
  createRng,
  dispatchAction,
  EngineError,
  fireDeadline,
  getDeadline,
  removePlayer,
  roomCapacity,
  startGame,
} from '@batonboard/engine';
import type { AnyGameDefinition, GameRegistry, PlayerId, Rng } from '@batonboard/engine';
import {
  addBotSchema,
  createRoomSchema,
  joinRoomSchema,
  kickSchema,
  RoomError,
  settingsSchema,
} from '@batonboard/protocol';
import type { Ack, JoinedMessage, RoomSnapshot, RoomStatus } from '@batonboard/protocol';

/** ไม่ได้ยินจากผู้เล่นนานเกินนี้ = ออฟไลน์ */
export const OFFLINE_AFTER_MS = 15_000;
/** อัปเดตเวลาล่าสุดที่เห็นผู้เล่นไม่บ่อยกว่านี้ (ลดการเขียนลง store) */
export const TOUCH_EVERY_MS = 5_000;
/** host ออฟไลน์นานเกินนี้ โอนสิทธิ์ให้คนที่ออนไลน์ */
export const HOST_GRACE_MS = 30_000;
/** ห้องที่ไม่มีใครแตะนานเกินนี้หมดอายุ (store ตั้ง TTL ตามนี้) */
export const ROOM_TTL_SECONDS = 6 * 60 * 60;
const MAX_KICKED = 50;
/** บอทรอให้ห้องนิ่งนานเท่านี้ก่อนเล่น (คนดูทัน และไม่รัวจนกดอะไรไม่ได้) */
export const BOT_DELAY_MS = 1_500;

export interface StoredPlayer {
  id: PlayerId;
  name: string;
  /** เก็บแค่ hash ของ token — ถ้า store รั่ว ก็สวมรอยผู้เล่นไม่ได้ */
  tokenHash: string;
  lastSeen: number;
  /** บอททดสอบ: ไม่มี token (`tokenHash` ว่าง) server เล่นแทนใน tick ออนไลน์ตลอด ไม่เป็น host */
  bot?: true;
}

/** ห้องทั้งห้องเป็น JSON ก้อนเดียว เก็บใน store (Redis) ได้ตรง ๆ */
export interface Room {
  code: string;
  gameId: string;
  hostId: PlayerId;
  /** ลำดับการเข้าห้อง — ใช้เลือก host คนถัดไป */
  players: StoredPlayer[];
  options: unknown;
  status: RoomStatus;
  state: unknown;
  /** seed ลับของห้อง — rng ของแต่ละคำสั่งได้จาก seed + version */
  seed: number;
  /** เพิ่มทุกครั้งที่สิ่งที่ผู้เล่นเห็นเปลี่ยน — ใช้ทำ etag */
  version: number;
  /** เพิ่มทุกครั้งที่เขียนลง store (รวม touch) — ใช้ compare-and-set */
  rev: number;
  /** hash ของ token ที่ถูกเตะ — ใช้บอกผู้เล่นว่าโดนเตะ */
  kicked: string[];
  updatedAt: number;
}

export interface IdSource {
  roomCode(): string;
  playerId(): string;
  token(): string;
  seed(): number;
  hash(token: string): string;
}

export interface RoomEnv {
  registry: GameRegistry;
  ids: IdSource;
  now: number;
}

const ok = <T>(value: T): Ack<T> => ({ ok: true, value });
const fail = <T>(error: string): Ack<T> => ({ ok: false, error });

function gameOf(env: RoomEnv, room: Room): AnyGameDefinition {
  const game = env.registry.get(room.gameId);
  if (!game) throw new Error(`room ${room.code} uses unregistered game ${room.gameId}`);
  return game;
}

/** rng ของคำสั่งนี้ — กำหนดได้จาก seed และ version จึงซ้ำได้และไม่ต้องเก็บสถานะ rng */
function rngFor(room: Room): Rng {
  return createRng((room.seed ^ Math.imul(room.version + 1, 0x9e3779b1)) >>> 0);
}

function bump(env: RoomEnv, room: Room, patch: Partial<Room>): Room {
  return { ...room, ...patch, version: room.version + 1, updatedAt: env.now };
}

export const isOnline = (p: StoredPlayer, now: number) =>
  p.bot === true || now - p.lastSeen < OFFLINE_AFTER_MS;

/** คนจริงที่ออนไลน์ (รับ host ต่อได้) */
const canHost = (p: StoredPlayer, now: number) => p.bot !== true && isOnline(p, now);

export function createRoom(
  env: RoomEnv,
  payload: unknown,
): Ack<{ room: Room; joined: JoinedMessage }> {
  const parsed = createRoomSchema.safeParse(payload);
  if (!parsed.success) return fail(RoomError.InvalidPayload);
  const game = env.registry.get(parsed.data.gameId);
  if (!game) return fail(RoomError.UnknownGame);

  const token = env.ids.token();
  const player: StoredPlayer = {
    id: env.ids.playerId(),
    name: parsed.data.name,
    tokenHash: env.ids.hash(token),
    lastSeen: env.now,
  };
  const room: Room = {
    code: env.ids.roomCode(),
    gameId: game.id,
    hostId: player.id,
    players: [player],
    options: game.defaultOptions,
    status: 'lobby',
    state: null,
    seed: env.ids.seed(),
    version: 1,
    rev: 0,
    kicked: [],
    updatedAt: env.now,
  };
  return ok({ room, joined: { code: room.code, playerId: player.id, token } });
}

/** เข้าห้อง — token ตรงกับผู้เล่นในห้อง = กลับเข้าเป็นคนเดิม ไม่งั้นเป็นผู้เล่นใหม่ */
export function joinRoom(
  env: RoomEnv,
  room: Room,
  payload: unknown,
): Ack<{ room: Room; joined: JoinedMessage }> {
  const parsed = joinRoomSchema.safeParse(payload);
  if (!parsed.success) return fail(RoomError.InvalidPayload);
  const { name, token } = parsed.data;

  if (token !== undefined) {
    const hash = env.ids.hash(token);
    const existing = room.players.find((p) => p.tokenHash === hash);
    if (existing) {
      const next = bump(env, room, {
        players: room.players.map((p) => (p === existing ? { ...p, lastSeen: env.now } : p)),
      });
      return ok({ room: next, joined: { code: room.code, playerId: existing.id, token } });
    }
  }

  const game = gameOf(env, room);
  const full = checkRoomFor(game, room, name);
  if (full) return fail(full);

  const newToken = env.ids.token();
  const player: StoredPlayer = {
    id: env.ids.playerId(),
    name,
    tokenHash: env.ids.hash(newToken),
    lastSeen: env.now,
  };
  const next = bump(env, room, { players: [...room.players, player] });
  return ok({ room: next, joined: { code: room.code, playerId: player.id, token: newToken } });
}

/** ห้องเต็มหรือชื่อซ้ำ (ไม่สนตัวพิมพ์) */
function checkRoomFor(game: AnyGameDefinition, room: Room, name: string): string | null {
  if (room.players.length >= roomCapacity(game, room.options)) return RoomError.RoomFull;
  const lower = name.toLocaleLowerCase();
  return room.players.some((p) => p.name.toLocaleLowerCase() === lower)
    ? RoomError.NameTaken
    : null;
}

/** host เพิ่มบอททดสอบตอนอยู่ล็อบบี้ — เฉพาะเกมที่มี `bot` */
export function addBot(env: RoomEnv, room: Room, by: PlayerId, payload: unknown): Ack<Room> {
  const notHost = requireHost(room, by);
  if (notHost) return fail(notHost);
  if (room.status !== 'lobby') return fail(RoomError.NotInLobby);
  const parsed = addBotSchema.safeParse(payload);
  if (!parsed.success) return fail(RoomError.InvalidPayload);
  const game = gameOf(env, room);
  if (!game.bot) return fail(RoomError.BotsUnsupported);
  const full = checkRoomFor(game, room, parsed.data.name);
  if (full) return fail(full);
  const bot: StoredPlayer = {
    id: env.ids.playerId(),
    name: parsed.data.name,
    tokenHash: '',
    lastSeen: env.now,
    bot: true,
  };
  return ok(bump(env, room, { players: [...room.players, bot] }));
}

/** หาผู้เล่นจาก token */
export function authorize(env: RoomEnv, room: Room, token: string | null): Ack<StoredPlayer> {
  if (!token) return fail(RoomError.NotInRoom);
  const hash = env.ids.hash(token);
  const player = room.players.find((p) => p.bot !== true && p.tokenHash === hash);
  if (player) return ok(player);
  return fail(room.kicked.includes(hash) ? RoomError.Kicked : RoomError.NotInRoom);
}

/** บันทึกว่าเพิ่งเห็นผู้เล่น — คืน object เดิมถ้ายังไม่ต้องเขียน (ไม่เปลี่ยน version) */
export function touch(env: RoomEnv, room: Room, playerId: PlayerId): Room {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || env.now - player.lastSeen < TOUCH_EVERY_MS) return room;
  return {
    ...room,
    players: room.players.map((p) => (p === player ? { ...p, lastSeen: env.now } : p)),
  };
}

/**
 * งานที่ขึ้นกับเวลา ทำแบบ lazy ทุกครั้งที่มี request เข้ามา (ไม่มี timer บน serverless):
 * - เรียก onDeadline ของเกม "ณ เวลา deadline จริง" ทุกอันที่เลยมาแล้ว
 * - ให้บอทเล่น 1 action เมื่อห้องนิ่งมา BOT_DELAY_MS แล้ว
 * - โอน host ที่ออฟไลน์นานเกิน HOST_GRACE_MS
 */
export function tick(env: RoomEnv, room: Room): Room {
  let next = room;

  if (next.status === 'playing') {
    const game = gameOf(env, next);
    // จำกัดรอบกันวนไม่จบถ้าเกมตั้ง deadline ผิด
    for (let i = 0; i < 20; i++) {
      const deadline = getDeadline(game, next.state);
      if (deadline === null || deadline > env.now) break;
      const state = fireDeadline(game, next.state, deadline);
      if (state === next.state) break;
      next = bump(env, next, { state });
    }
    next = runBots(env, next, game);
  }

  const host = next.players.find((p) => p.id === next.hostId);
  if (host && env.now - host.lastSeen > HOST_GRACE_MS) {
    const heir = next.players.find((p) => p.id !== host.id && canHost(p, env.now));
    if (heir) next = bump(env, next, { hostId: heir.id });
  }
  return next;
}

/** บอทคนแรก (ตามลำดับเข้าห้อง) ที่มี action ที่ผ่าน validate ได้เล่น 1 action */
function runBots(env: RoomEnv, room: Room, game: AnyGameDefinition): Room {
  if (env.now - room.updatedAt < BOT_DELAY_MS) return room;
  // ผสมเวลาเข้าไปด้วย ไม่งั้นห้องที่ไม่เปลี่ยนได้ rng เดิมทุก tick บอทจะตัดสินใจเหมือนเดิมตลอด
  const rng = createRng((rngFor(room).int(0x7fffffff) ^ env.now) >>> 0);
  for (const bot of room.players) {
    if (bot.bot !== true) continue;
    const payload = botAction(game, room.state, bot.id, rng, env.now);
    if (payload === null) continue;
    const res = dispatchAction(
      game,
      room.state,
      payload,
      bot.id,
      { hostId: room.hostId },
      env.now,
      rngFor(room),
    );
    if (res.ok) return bump(env, room, { state: res.value });
  }
  return room;
}

/** ผู้เล่นออกเอง — คืน null ถ้าห้องว่าง (ลบห้อง) */
export function leave(env: RoomEnv, room: Room, playerId: PlayerId): Room | null {
  return removeFromRoom(env, room, playerId, false);
}

function removeFromRoom(
  env: RoomEnv,
  room: Room,
  playerId: PlayerId,
  kicked: boolean,
): Room | null {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return room;
  const players = room.players.filter((p) => p.id !== playerId);
  // เหลือแต่บอท = ไม่มีใครเล่นแล้ว ลบห้อง
  const humans = players.filter((p) => p.bot !== true);
  if (humans.length === 0) return null;

  let hostId = room.hostId;
  if (hostId === playerId) {
    hostId = (humans.find((p) => canHost(p, env.now)) ?? humans[0])?.id ?? hostId;
  }
  const state =
    room.status === 'playing'
      ? removePlayer(gameOf(env, room), room.state, playerId, env.now)
      : room.state;
  return bump(env, room, {
    players,
    hostId,
    state,
    kicked:
      kicked && player.bot !== true
        ? [...room.kicked, player.tokenHash].slice(-MAX_KICKED)
        : room.kicked,
  });
}

function requireHost(room: Room, by: PlayerId): string | null {
  return room.hostId === by ? null : RoomError.NotHost;
}

export function kick(env: RoomEnv, room: Room, by: PlayerId, payload: unknown): Ack<Room> {
  const notHost = requireHost(room, by);
  if (notHost) return fail(notHost);
  const parsed = kickSchema.safeParse(payload);
  if (!parsed.success) return fail(RoomError.InvalidPayload);
  const target = room.players.find((p) => p.id === parsed.data.playerId);
  if (!target) return fail(RoomError.PlayerNotFound);
  if (target.id === by) return fail(RoomError.CannotKickSelf);
  // host ยังอยู่ ห้องจึงไม่มีทางว่าง
  return ok(removeFromRoom(env, room, target.id, true) as Room);
}

export function updateSettings(
  env: RoomEnv,
  room: Room,
  by: PlayerId,
  payload: unknown,
): Ack<Room> {
  const notHost = requireHost(room, by);
  if (notHost) return fail(notHost);
  if (room.status !== 'lobby') return fail(RoomError.NotInLobby);
  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) return fail(RoomError.InvalidPayload);
  const options = gameOf(env, room).optionsSchema.safeParse(parsed.data.options);
  if (!options.success) return fail(EngineError.InvalidOptions);
  return ok(bump(env, room, { options: options.data }));
}

export function start(env: RoomEnv, room: Room, by: PlayerId): Ack<Room> {
  const notHost = requireHost(room, by);
  if (notHost) return fail(notHost);
  if (room.status !== 'lobby') return fail(RoomError.NotInLobby);
  const res = startGame(
    gameOf(env, room),
    room.players.map((p) => p.id),
    room.options,
    rngFor(room),
    env.now,
    room.hostId,
  );
  if (!res.ok) return fail(res.error);
  return ok(bump(env, room, { status: 'playing', state: res.value }));
}

export function backToLobby(env: RoomEnv, room: Room, by: PlayerId): Ack<Room> {
  const notHost = requireHost(room, by);
  if (notHost) return fail(notHost);
  if (room.status !== 'playing') return fail(RoomError.NotPlaying);
  return ok(bump(env, room, { status: 'lobby', state: null }));
}

/** game:action → engine pipeline (schema → validate → apply) */
export function action(env: RoomEnv, room: Room, by: PlayerId, payload: unknown): Ack<Room> {
  if (room.status !== 'playing') return fail(RoomError.NotPlaying);
  const res = dispatchAction(
    gameOf(env, room),
    room.state,
    payload,
    by,
    { hostId: room.hostId },
    env.now,
    rngFor(room),
  );
  if (!res.ok) return fail(res.error);
  return ok(bump(env, room, { state: res.value }));
}

/** สิ่งที่ผู้เล่นคนนี้เห็น — view ผ่าน playerView ของเกมเสมอ (กฎข้อ 2) */
export function snapshot(env: RoomEnv, room: Room, viewer: PlayerId): RoomSnapshot {
  const online = room.players.map((p) => isOnline(p, env.now));
  return {
    // online เปลี่ยนได้โดยไม่ต้องเขียนห้อง จึงต้องอยู่ใน etag ด้วย
    etag: `${room.version}.${online.map((o) => (o ? 1 : 0)).join('')}.${viewer}`,
    room: {
      code: room.code,
      gameId: room.gameId,
      hostId: room.hostId,
      status: room.status,
      options: room.options,
      players: room.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        online: online[i] ?? false,
        bot: p.bot === true,
      })),
      botsAllowed: gameOf(env, room).bot !== undefined,
    },
    view: room.status === 'playing' ? gameOf(env, room).playerView(room.state, viewer) : null,
    serverNow: env.now,
  };
}
