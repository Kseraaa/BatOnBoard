/** ค่าคงที่ของกติกา — แยกไฟล์ไว้ให้ client import ได้โดยไม่ลาก zod ไปด้วย */
export const MIN_PLAYERS = 3;
/** ต้นฉบับเล่นรอบละ 6 คน (ถูก 5 ผิด 1) — แต่ละโวหารจึงต้องมีประโยคอย่างน้อย 5 ประโยค */
export const MAX_PLAYERS = 6;
export const DEFAULT_DISCUSSION_MS = 60_000;
export const MIN_DISCUSSION_MS = 15_000;
export const MAX_DISCUSSION_MS = 10 * 60_000;
/** เวลาโหวตแต่ละรอบ — กันคนออฟไลน์ทำให้โหวตค้าง (ไม่โหวต = งดออกเสียง) */
export const VOTE_MS = 60_000;

export const MIN_MATCH_ROUNDS = 1;
export const MAX_MATCH_ROUNDS = 20;

/** รหัส error ที่ validate คืน — client แปลเป็นข้อความเอง */
export const PoetsError = {
  NotAPlayer: 'not-a-player',
  WrongPhase: 'wrong-phase',
  NotReader: 'not-reader',
  NotACandidate: 'not-a-candidate',
  CannotVoteSelf: 'cannot-vote-self',
  AlreadyVoted: 'already-voted',
  NotHost: 'not-host',
  NotEnoughPlayers: 'not-enough-players',
} as const;

export type PoetsErrorCode = (typeof PoetsError)[keyof typeof PoetsError];
