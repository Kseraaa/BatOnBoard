import type { PlayerId } from '@batonboard/engine';
import type { FAMILIES } from './constants';

export type Family = (typeof FAMILIES)[number];

/**
 * id ไพ่: `clan-<ตระกูล>-<n>`, `travel-<ตระกูล|any>-<n>`, `recruit-<n>`, `takeover-<n>`, `stop-<n>`
 * แต่ละใบมี id ไม่ซ้ำ จึงใช้ตรวจข้อมูลรั่วด้วยการค้นข้อความได้
 */
export type CardId = string;
export type CardKind = 'clan' | 'travel' | 'recruit' | 'takeover' | 'stop';

/** ช่องดีลบนกระดาน: ตระกูลที่ต้องมีทุกตระกูล + เลือกอีก `count` ตระกูลจาก `from` */
export interface SpaceDef {
  id: string;
  shares: number;
  required: Family[];
  optional: { from: Family[]; count: number } | null;
}

export interface BossConfig {
  boardId: string;
  /** 16 ช่อง ตามเข็มนาฬิกา */
  spaces: SpaceDef[];
  /** ราคาหุ้นของดีลที่ 1–15 (ดีลที่ n จ่าย dealValues[n-1] × shares) */
  dealValues: number[];
  /**
   * หน้าลูกเต๋าที่ทำให้เกมจบ หลังดีลที่ (จบแน่นอน - 5) ถึง (จบแน่นอน - 1)
   * เช่นเกมเต็ม: endFaces[0] ใช้หลังดีลที่ 10 … endFaces[4] หลังดีลที่ 14
   */
  endFaces: number[][];
}

export type GameLength = 'full' | 'short';

export interface BossOptions {
  /** null = ไม่จำกัดเวลาเจรจา */
  negotiationMs: number | null;
  length: GameLength;
  /**
   * ชื่อตระกูลที่ host ตั้งเอง (ไม่ใส่ = ใช้ชื่อจากกระดาน) แสดงผลอย่างเดียว กติกาไม่ใช้
   * optional เพื่อให้ห้องเก่ายังใช้ได้
   */
  familyNames?: Partial<Record<Family, string>>;
}

/**
 * - `turn`: เจ้าของเทิร์นเลือกทอย หรือประกาศดีลที่ช่องปัจจุบัน
 * - `moved`: ทอยแล้ว เลือกประกาศดีลที่ช่องใหม่ หรือจั่วไพ่
 * - `discard`: จั่วแล้วไพ่เกิน 12 ใบ ต้องทิ้งให้เหลือ 12 ก่อนจบเทิร์น
 * - `deal`: กำลังเจรจา
 * - `ended`: จบเกม
 */
export type Phase = 'turn' | 'moved' | 'discard' | 'deal' | 'ended';

/** ใครเป็นคนใส่ตระกูลนั้นในดีล: นักลงทุนถาวร หรือไพ่ตระกูลที่วางบนโต๊ะ */
export type SlotSource = 'investor' | CardId;

export interface Plan {
  slots: { family: Family; source: SlotSource }[];
  /** ส่วนแบ่งของผู้ร่วมดีลแต่ละคน บอสได้ส่วนที่เหลือ */
  shares: Record<PlayerId, number>;
}

/** เป้าของไพ่ไปเที่ยว: นักลงทุนถาวรของตระกูลนั้น หรือไพ่ตระกูลบนโต๊ะ */
export interface TravelTarget {
  family: Family;
  source: SlotSource;
}

/** ไพ่ที่ลงแล้วแต่ยังไม่มีผล รอให้คนอื่นลง "เบรก!" ได้จนถึง `until` */
export type PendingPlay = { by: PlayerId; cards: CardId[]; until: number } & (
  | { kind: 'travel'; target: TravelTarget }
  | { kind: 'takeover' }
  | { kind: 'recruit'; family: Family }
);

/** ไพ่ที่ตัดสินแล้วล่าสุด (client ใช้ทำข่าวและอนิเมชัน) */
export type PlayResult = PendingPlay & {
  seq: number;
  /** `fizzled` = เป้าหายไปก่อนมีผล เช่น ไพ่ตระกูลถูกส่งไปเที่ยวก่อน */
  outcome: 'resolved' | 'stopped' | 'fizzled';
  stoppedBy: PlayerId | null;
};

