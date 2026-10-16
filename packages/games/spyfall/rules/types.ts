import type { PlayerId } from '@batonboard/engine';

export type Phase = 'questioning' | 'voting' | 'final-vote' | 'reveal';

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

export interface SpyfallOptions {
  /** เวลาช่วงถามตอบ (ms) */
  durationMs: number;
}

export type WinReason =
  | 'spy-caught' // โหวตจับสายลับได้
  | 'innocent-convicted' // โหวตจับผิดคน
  | 'spy-guessed' // สายลับเดาสถานที่ถูก
  | 'spy-guessed-wrong' // สายลับเดาสถานที่ผิด
  | 'spy-survived' // final-vote ครบทุกคนแล้วไม่มีใครถูกจับ
  | 'time-up' // final-vote หมดเวลา
  | 'spy-left' // สายลับออกจากห้องกลางเกม
  | 'not-enough-players'; // ผู้เล่นเหลือน้อยกว่าขั้นต่ำ

export interface SpyfallResult {
  winner: 'spy' | 'agents' | null;
  reason: WinReason;
}

export interface Vote {
  accuser: PlayerId;
  accused: PlayerId;
  /** ผู้กล่าวหาถูกใส่ true อัตโนมัติ */
  ballots: Record<PlayerId, boolean>;
  /** หมดเวลาโหวต: คนที่ยังไม่โหวต = ไม่เห็นด้วย */
  deadline: number;
  /** โหวตนี้เกิดใน final-vote — ถ้าไม่ผ่านให้กลับ final-vote */
  final: boolean;
}

export interface SpyfallState {
  phase: Phase;
  players: PlayerId[];
  spy: PlayerId;
  locationId: string;
  /** บทบาทของคนที่ไม่ใช่สายลับ */
  roles: Record<PlayerId, string>;
  firstAsker: PlayerId;
  /** เวลาช่วงถามตอบจากตั้งค่าห้อง เก็บไว้ใช้รอบถัดไป */
  durationMs: number;
  /** เวลาหมดของ phase questioning / final-vote (ms epoch) — null ระหว่างโหวตและ reveal */
  deadline: number | null;
  /** เวลาที่เหลือตอนหยุดเพื่อโหวต */
  pausedRemaining: number | null;
  /** คนที่ใช้สิทธิ์กล่าวหาแล้วในช่วง questioning */
  usedAccusation: PlayerId[];
  /** คนที่เสนอชื่อหรือ PASS แล้วใน final-vote */
  finalTurns: PlayerId[];
  vote: Vote | null;
  /** สถานที่ที่สายลับเดา (ถ้ามี) */
  spyGuess: string | null;
  result: SpyfallResult | null;
  /** จำนวนรอบที่ชนะ (+1 ทุกคนในฝ่ายที่ชนะ) */
  scores: Record<PlayerId, number>;
}

export type SpyfallAction =
  | { type: 'ACCUSE'; target: PlayerId }
  | { type: 'BALLOT'; agree: boolean }
  | { type: 'PASS' }
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
  pausedRemaining: number | null;
  usedAccusation: PlayerId[];
  finalTurns: PlayerId[];
  /** สถานะโหวต: เห็นว่าใครโหวตแล้ว แต่ไม่เห็นว่าโหวตอะไร */
  vote: { accuser: PlayerId; accused: PlayerId; voted: PlayerId[]; deadline: number } | null;
  result: SpyfallResult | null;
  /** มีเฉพาะ phase reveal */
  reveal: {
    spy: PlayerId;
    locationId: string;
    roles: Record<PlayerId, string>;
    spyGuess: string | null;
  } | null;
  scores: Record<PlayerId, number>;
}
