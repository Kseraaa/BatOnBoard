/** ค่าคงที่ของกติกา — แยกไฟล์ไว้ให้ client import ได้โดยไม่ลาก zod ไปด้วย */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const DEFAULT_DURATION_MS = 8 * 60_000;
export const MIN_DURATION_MS = 60_000;
export const MAX_DURATION_MS = 30 * 60_000;
/** เวลาโหวตแต่ละครั้ง — กันคนออฟไลน์ทำให้โหวตค้าง */
export const VOTE_MS = 60_000;
/** เวลาของ phase final-vote — กันคนออฟไลน์ไม่ยอมเสนอชื่อหรือ PASS */
export const FINAL_VOTE_MS = 90_000;

/** สถานที่ที่ผู้เล่นสร้างเอง (อยู่ใน options ของห้อง) */
export const MAX_CUSTOM_LOCATIONS = 20;
/** บทบาทต่อสถานที่ที่สร้างเอง — น้อยกว่าจำนวนคนได้ บทบาทจะวนซ้ำ */
export const MAX_CUSTOM_ROLES = MAX_PLAYERS - 1;
/** ความยาวชื่อสถานที่/บทบาทที่พิมพ์เอง */
export const MAX_CUSTOM_TEXT = 30;
/** id ของสถานที่ที่สร้างเอง เช่น custom-3 */
export const CUSTOM_ID_PATTERN = /^custom-\d{1,4}$/;
/** สถานที่ที่ใช้ได้ต้องมีอย่างน้อยเท่านี้ ไม่งั้นสายลับรู้คำตอบทันที */
export const MIN_DECK_SIZE = 2;

/** รหัส error ที่ validate คืน — client แปลเป็นข้อความเอง */
export const SpyfallError = {
  NotAPlayer: 'not-a-player',
  WrongPhase: 'wrong-phase',
  UnknownPlayer: 'unknown-player',
  CannotAccuseSelf: 'cannot-accuse-self',
  AccusationUsed: 'accusation-used',
  FinalTurnUsed: 'final-turn-used',
  AccusedCannotVote: 'accused-cannot-vote',
  AlreadyVoted: 'already-voted',
  NotSpy: 'not-spy',
  UnknownLocation: 'unknown-location',
  NotHost: 'not-host',
  NotEnoughPlayers: 'not-enough-players',
} as const;

export type SpyfallErrorCode = (typeof SpyfallError)[keyof typeof SpyfallError];