export interface Deal {
  space: number;
  boss: PlayerId;
  /** ไพ่ตระกูลที่วางบนโต๊ะ — อยู่จนจบดีลแม้ไม่ได้ใช้ */
  offered: { card: CardId; by: PlayerId }[];
  /** ตระกูลที่นักลงทุนถาวรถูกส่งไปเที่ยว ใช้ในดีลนี้ไม่ได้ */
  away: Family[];
  pending: PendingPlay | null;
  plan: Plan | null;
  /** คำตอบของผู้ร่วมดีลต่อแผนล่าสุด */
  responses: Record<PlayerId, boolean>;
  /** หมดเวลาเจรจา = ดีลล่ม (null = ไม่จำกัด) */
  deadline: number | null;
  /** ทุกคนตกลงแล้ว ปิดดีลเมื่อถึงเวลานี้ */
  closeAt: number | null;
  /** แต้มทอยสุ่มจบเกมของดีลนี้ สุ่มไว้ตอนประกาศ (onDeadline ไม่มี rng) — ลับจนปิดดีล */
  endRoll: number;
}

export interface Roll {
  value: number;
  /** เพิ่มทุกครั้งที่ทอย client ใช้รู้ว่าต้องเล่นอนิเมชันใหม่ */
  seq: number;
  by: PlayerId;
  kind: 'move' | 'end';
}

export type EndReason = 'last-deal' | 'end-roll' | 'not-enough-players';

export interface BossResult {
  reason: EndReason;
  /** คนที่เงินมากสุด (เสมอได้หลายคน) */
  winners: PlayerId[];
}

export type DealOutcome =
  | {
      kind: 'closed';
      space: number;
      boss: PlayerId;
      payout: number;
      /** เงินที่แต่ละคนได้ รวมบอส */
      paid: Record<PlayerId, number>;
    }
  | {
      kind: 'broken';
      space: number;
      boss: PlayerId;
      reason: 'abandoned' | 'time-up' | 'boss-left';
    };

export interface BossState {
  phase: Phase;
  /** ลำดับที่นั่ง — คนถัดไปทางซ้ายคือ index + 1 */
  players: PlayerId[];
  current: PlayerId;
  marker: number;
  closed: number[];
  dealsDone: number;
  maxDeals: number;
  negotiationMs: number | null;
  investors: Record<Family, PlayerId | null>;
  hands: Record<PlayerId, CardId[]>;
  deck: CardId[];
  discard: CardId[];
  money: Record<PlayerId, number>;
  deal: Deal | null;
  lastRoll: Roll | null;
  lastDeal: DealOutcome | null;
  lastPlay: PlayResult | null;
  /**
   * ไพ่ซื้อตัวที่ลงตอนไพ่เกิน 12 ใบ (phase `discard`) รอเบรกเหมือนในดีล
   * (ในดีลใช้ `deal.pending`) optional เพื่อให้ห้องที่เล่นค้างอยู่ก่อนอัปเดตยังใช้ได้
   */
  pending?: PendingPlay | null;
  result: BossResult | null;
}

export type BossAction =
  | { type: 'ROLL' }
  | { type: 'DECLARE' }
  | { type: 'DRAW' }
  | { type: 'DISCARD'; cards: CardId[] }
  | { type: 'OFFER_CLAN'; card: CardId }
  | { type: 'PROPOSE'; plan: Plan }
  | { type: 'RESPOND'; agree: boolean }
  | { type: 'ABANDON' }
  | { type: 'PLAY_TRAVEL'; card: CardId; target: TravelTarget }
  | { type: 'PLAY_TAKEOVER'; card: CardId }
  | { type: 'PLAY_RECRUIT'; cards: CardId[]; family: Family }
  | { type: 'PLAY_STOP'; card: CardId };

export interface DealView {
  space: number;
  boss: PlayerId;
  offered: { card: CardId; by: PlayerId }[];
  away: Family[];
  pending: PendingPlay | null;
  plan: Plan | null;
  responses: Record<PlayerId, boolean>;
  deadline: number | null;
  closeAt: number | null;
  /** ราคาหุ้น × จำนวนหุ้น */
  payout: number;
}

export interface BossView {
  phase: Phase;
  me: PlayerId;
  boardId: string;
  players: PlayerId[];
  current: PlayerId;
  marker: number;
  closed: number[];
  dealsDone: number;
  maxDeals: number;
  /** ราคาหุ้นของดีลถัดไป (null เมื่อจบเกม) */
  price: number | null;
  investors: Record<Family, PlayerId | null>;
  /** ไพ่บนมือของตัวเอง (ผู้ชมได้ []) */
  hand: CardId[];
  handCounts: Record<PlayerId, number>;
  deckCount: number;
  discardCount: number;
  money: Record<PlayerId, number>;
  deal: DealView | null;
  lastRoll: Roll | null;
  lastDeal: DealOutcome | null;
  lastPlay: PlayResult | null;
  /** ไพ่ซื้อตัวที่รอผลนอกดีล (ตอนไพ่เกิน 12 ใบ) */
  pending: PendingPlay | null;
  result: BossResult | null;
}
