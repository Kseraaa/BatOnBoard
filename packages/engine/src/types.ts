import type { ZodType } from 'zod';

export type PlayerId = string;

export interface Rng {
  /** ตัวเลขสุ่มใน [0, 1) */
  next(): number;
  /** จำนวนเต็มใน [0, maxExclusive) */
  int(maxExclusive: number): number;
  /** คืน array ใหม่ที่สลับลำดับแล้ว ไม่แก้ array เดิม */
  shuffle<T>(items: readonly T[]): T[];
}

/** ข้อมูลระดับห้องที่เกมใช้ตรวจสิทธิ์ได้ แต่ไม่ได้เป็นเจ้าของ */
export interface ActionContext {
  hostId: PlayerId;
}

/** ข้อมูลระดับห้องตอนเริ่มเกม */
export interface SetupContext {
  /** host ที่ไม่ได้ร่วมเล่นแต่ดำเนินเกม (ดู `hostModerates`) — null = host เล่นด้วย */
  moderator: PlayerId | null;
}

/**
 * สัญญาที่ทุกเกมต้องทำตาม โค้ดใน implementation ต้องบริสุทธิ์:
 * ห้ามใช้ Math.random / Date.now ให้ใช้ rng และ now ที่ถูกส่งเข้ามา
 *
 * ข้อความ error ที่ validate คืนให้เป็นรหัส (เช่น 'not-host') เพื่อให้ client แปลภาษาเอง
 */
export interface GameDefinition<State, Action, View, Options = unknown> {
  id: string;
  minPlayers: number;
  maxPlayers: number;
  /** ตรวจ payload ของ action จาก client */
  actionSchema: ZodType<Action>;
  /** ตรวจตั้งค่าห้องจาก client (กฎข้อ 5: ห้ามเชื่อ input จาก client) */
  optionsSchema: ZodType<Options>;
  defaultOptions: Options;
  /** `players` ไม่รวม host เมื่อ `hostModerates` เป็นจริง (host อยู่ใน `ctx.moderator` แทน) */
  setup(players: PlayerId[], options: Options, rng: Rng, now: number, ctx?: SetupContext): State;
  validate(state: State, action: Action, by: PlayerId, ctx: ActionContext): string | null;
  apply(state: State, action: Action, by: PlayerId, now: number, rng: Rng): State;
  /** ตัดข้อมูลลับออก ผลลัพธ์ต้อง serialize เป็น JSON ได้ */
  playerView(state: State, viewer: PlayerId): View;
  /** เวลา (ms epoch) ที่ server ต้องปลุกเกม หรือ null ถ้าไม่มี */
  nextDeadline?(state: State): number | null;
  onDeadline?(state: State, now: number): State;
  /** ผู้เล่นถูกเตะหรือออกกลางเกม */
  onPlayerLeave?(state: State, player: PlayerId, now: number): State;
  isOver(state: State): boolean;
  /**
   * true = host ไม่ร่วมเล่น เป็นผู้ดำเนินเกม (เช่น ครูที่ขึ้นจอให้นักเรียนเล่น)
   * ห้องจึงรับคนได้ maxPlayers + 1 และนับจำนวนผู้เล่นโดยไม่รวม host
   * เกมเป็นคนตัดสินว่า host เห็นอะไรผ่าน playerView และทำ action ไหนได้ผ่าน validate
   */
  hostModerates?(options: Options): boolean;
  /**
   * บอททดสอบ: เลือก action ถัดไปจาก view ของบอทเอง (เห็นเท่าผู้เล่นคนหนึ่ง โกงไม่ได้)
   * คืน null = ยังไม่ทำอะไร · ไม่มี method นี้ = เกมนี้เพิ่มบอทไม่ได้
   * action ที่คืนยังผ่าน actionSchema → validate เหมือนของผู้เล่นจริง
   */
  bot?(view: View, rng: Rng, now: number): Action | null;
}

/**
 * GameDefinition ที่ไม่ระบุ type ใช้เก็บใน registry
 * (method ใน interface เป็น bivariant จึงรับ GameDefinition ของเกมใดก็ได้)
 */
export type AnyGameDefinition = GameDefinition<unknown, unknown, unknown, unknown>;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** รหัส error ที่ engine คืนเอง (ของเกมแต่ละเกมกำหนดเองใน validate) */
export const EngineError = {
  InvalidAction: 'invalid-action',
  InvalidOptions: 'invalid-options',
  TooFewPlayers: 'too-few-players',
  TooManyPlayers: 'too-many-players',
  DuplicatePlayers: 'duplicate-players',
  GameOver: 'game-over',
} as const;
