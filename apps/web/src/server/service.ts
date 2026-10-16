import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createRegistry } from '@batonboard/engine';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@batonboard/protocol';
import { MemoryRoomStore, ROOM_TTL_SECONDS, RoomService } from '@batonboard/rooms';
import type { IdSource, RoomStore } from '@batonboard/rooms';
import { spyfall } from '@batonboard/spyfall';
import { UpstashRoomStore } from './upstash-store';

/**
 * ที่เดียวฝั่ง server ของเว็บที่อ้างถึงเกม — เพิ่มเกมใหม่ด้วยการ register ที่นี่
 * (กฎข้อ 4: platform ไม่รู้จักกติกาเกม)
 */
function createGameRegistry() {
  const registry = createRegistry();
  registry.register(spyfall);
  return registry;
}

/** id จริงจาก crypto — token ต้องเดายาก เพราะใช้แทนรหัสผ่านของผู้เล่น */
const cryptoIds: IdSource = {
  roomCode: () =>
    Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
    ).join(''),
  playerId: () => randomBytes(6).toString('base64url'),
  token: () => randomBytes(24).toString('base64url'),
  seed: () => randomInt(2 ** 32),
  hash: (token) => createHash('sha256').update(token).digest('base64url'),
};

function createStore(): RoomStore {
  const upstash = UpstashRoomStore.fromEnv(ROOM_TTL_SECONDS);
  if (upstash) return upstash;
  // บน Vercel แต่ละ request อาจไปคนละเครื่อง เก็บในหน่วยความจำไม่ได้
  if (process.env.VERCEL && process.env.ROOM_STORE !== 'memory') {
    throw new Error('ต้องตั้ง Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN) ก่อน deploy');
  }
  return new MemoryRoomStore(ROOM_TTL_SECONDS * 1000);
}

// dev server ของ Next โหลด module ใหม่ได้หลายรอบ เก็บไว้ที่ globalThis ให้ทุก route ใช้ตัวเดียวกัน
const globalForRooms = globalThis as unknown as { __batonboardRooms?: RoomService };

export function getRoomService(): RoomService {
  globalForRooms.__batonboardRooms ??= new RoomService({
    store: createStore(),
    registry: createGameRegistry(),
    ids: cryptoIds,
    now: Date.now,
  });
  return globalForRooms.__batonboardRooms;
}
