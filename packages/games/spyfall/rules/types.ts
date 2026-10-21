import type { PlayerId } from '@batonboard/engine';

/**
 * questioning → (หมดเวลาหรือ host กดเริ่ม) voting → (ทุกคนโหวตหรือหมดเวลา, เสมอ = โหวตใหม่หนึ่งครั้ง)
 * guessing (สายลับทายสถานที่) → reveal
 */
export type Phase = 'questioning' | 'voting' | 'guessing' | 'reveal';

/** สถานที่ในมุมของกติกา: แค่ id กับ id บทบาท ส่วนชื่อที่แสดงอยู่ใน data */
export interface LocationDef {
  id: string;
  roles: string[];
}

export interface SpyfallConfig {
  /** id ของชุดสถานที่ ส่งไปใน view ให้ client โหลดรายชื่อเองแบบ static */
  locationSetId: string;
  locations: LocationDef[];
}

/** สถานที่ที่ host พิมพ์เอง — ชื่อเป็นภาษาเดียวตามที่พิมพ์ */
export interface CustomLocation {
  /** custom-<เลข> ไม่ซ้ำกัน */
  id: string;
  name: string;
  /** 1–15 บทบาท แต่ละรอบสุ่มตามจำนวนคน ถ้าน้อยกว่าจำนวนคนจะวนซ้ำ */
  roles: string[];
}

export interface SpyfallOptions {
  /** เวลาช่วงถามตอบ (ms) */
  durationMs: number;
  /** id สถานที่ในชุดมาตรฐานที่ไม่ใช้ */
  disabled?: string[];
  custom?: CustomLocation[];
  /** จำนวนรอบต่อแมตช์ (นับคะแนนรวม) — ไม่ใส่ = เล่นไปเรื่อย ๆ ไม่จำกัด */
  rounds?: number;
}

export type WinReason =
  | 'caught-spy-guessed' // โหวตจับสายลับได้ แต่สายลับทายสถานที่ถูก → สายลับชนะ
  | 'caught' // โหวตจับสายลับได้ สายลับทายผิด → คนที่โหวตถูกชนะ
  | 'missed-spy-guessed' // โหวตผิด สายลับทายถูก → สายลับชนะ
  | 'missed' // โหวตผิด สายลับทายผิด → ไม่มีใครชนะ
  | 'spy-left' // สายลับออกจากห้องกลางเกม
  | 'not-enough-players'; // ผู้เล่นเหลือน้อยกว่าขั้นต่ำ

export interface SpyfallResult {
  /** spy = สายลับชนะ, voters = คนที่โหวตถูกชนะ (ทุกคนถ้าสายลับออกจากห้อง), null = ไม่มีใครชนะ */
  winner: 'spy' | 'voters' | null;
  /** คนที่ได้แต้มรอบนี้ */
  winners: PlayerId[];
  reason: WinReason;
}

/** โหวตหนึ่งรอบที่ปิดแล้ว — รอบที่ 2 คือโหวตใหม่เฉพาะคนที่คะแนนเสมอ */
export interface VoteRound {
  candidates: PlayerId[];
  /** ผู้โหวต → คนที่เลือก, null = ไม่ได้โหวต (หมดเวลา) */
  ballots: Record<PlayerId, PlayerId | null>;
}

export interface SpyfallState {
  phase: Phase;
  players: PlayerId[];
  spy: PlayerId;
  locationId: string;
  /** บทบาทของคนที่ไม่ใช่สายลับ */
  roles: Record<PlayerId, string>;
  /** สถานที่ที่ใช้ได้ในเกมนี้ (ชุดมาตรฐานที่เปิดอยู่ + ที่สร้างเอง) — ไม่ส่งใน view */
  deck: LocationDef[];
  firstAsker: PlayerId;
  /** เวลาช่วงถามตอบจากตั้งค่าห้อง เก็บไว้ใช้รอบถัดไป */
  durationMs: number;
  /** เวลาหมดของ phase ปัจจุบัน (ถามตอบ / โหวต / สายลับทาย) — null ตอน reveal */
  deadline: number | null;
  /** รอบโหวตที่กำลังเปิด — บัตรเป็นความลับจนปิดรอบ */
  voting: { candidates: PlayerId[]; ballots: Record<PlayerId, PlayerId> } | null;
  /** รอบโหวตที่ปิดแล้วของรอบเกมนี้ (เปิดเผยได้) */
  voteRounds: VoteRound[];
  /** คนที่เสียงส่วนใหญ่เลือก — null = เสมอทั้งสองรอบหรือไม่มีใครโหวต */
  accused: PlayerId | null;
  /** สถานที่ที่สายลับทาย (null = ยังไม่ทายหรือไม่ทันเวลา) */
  spyGuess: string | null;
  result: SpyfallResult | null;
  /** คะแนนรวมของแมตช์ (+1 ให้ทุกคนใน result.winners) */
  scores: Record<PlayerId, number>;
  /** รอบที่เท่าไหร่ของแมตช์ (เริ่ม 1) — ห้องที่เริ่มก่อนมีแมตช์ไม่มี field นี้ */
  round?: number;
  /** จำนวนรอบของแมตช์จากตั้งค่าห้อง — null/ไม่มี = ไม่จำกัด */
  rounds?: number | null;
}

export type SpyfallAction =
  | { type: 'START_VOTE' }
  | { type: 'VOTE'; target: PlayerId }
  | { type: 'SPY_GUESS'; locationId: string }
  | { type: 'NEXT_ROUND' };

export type YouView =
  { role: 'spy' } | { role: 'agent'; locationId: string; roleId: string } | { role: 'spectator' };

export interface SpyfallView {
  phase: Phase;
  me: PlayerId;
  you: YouView;
  locationSetId: string;
  players: PlayerId[];
  firstAsker: PlayerId;
  deadline: number | null;
  /** รอบโหวตที่เปิดอยู่: เห็นว่าใครโหวตแล้ว แต่ไม่เห็นว่าโหวตใคร (ยกเว้นของตัวเอง) */
  vote: {
    round: number;
    candidates: PlayerId[];
    voted: PlayerId[];
    myVote: PlayerId | null;
  } | null;
  /** รอบโหวตที่ปิดแล้ว รวมว่าใครโหวตใคร */
  voteRounds: VoteRound[];
  /** คนที่เสียงส่วนใหญ่เลือก (ตั้งแต่ปิดโหวต) — ไม่บอกว่าเป็นสายลับหรือไม่จนถึง reveal */
  accused: PlayerId | null;
  result: SpyfallResult | null;
  /** มีเฉพาะ phase reveal */
  reveal: {
    spy: PlayerId;
    locationId: string;
    roles: Record<PlayerId, string>;
    spyGuess: string | null;
  } | null;
  scores: Record<PlayerId, number>;
  round: number;
  rounds: number | null;
  /** reveal ของรอบสุดท้ายในแมตช์ — NEXT_ROUND จะเริ่มแมตช์ใหม่ (ล้างคะแนน) */
  matchOver: boolean;
}
