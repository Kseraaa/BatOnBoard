import type {
  Ack,
  ClientToServerEvents,
  JoinedMessage,
  KickedReason,
  RoomStateMessage,
  ServerToClientEvents,
} from '@batonboard/protocol';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { storage } from './storage';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface RoomSnapshot {
  connected: boolean;
  /** ห้องที่ socket นี้เข้าอยู่ */
  code: string | null;
  playerId: string | null;
  room: RoomStateMessage | null;
  view: unknown;
  /** serverNow - เวลาเครื่อง ตอนได้รับข้อความล่าสุด */
  serverOffset: number;
  kicked: KickedReason | null;
}

const INITIAL: RoomSnapshot = {
  connected: false,
  code: null,
  playerId: null,
  room: null,
  view: null,
  serverOffset: 0,
  kicked: null,
};

const ACK_TIMEOUT_MS = 8_000;

/**
 * socket เดียวทั้งเว็บ — เปลี่ยนหน้าแล้วไม่หลุดห้อง
 * ใช้กับ useSyncExternalStore ผ่าน subscribe/getSnapshot
 */
export class RoomClient {
  private snapshot: RoomSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private socket: ClientSocket | null = null;
  /** ชื่อที่ใช้ตอน join ครั้งล่าสุด — ใช้ส่งซ้ำตอนต่อใหม่ */
  private lastName = '';

  constructor(private readonly url: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => INITIAL;

  private set(patch: Partial<RoomSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  private connect(): ClientSocket {
    if (this.socket) return this.socket;
    const socket: ClientSocket = io(this.url, { transports: ['websocket', 'polling'] });
    this.socket = socket;

    socket.on('connect', () => {
      this.set({ connected: true });
      // ต่อใหม่หลังเน็ตหลุด: กลับเข้าห้องเดิมด้วย token เดิม
      const { code } = this.snapshot;
      if (code && !this.snapshot.kicked) void this.join(code, this.lastName, true);
    });
    socket.on('disconnect', () => this.set({ connected: false }));
    socket.on('room:state', (room) => {
      this.set({
        room,
        serverOffset: room.serverNow - Date.now(),
        ...(room.status === 'lobby' ? { view: null } : {}),
      });
    });
    socket.on('game:view', (msg) => {
      this.set({ view: msg.view, serverOffset: msg.serverNow - Date.now() });
    });
    socket.on('room:kicked', ({ reason }) => {
      const { code } = this.snapshot;
      if (code && reason === 'kicked') storage.clearSession(code);
      this.set({ kicked: reason, room: null, view: null });
    });
    return socket;
  }

  private emit<T>(
    send: (socket: ClientSocket, ack: (res: Ack<T>) => void) => void,
  ): Promise<Ack<T>> {
    const socket = this.connect();
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, error: 'not-connected' }),
        ACK_TIMEOUT_MS,
      );
      send(socket, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }

  private remember(res: Ack<JoinedMessage>, name: string) {
    if (!res.ok) return;
    const { code, playerId, token } = res.value;
    storage.setSession(code, { token, playerId });
    this.lastName = name;
    this.set({ code, playerId, kicked: null });
  }

  async create(name: string, gameId: string): Promise<Ack<JoinedMessage>> {
    await this.leaveCurrent();
    const res = await this.emit<JoinedMessage>((s, ack) =>
      s.emit('room:create', { name, gameId }, ack),
    );
    this.remember(res, name);
    return res;
  }

  /** เข้าห้อง (หรือกลับเข้าห้องเดิมด้วย token ที่เก็บไว้) — เรียกซ้ำระหว่างรอได้ promise เดิม */
  join(code: string, name: string, isReconnect = false): Promise<Ack<JoinedMessage>> {
    const upper = code.toUpperCase();
    const pending = this.joining.get(upper);
    if (pending) return pending;
    const promise = this.doJoin(upper, name, isReconnect).finally(() => this.joining.delete(upper));
    this.joining.set(upper, promise);
    return promise;
  }

  private readonly joining = new Map<string, Promise<Ack<JoinedMessage>>>();

  private async doJoin(
    upper: string,
    name: string,
    isReconnect: boolean,
  ): Promise<Ack<JoinedMessage>> {
    if (!isReconnect && this.snapshot.code !== upper) await this.leaveCurrent();
    const session = storage.getSession(upper);
    const res = await this.emit<JoinedMessage>((s, ack) =>
      s.emit(
        'room:join',
        { code: upper, name: name || 'player', ...(session ? { token: session.token } : {}) },
        ack,
      ),
    );
    // already-in-room = socket นี้อยู่ห้องนี้แล้ว (เช่นเพิ่งสร้างห้อง)
    if (!res.ok && res.error === 'already-in-room' && this.snapshot.code === upper && session) {
      return { ok: true, value: { code: upper, ...session } };
    }
    this.remember(res, name);
    return res;
  }

  /** แท็บนี้ถูกแทนที่ — กดใช้แท็บนี้ต่อ */
  async reclaim(): Promise<Ack<JoinedMessage>> {
    const { code } = this.snapshot;
    if (!code) return { ok: false, error: 'not-in-room' };
    this.set({ kicked: null });
    const socket = this.connect();
    if (!socket.connected) socket.connect();
    return this.join(code, this.lastName, true);
  }

  private async leaveCurrent() {
    if (!this.snapshot.code) return;
    await this.emit((s, ack) => s.emit('room:leave', ack));
    this.set({ code: null, playerId: null, room: null, view: null });
  }

  async leave(): Promise<void> {
    const { code } = this.snapshot;
    await this.leaveCurrent();
    if (code) storage.clearSession(code);
  }

  start = () => this.emit((s, ack) => s.emit('room:start', ack));
  backToLobby = () => this.emit((s, ack) => s.emit('room:lobby', ack));
  updateSettings = (options: unknown) =>
    this.emit((s, ack) => s.emit('room:settings', { options }, ack));
  kick = (playerId: string) => this.emit((s, ack) => s.emit('room:kick', { playerId }, ack));
  action = (payload: unknown) => this.emit((s, ack) => s.emit('game:action', payload, ack));
}

let client: RoomClient | null = null;

export function getRoomClient(): RoomClient {
  client ??= new RoomClient(process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000');
  return client;
}
