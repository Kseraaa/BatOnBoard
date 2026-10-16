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

export const joinRoomSchema = z.object({
  code: roomCodeSchema,
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
  serverNow: number;
}

export interface GameViewMessage<View = unknown> {
  view: View;
  /** เวลาของ server ตอนส่ง ให้ client ชดเชยนาฬิกาเครื่องตอนนับถอยหลัง */
  serverNow: number;
}

export interface ErrorMessage {
  code: string;
}

export type KickedReason = 'kicked' | 'replaced';

export interface JoinedMessage {
  code: string;
  playerId: string;
  /** เก็บไว้ฝั่ง client ใช้กลับเข้าห้องเดิม — เป็นความลับของผู้เล่นคนนี้ */
  token: string;
}

export type Ack<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
export type AckFn<T = undefined> = (res: Ack<T>) => void;

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack?: AckFn<JoinedMessage>) => void;
  'room:join': (payload: JoinRoomPayload, ack?: AckFn<JoinedMessage>) => void;
  'room:leave': (ack?: AckFn) => void;
  'room:settings': (payload: SettingsPayload, ack?: AckFn) => void;
  'room:start': (ack?: AckFn) => void;
  'room:lobby': (ack?: AckFn) => void;
  'room:kick': (payload: KickPayload, ack?: AckFn) => void;
  'game:action': (payload: unknown, ack?: AckFn) => void;
}

export interface ServerToClientEvents {
  'room:state': (msg: RoomStateMessage) => void;
  'room:kicked': (msg: { reason: KickedReason }) => void;
  'game:view': (msg: GameViewMessage) => void;
  error: (msg: ErrorMessage) => void;
}

/** รหัส error ระดับห้อง (ของ engine และเกมมีรหัสของตัวเอง) */
export const RoomError = {
  InvalidPayload: 'invalid-payload',
  UnknownGame: 'unknown-game',
  RoomNotFound: 'room-not-found',
  RoomFull: 'room-full',
  NameTaken: 'name-taken',
  NotInRoom: 'not-in-room',
  AlreadyInRoom: 'already-in-room',
  NotHost: 'not-host',
  NotInLobby: 'not-in-lobby',
  NotPlaying: 'not-playing',
  NotAParticipant: 'not-a-participant',
  PlayerNotFound: 'player-not-found',
  CannotKickSelf: 'cannot-kick-self',
} as const;
