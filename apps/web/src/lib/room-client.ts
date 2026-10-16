import { api } from '@batonboard/protocol';
import type { Ack, JoinedMessage, RoomSnapshot, RoomStateMessage } from '@batonboard/protocol';
import { storage } from './storage';

export interface RoomSnapshotState {
  /** คำขอล่าสุดถึง server สำเร็จไหม */
  connected: boolean;
  /** ห้องที่แท็บนี้อยู่ */
  code: string | null;
  playerId: string | null;
  room: RoomStateMessage | null;
  view: unknown;
  /** serverNow - เวลาเครื่อง (ชดเชยครึ่งหนึ่งของเวลาเดินทาง) */
  serverOffset: number;
  kicked: boolean;
  /** ห้องหายไประหว่างเล่น (หมดอายุหรือทุกคนออก) */
  lost: boolean;
}

const INITIAL: RoomSnapshotState = {
  connected: true,
  code: null,
  playerId: null,
  room: null,
  view: null,
  serverOffset: 0,
  kicked: false,
  lost: false,
};

/** ความถี่ poll ตอนเปิดหน้าจออยู่ / ตอนสลับไปแอปอื่น */
const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 1_000);
const HIDDEN_POLL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * สถานะห้องของแท็บนี้ — poll server เป็นระยะ (ไม่มี WebSocket เพราะรันบน Vercel)
 * ใช้กับ useSyncExternalStore ผ่าน subscribe/getSnapshot
 */
export class RoomClient {
  private snapshot: RoomSnapshotState = INITIAL;
  private readonly listeners = new Set<() => void>();
  private token: string | null = null;
  private etag: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private readonly joining = new Map<string, Promise<Ack<JoinedMessage>>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => INITIAL;

  private set(patch: Partial<RoomSnapshotState>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Ack<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(path, {
        method,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const ack = (await res.json()) as Ack<T>;
      if (!this.snapshot.connected) this.set({ connected: true });
      return ack;
    } catch {
      this.set({ connected: false });
      return { ok: false, error: 'not-connected' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private apply(snap: RoomSnapshot, sentAt: number) {
    const receivedAt = Date.now();
    this.etag = snap.etag;
    this.set({
      room: snap.room,
      view: snap.view,
      serverOffset: snap.serverNow - (sentAt + receivedAt) / 2,
    });
  }

  /** จัดการคำตอบที่บอกว่าเราไม่อยู่ในห้องแล้ว */
  private handleGone(error: string): boolean {
    if (error === 'kicked') {
      if (this.snapshot.code) storage.clearSession(this.snapshot.code);
      this.stopPolling();
      this.set({ kicked: true, room: null, view: null });
      return true;
    }
    if (error === 'room-not-found' || error === 'not-in-room') {
      this.stopPolling();
      this.set({ lost: true, room: null, view: null });
      return true;
    }
    return false;
  }

  // ---- polling ----

  private startPolling() {
    if (this.polling) return;
    this.polling = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    void this.poll();
  }

  private stopPolling() {
    this.polling = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  private onVisibility = () => {
    // กลับมาที่แท็บ — อัปเดตทันทีไม่ต้องรอรอบถัดไป
    if (document.visibilityState === 'visible' && this.polling) {
      if (this.timer) clearTimeout(this.timer);
      void this.poll();
    }
  };

  private poll = async () => {
    const code = this.snapshot.code;
    if (!this.polling || !code) return;
    const sentAt = Date.now();
    const query = this.etag ? `?etag=${encodeURIComponent(this.etag)}` : '';
    const res = await this.request<RoomSnapshot | null>('GET', `${api.poll(code)}${query}`);
    if (!this.polling || this.snapshot.code !== code) return;
    if (res.ok) {
      if (res.value) this.apply(res.value, sentAt);
    } else if (this.handleGone(res.error)) {
      return;
    }
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.timer = setTimeout(this.poll, hidden ? HIDDEN_POLL_MS : POLL_MS);
  };

  // ---- คำสั่ง ----

  private enter(joined: JoinedMessage) {
    storage.setSession(joined.code, { token: joined.token, playerId: joined.playerId });
    this.token = joined.token;
    this.etag = null;
    this.set({
      code: joined.code,
      playerId: joined.playerId,
      kicked: false,
      lost: false,
      room: null,
      view: null,
    });
    this.startPolling();
  }

  async create(name: string, gameId: string): Promise<Ack<JoinedMessage>> {
    this.stopPolling();
    const res = await this.request<JoinedMessage>('POST', api.create(), { name, gameId });
    if (res.ok) this.enter(res.value);
    return res;
  }

  /** เข้าห้อง หรือกลับเข้าห้องเดิมด้วย token ที่เก็บไว้ — เรียกซ้ำระหว่างรอได้ promise เดิม */
  join(code: string, name: string): Promise<Ack<JoinedMessage>> {
    const upper = code.toUpperCase();
    const pending = this.joining.get(upper);
    if (pending) return pending;
    const promise = this.doJoin(upper, name).finally(() => this.joining.delete(upper));
    this.joining.set(upper, promise);
    return promise;
  }

  private async doJoin(code: string, name: string): Promise<Ack<JoinedMessage>> {
    if (this.snapshot.code !== code) this.stopPolling();
    const session = storage.getSession(code);
    const res = await this.request<JoinedMessage>('POST', api.join(code), {
      name: name || 'player',
      ...(session ? { token: session.token } : {}),
    });
    if (res.ok) this.enter(res.value);
    return res;
  }

  async leave(): Promise<void> {
    const { code } = this.snapshot;
    if (!code) return;
    this.stopPolling();
    await this.request('POST', api.leave(code));
    storage.clearSession(code);
    this.token = null;
    this.set({ code: null, playerId: null, room: null, view: null });
  }

  /** คำสั่งที่ server ตอบกลับเป็น snapshot ล่าสุด — อัปเดตจอทันทีไม่ต้องรอ poll */
  private async command(path: (code: string) => string, body?: unknown): Promise<Ack<null>> {
    const { code } = this.snapshot;
    if (!code) return { ok: false, error: 'not-in-room' };
    const sentAt = Date.now();
    const res = await this.request<RoomSnapshot>('POST', path(code), body);
    if (res.ok) {
      this.apply(res.value, sentAt);
      return { ok: true, value: null };
    }
    this.handleGone(res.error);
    return res;
  }

  start = () => this.command(api.start);
  backToLobby = () => this.command(api.lobby);
  updateSettings = (options: unknown) => this.command(api.settings, { options });
  kick = (playerId: string) => this.command(api.kick, { playerId });
  action = (payload: unknown) => this.command(api.action, payload);
}

let client: RoomClient | null = null;

export function getRoomClient(): RoomClient {
  client ??= new RoomClient();
  return client;
}
