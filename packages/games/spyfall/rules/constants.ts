/** ค่าคงที่ของกติกา — แยกไฟล์ไว้ให้ client import ได้โดยไม่ลาก zod ไปด้วย */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const DEFAULT_DURATION_MS = 8 * 60_000;
export const MIN_DURATION_MS = 60_000;
export const MAX_DURATION_MS = 30 * 60_000;
/** เวลาโหวตแต่ละรอบ — กันคนออฟไลน์ทำให้โหวตค้าง (ไม่โหวต = งดออกเสียง) */
export const VOTE_MS = 60_000;
/** เวลาที่สายลับมีให้ทายสถานที่ — ไม่ทันถือว่าทายผิด */
export const GUESS_MS = 60_000;

/** จำนวนรอบต่อแมตช์ที่ตั้งได้ (ไม่ตั้ง = ไม่จำกัด) */
export const MIN_MATCH_ROUNDS = 1;
export const MAX_MATCH_ROUNDS = 20;

/** สถานที่ที่ผู้เล่นสร้างเอง (อยู่ใน options ของห้อง) */
export const MAX_CUSTOM_LOCATIONS = 20;
/**
 * บทบาทต่อสถานที่ที่สร้างเอง — มากกว่าจำนวนคนได้ (แต่ละรอบสุ่มเลือกตามจำนวนคน ไม่ซ้ำเดิมจนน่าเบื่อ)
 * น้อยกว่าจำนวนคนก็ได้ บทบาทจะวนซ้ำ
 */
export const MAX_CUSTOM_ROLES = 15;
/** ชุดมาตรฐานควรมีบทบาทต่อสถานที่อย่างน้อยเท่านี้ ให้แต่ละรอบได้บทบาทไม่ซ้ำเดิม (data.test ตรวจ) */
export const MIN_STANDARD_ROLES = 12;
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
  NotACandidate: 'not-a-candidate',
  CannotVoteSelf: 'cannot-vote-self',
  AlreadyVoted: 'already-voted',
  NotSpy: 'not-spy',
  UnknownLocation: 'unknown-location',
  NotHost: 'not-host',
  NotEnoughPlayers: 'not-enough-players',
} as const;

export type SpyfallErrorCode = (typeof SpyfallError)[keyof typeof SpyfallError];
