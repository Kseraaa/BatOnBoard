import type { PlayerId } from '@batonboard/engine';

/**
 * reading (อ่านกลอนออกเสียงทีละคนตามลำดับ) → discussion (คุยหากวีสายลับ จนหมดเวลาหรือ host กดเริ่มโหวต)
 * → voting (ทุกคนโหวต, เสมอ = โหวตใหม่หนึ่งครั้ง) → reveal
 */
export type Phase = 'reading' | 'discussion' | 'voting' | 'reveal';

/**
 * ประโยคหนึ่งประโยค — ต่างจาก spyfall ตรงที่กติกาเก็บข้อความด้วย เพราะข้อความบอกโวหารได้
 * ถ้าให้ client โหลดเองแบบ static ข้อมูลว่าประโยคไหนเป็นโวหารอะไรจะติดไปใน bundle
 */
export interface SentenceDef {
  /** ไม่ซ้ำทั้งชุด */
  id: string;
  /** ข้อความที่ผู้เล่นอ่านออกเสียง */
  text: string;
  /** คำอธิบายที่แสดงตอนเฉลย เช่น "เมืองย่าโม หมายถึง นครราชสีมา" */
  note?: string;
  /** โวหารอื่นที่ประโยคนี้เข้าได้ด้วย — ไม่ใช้ประโยคนี้ในรอบที่โวหารเหล่านี้อยู่อีกฝั่ง */
  also?: string[];
}

/** โวหารหนึ่งแบบ (ทำหน้าที่เหมือน "สถานที่" ของ spyfall) ชื่อที่แสดงอยู่ใน data */
export interface FigureDef {
  id: string;
  sentences: SentenceDef[];
}

export interface PoetsConfig {
  /** id ของชุดโวหาร ส่งไปใน view ให้ client โหลดชื่อโวหารเองแบบ static */
  setId: string;
  figures: FigureDef[];
}

export interface PoetsOptions {
  /** เวลาคุยหากวีสายลับหลังอ่านครบ (ms) */
  discussionMs: number;
  /** จำนวนรอบต่อแมตช์ — ไม่ใส่ = ไม่จำกัด */
  rounds?: number;
  /** ซ่อนชื่อโวหารบนการ์ด (เห็นแค่ประโยค) — ยากขึ้น ต้องดูเองว่าเป็นโวหารอะไร */
  hideFigure?: boolean;
  /** host ร่วมเล่นด้วย — ไม่ใส่/false = host เป็นผู้ดำเนินเกม (ครู) ไม่ได้ไพ่ แต่เห็นไพ่ทุกคน */
  hostPlays?: boolean;
}

export type WinReason =
  | 'caught' // โหวตเลือกกวีสายลับถูก → หมู่บ้านปลอดภัย กวีทุกคนที่ไม่ใช่สายลับ +1
  | 'missed' // โหวตผิดคน หรือเสมอ/ไม่มีใครโหวต → หมู่บ้านถูกลงโทษ สายลับ +1
  | 'spy-left' // สายลับออกจากห้องกลางเกม
  | 'not-enough-players'; // ผู้เล่นเหลือน้อยกว่าขั้นต่ำ

export interface PoetsResult {
  /** village = หมู่บ้านชนะ, spy = สายลับชนะ, null = ไม่มีใครชนะ */
  winner: 'village' | 'spy' | null;
  winners: PlayerId[];
  points: number;
  reason: WinReason;
}

/** โหวตหนึ่งรอบที่ปิดแล้ว — รอบที่ 2 คือโหวตใหม่เฉพาะคนที่คะแนนเสมอ */
export interface VoteRound {
  candidates: PlayerId[];
  /** ผู้โหวต → คนที่เลือก, null = ไม่ได้โหวต (หมดเวลา) */
  ballots: Record<PlayerId, PlayerId | null>;
}

export interface PoetsState {
  phase: Phase;
  players: PlayerId[];
  spy: PlayerId;
  /** โวหารของหมู่บ้าน */
  figure: string;
  /** โวหารของประโยคที่สายลับได้ */
  spyFigure: string;
  /** ประโยคของแต่ละคน (id ใน config) */
  lines: Record<PlayerId, string>;
  /** ลำดับการอ่าน */
  order: PlayerId[];
  /** อ่านไปแล้วกี่คน (คนถัดไปคือ order[readCount]) */
  readCount: number;
  discussionMs: number;
  hideFigure: boolean;
  /** เวลาหมดของ phase ปัจจุบัน (คุย / โหวต) — null ตอนอ่านและ reveal */
  deadline: number | null;
  /** รอบโหวตที่กำลังเปิด — บัตรเป็นความลับจนปิดรอบ */
  voting: { candidates: PlayerId[]; ballots: Record<PlayerId, PlayerId> } | null;
  voteRounds: VoteRound[];
  /** คนที่เสียงส่วนใหญ่เลือก — null = เสมอทั้งสองรอบหรือไม่มีใครโหวต */
  accused: PlayerId | null;
  result: PoetsResult | null;
  scores: Record<PlayerId, number>;
  round: number;
  rounds: number | null;
  /** ประโยคที่ใช้ไปแล้วในแมตช์นี้ — รอบถัดไปเลี่ยงไม่ให้ซ้ำ (ใช้ครบแล้วเริ่มนับใหม่) */
  used: string[];
  /** host ที่ดำเนินเกมโดยไม่เล่น — เห็นไพ่ทุกคน (ห้องเก่าไม่มี field นี้ = ไม่มี) */
  moderator?: PlayerId | null;
}

export type PoetsAction =
  | { type: 'READ_DONE' }
  | { type: 'START_VOTE' }
  | { type: 'VOTE'; target: PlayerId }
  | { type: 'NEXT_ROUND' };

/** ประโยคที่อ่านออกเสียงแล้ว (สาธารณะ) */
export interface ReadLine {
  player: PlayerId;
  text: string;
}

export type YouView =
  | {
      role: 'poet';
      text: string;
      /** โวหารบนการ์ดของตัวเอง — null เมื่อห้องซ่อนชื่อโวหาร */
      figure: string | null;
    }
  | {
      /** host ที่ดำเนินเกม — เห็นไพ่ของทุกคนและรู้ว่าใครเป็นสายลับ */
      role: 'moderator';
      cards: ModeratorCard[];
    }
  | { role: 'spectator' };

export interface ModeratorCard {
  player: PlayerId;
  text: string;
  figure: string;
  spy: boolean;
}

export interface PoetsView {
  phase: Phase;
  me: PlayerId;
  /** ไม่บอกว่าเป็นสายลับ — สายลับเห็นแค่ประโยคและโวหารของตัวเอง เหมือนคนอื่น */
  you: YouView;
  setId: string;
  players: PlayerId[];
  order: PlayerId[];
  readCount: number;
  /** ประโยคที่อ่านแล้ว ตามลำดับการอ่าน */
  readLines: ReadLine[];
  deadline: number | null;
  vote: {
    round: number;
    candidates: PlayerId[];
    voted: PlayerId[];
    myVote: PlayerId | null;
  } | null;
  voteRounds: VoteRound[];
  accused: PlayerId | null;
  result: PoetsResult | null;
  /** มีเฉพาะ phase reveal */
  reveal: {
    spy: PlayerId;
    figure: string;
    spyFigure: string;
    lines: { player: PlayerId; text: string; note: string | null; figures: string[] }[];
  } | null;
  scores: Record<PlayerId, number>;
  round: number;
  rounds: number | null;
  matchOver: boolean;
}
