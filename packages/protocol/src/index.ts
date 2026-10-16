/**
 * สัญญาการสื่อสารระหว่าง web กับ game server (Socket.IO)
 * ทุก payload จาก client ต้องผ่าน schema ในไฟล์นี้ก่อนใช้ (กฎข้อ 5)
 * ไฟล์นี้ไม่รู้จักเกมใดเกมหนึ่ง — view ของเกมเป็น generic
 */
import { z } from 'zod';

/** ตัด 0/O/1/I ที่สับสนง่าย */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_NAME_LENGTH = 20;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`));

export const playerNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(MAX_NAME_LENGTH));

const idSchema = z.string().min(1).max(64);

// ---- client → server ----

export const createRoomSchema = z.object({
  name: playerNameSchema,
  gameId: idSchema,
});

/** รหัสห้องอยู่ใน URL (`/api/rooms/<code>/join`) ตรวจด้วย roomCodeSchema แยก */
export const joinRoomSchema = z.object({
  name: playerNameSchema,
  /** token เดิมจากการเข้าห้องครั้งก่อน — ใช้กลับเข้าห้องเป็นผู้เล่นคนเดิม */
  token: z.string().min(1).max(128).optional(),
});

export const kickSchema = z.object({ playerId: idSchema });

/** options ตรวจละเอียดอีกชั้นด้วย optionsSchema ของเกม */
export const settingsSchema = z.object({ options: z.unknown() });

export type CreateRoomPayload = z.input<typeof createRoomSchema>;
export type JoinRoomPayload = z.input<typeof joinRoomSchema>;
export type KickPayload = z.input<typeof kickSchema>;
export type SettingsPayload = z.input<typeof settingsSchema>;

// ---- server → client ----

export type RoomStatus = 'lobby' | 'playing';

export interface RoomPlayer {
  id: string;
  name: string;
  online: boolean;
}

/** ข้อมูลสาธารณะของห้อง — ห้ามมี token หรือข้อมูลลับของเกม */
export interface RoomStateMessage {
  code: string;
  gameId: string;
  hostId: string;
  status: RoomStatus;
  options: unknown;
  players: RoomPlayer[];
}

/**
 * สิ่งที่ผู้เล่นคนหนึ่งเห็นตอนนี้ — ส่งเฉพาะให้เจ้าของ token (กฎข้อ 2)
 * etag เปลี่ยนเมื่อมีอะไรเปลี่ยน ให้ client ส่งกลับมาตอน poll เพื่อข้ามข้อมูลซ้ำ
 */
export interface RoomSnapshot<View = unknown> {
  etag: string;
  room: RoomStateMessage;
  /** playerView ของผู้เล่นคนนี้ — null ตอนอยู่ล็อบบี้ */
  view: View | null;
  /** เวลาของ server ตอนตอบ ให้ client ชดเชยนาฬิกาเครื่องตอนนับถอยหลัง */
  serverNow: number;
}

export interface JoinedMessage {
  code: string;
  playerId: string;
  /** เก็บไว้ฝั่ง client ใช้ยืนยันตัวตนทุก request — เป็นความลับของผู้เล่นคนนี้ */
  token: string;
}

export type Ack<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/**
 * HTTP API (Next.js route handlers ใน apps/web)
 * ทุก request ที่ต้องรู้ตัวผู้เล่นส่ง header `Authorization: Bearer <token>`
 * ทุกคำตอบเป็น Ack<T> ในรูป JSON
 */
export const api = {
  /** POST CreateRoomPayload → Ack<JoinedMessage> */
  create: () => '/api/rooms',
  /** POST JoinRoomPayload (+ token เดิมถ้ามี) → Ack<JoinedMessage> */
  join: (code: string) => `/api/rooms/${code}/join`,
  /** GET ?etag=<etag ล่าสุด> → Ack<RoomSnapshot | null> (null = ไม่มีอะไรเปลี่ยน) */
  poll: (code: string) => `/api/rooms/${code}`,
  /** POST → Ack<RoomSnapshot> ทุกคำสั่งด้านล่างคืน snapshot ล่าสุดให้ทันที */
  leave: (code: string) => `/api/rooms/${code}/leave`,
  settings: (code: string) => `/api/rooms/${code}/settings`,
  start: (code: string) => `/api/rooms/${code}/start`,
  lobby: (code: string) => `/api/rooms/${code}/lobby`,
  kick: (code: string) => `/api/rooms/${code}/kick`,
  action: (code: string) => `/api/rooms/${code}/action`,
} as const;

/** รหัส error ระดับห้อง (ของ engine และเกมมีรหัสของตัวเอง) */
export const RoomError = {
  InvalidPayload: 'invalid-payload',
  UnknownGame: 'unknown-game',
  RoomNotFound: 'room-not-found',
  RoomFull: 'room-full',
  NameTaken: 'name-taken',
  NotInRoom: 'not-in-room',
  Kicked: 'kicked',
  NotHost: 'not-host',
  NotInLobby: 'not-in-lobby',
  NotPlaying: 'not-playing',
  PlayerNotFound: 'player-not-found',
  CannotKickSelf: 'cannot-kick-self',
  Busy: 'busy',
} as const;
