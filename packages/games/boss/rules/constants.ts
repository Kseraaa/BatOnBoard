/** ค่าคงที่ของกติกา — แยกไฟล์ไว้ให้ client import ได้โดยไม่ลาก zod ไปด้วย */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

/** ตระกูลนักลงทุน 6 ตระกูล (id กลาง ๆ ชื่อและสีที่แสดงอยู่ใน data) */
export const FAMILIES = ['red', 'blue', 'yellow', 'purple', 'orange', 'green'] as const;

/** จำนวนช่องบนกระดาน (ดีลปิดได้สูงสุด 15 จึงมีช่องว่างเหลือเสมอ) */
export const BOARD_SIZE = 16;
export const DIE_FACES = 6;

/** เกมเต็มจบที่ดีลที่ 15 เกมสั้นจบที่ 10 */
export const FULL_GAME_DEALS = 15;
export const SHORT_GAME_DEALS = 10;
/** ทอยสุ่มจบเกมหลังดีลเท่านี้ดีลสุดท้ายก่อนจบแน่นอน (เกมเต็ม: หลังดีลที่ 10–14) */
export const END_ROLL_DEALS = 5;

export const START_HAND = 5;
export const DRAW_COUNT = 3;
export const HAND_LIMIT = 12;

/** ไพ่ในกอง: ตระกูลละ 4 ใบ (24) + ไปเที่ยว ตระกูลละ 3 + ใช้กับใครก็ได้ 3 (21) + ซื้อตัว 33 + ยึดดีล 10 + เบรก 10 = 98 */
export const CLAN_PER_FAMILY = 4;
export const TRAVEL_PER_FAMILY = 3;
export const TRAVEL_ANY = 3;
export const RECRUIT_CARDS = 33;
export const TAKEOVER_CARDS = 10;
export const STOP_CARDS = 10;

/** เวลาเจรจาต่อดีล (host ปรับได้ หรือ null = ไม่จำกัด) */
export const DEFAULT_NEGOTIATION_MS = 5 * 60_000;
export const MIN_NEGOTIATION_MS = 60_000;
export const MAX_NEGOTIATION_MS = 30 * 60_000;
/** ทุกคนตกลงแล้ว นับถอยหลังเท่านี้ก่อนปิดดีล — โอกาสสุดท้ายให้ลงไพ่หรือเปลี่ยนใจ */
export const CLOSE_MS = 5_000;
/** ไพ่ไปเที่ยว/ยึดดีล/ซื้อตัว รอเท่านี้ก่อนมีผล ให้คนอื่นลง "เบรก!" ทัน (poll ทุก ~1 วินาที) */
export const PENDING_MS = 6_000;
/** ไพ่ซื้อตัวต้องลงพร้อมกันเท่านี้ใบ */
export const RECRUIT_SET = 3;

/** รหัส error ที่ validate คืน — client แปลเป็นข้อความเอง */
export const BossError = {
  NotAPlayer: 'not-a-player',
  WrongPhase: 'wrong-phase',
  NotYourTurn: 'not-your-turn',
  NotBoss: 'not-boss',
  SpaceClosed: 'space-closed',
  NotInHand: 'not-in-hand',
  NotAClanCard: 'not-a-clan-card',
  FamilyNotInDeal: 'family-not-in-deal',
  InvalidPlan: 'invalid-plan',
  SourceUnavailable: 'source-unavailable',
  SharesTooHigh: 'shares-too-high',
  NoPlan: 'no-plan',
  NotParticipant: 'not-participant',
  CardPending: 'card-pending',
  NothingToStop: 'nothing-to-stop',
  WrongCard: 'wrong-card',
  InvalidTarget: 'invalid-target',
  AlreadyBoss: 'already-boss',
  RecruitFromPool: 'recruit-from-pool',
  InvalidDiscard: 'invalid-discard',
} as const;

export type BossErrorCode = (typeof BossError)[keyof typeof BossError];
