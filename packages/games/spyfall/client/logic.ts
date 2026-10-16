import type { SpyfallView } from '../rules/types';

/**
 * ตัวช่วยตัดสินว่าจะแสดงปุ่มอะไร — แค่เพื่อ UX
 * server เป็นผู้ตัดสินจริงเสมอ (validate ฝั่ง server)
 */

export const isParticipant = (v: SpyfallView) => v.players.includes(v.me);

export function canAccuse(v: SpyfallView): boolean {
  if (!isParticipant(v)) return false;
  if (v.phase === 'questioning') return !v.usedAccusation.includes(v.me);
  if (v.phase === 'final-vote') return !v.finalTurns.includes(v.me);
  return false;
}

export function canPass(v: SpyfallView): boolean {
  return v.phase === 'final-vote' && isParticipant(v) && !v.finalTurns.includes(v.me);
}

export function canBallot(v: SpyfallView): boolean {
  return (
    v.phase === 'voting' &&
    v.vote !== null &&
    isParticipant(v) &&
    v.me !== v.vote.accused &&
    !v.vote.voted.includes(v.me)
  );
}

export function canGuess(v: SpyfallView): boolean {
  return v.phase === 'questioning' && v.you.role === 'spy';
}

/** จำนวนคนที่ต้องโหวต (ทุกคนยกเว้นผู้ถูกกล่าวหา) */
export function voterCount(v: SpyfallView): number {
  return v.vote ? v.players.filter((p) => p !== v.vote?.accused).length : 0;
}
