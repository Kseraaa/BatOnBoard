import type { GameRegistry, PlayerId } from '@batonboard/engine';
import { RoomError } from '@batonboard/protocol';
import type { Ack, JoinedMessage, RoomSnapshot } from '@batonboard/protocol';
import * as R from './room';
import type { IdSource, Room, RoomEnv } from './room';
import type { RoomStore } from './store';

export interface RoomServiceDeps {
  store: RoomStore;
  registry: GameRegistry;
  ids: IdSource;
  now(): number;
}

const MAX_ATTEMPTS = 5;

type Op = (env: RoomEnv, room: Room, by: PlayerId) => Ack<Room>;

/**
 * ทุก request ทำแบบเดียวกัน: โหลดห้อง → tick (deadline/host) → ยืนยันตัวผู้เล่น → คำสั่ง
 * → เขียนกลับแบบ compare-and-set ถ้ามีคนเขียนก่อนก็โหลดใหม่แล้วทำซ้ำ
 * ไม่มี timer และไม่มี state ในหน่วยความจำ จึงรันบน serverless ได้
 */
export class RoomService {
  constructor(private readonly deps: RoomServiceDeps) {}

  private env(): RoomEnv {
    return { registry: this.deps.registry, ids: this.deps.ids, now: this.deps.now() };
  }

  async create(payload: unknown): Promise<Ack<JoinedMessage>> {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const res = R.createRoom(this.env(), payload);
      if (!res.ok) return res;
      if (await this.deps.store.create(res.value.room))
        return { ok: true, value: res.value.joined };
      // รหัสห้องชนกัน สุ่มใหม่
    }
    return { ok: false, error: RoomError.Busy };
  }

  join(code: string, payload: unknown): Promise<Ack<JoinedMessage>> {
    return this.mutate(code, (env, room) => {
      const res = R.joinRoom(env, room, payload);
      return res.ok ? { ok: true, value: { room: res.value.room, value: res.value.joined } } : res;
    });
  }

  /** etag ตรงกับของล่าสุด = ไม่มีอะไรเปลี่ยน คืน null */
  poll(code: string, token: string | null, etag: string | null): Promise<Ack<RoomSnapshot | null>> {
    return this.mutate(code, (env, room) => {
      const who = R.authorize(env, room, token);
      if (!who.ok) return who;
      const next = R.touch(env, room, who.value.id);
      const snap = R.snapshot(env, next, who.value.id);
      return { ok: true, value: { room: next, value: snap.etag === etag ? null : snap } };
    });
  }

  leave(code: string, token: string | null): Promise<Ack<null>> {
    return this.mutate(code, (env, room) => {
      const who = R.authorize(env, room, token);
      if (!who.ok) return who;
      return { ok: true, value: { room: R.leave(env, room, who.value.id), value: null } };
    });
  }

  settings = (code: string, token: string | null, payload: unknown) =>
    this.run(code, token, (env, room, by) => R.updateSettings(env, room, by, payload));
  start = (code: string, token: string | null) => this.run(code, token, R.start);
  backToLobby = (code: string, token: string | null) => this.run(code, token, R.backToLobby);
  kick = (code: string, token: string | null, payload: unknown) =>
    this.run(code, token, (env, room, by) => R.kick(env, room, by, payload));
  action = (code: string, token: string | null, payload: unknown) =>
    this.run(code, token, (env, room, by) => R.action(env, room, by, payload));

  /** คำสั่งของผู้เล่นที่ยืนยันตัวแล้ว — คืน snapshot ล่าสุดให้ทันทีไม่ต้องรอ poll */
  private run(code: string, token: string | null, op: Op): Promise<Ack<RoomSnapshot>> {
    return this.mutate(code, (env, room) => {
      const who = R.authorize(env, room, token);
      if (!who.ok) return who;
      const res = op(env, R.touch(env, room, who.value.id), who.value.id);
      if (!res.ok) return res;
      return {
        ok: true,
        value: { room: res.value, value: R.snapshot(env, res.value, who.value.id) },
      };
    });
  }

  private async mutate<T>(
    code: string,
    fn: (env: RoomEnv, room: Room) => Ack<{ room: Room | null; value: T }>,
  ): Promise<Ack<T>> {
    const upper = code.toUpperCase();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const loaded = await this.deps.store.get(upper);
      if (!loaded) return { ok: false, error: RoomError.RoomNotFound };
      const env = this.env();
      const ticked = R.tick(env, loaded);
      const res = fn(env, ticked);

      const next = res.ok ? res.value.room : ticked;
      if (next === loaded) return res.ok ? { ok: true, value: res.value.value } : res;

      const written = next === null ? null : { ...next, rev: loaded.rev + 1 };
      if (await this.deps.store.put(upper, written, loaded.rev)) {
        return res.ok ? { ok: true, value: res.value.value } : res;
      }
      // มีคนเขียนก่อน — โหลดใหม่แล้วทำซ้ำ
    }
    return { ok: false, error: RoomError.Busy };
  }
}
