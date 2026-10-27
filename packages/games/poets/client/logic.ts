import type { PlayerId } from '@batonboard/engine';
import type { PoetsView, VoteRound } from '../rules/types';

/** ตัวช่วยตัดสินว่าจะแสดงปุ่มอะไร — แค่เพื่อ UX server ตัดสินจริงเสมอ */

export const isParticipant = (v: PoetsView) => v.players.includes(v.me);

/** คนที่กำลังอ่าน (null = อ่านครบแล้ว) */
export function currentReader(v: PoetsView): PlayerId | null {
  return v.phase === 'reading' ? (v.order[v.readCount] ?? null) : null;
}

export function voteTargets(v: PoetsView): PlayerId[] {
  if (!v.vote) return [];
  return v.vote.candidates.filter((c) => c !== v.me && v.players.includes(c));
}

export function canVote(v: PoetsView): boolean {
  return (
    v.phase === 'voting' &&
    v.vote !== null &&
    isParticipant(v) &&
    v.vote.myVote === null &&
    voteTargets(v).length > 0
  );
}

/** คะแนนของรอบโหวตที่ปิดแล้ว เรียงจากมากไปน้อย (นับเฉพาะคนที่ยังอยู่) */
export function tally(round: VoteRound, players: PlayerId[]): { id: PlayerId; votes: number }[] {
  const counts = new Map(round.candidates.filter((c) => players.includes(c)).map((c) => [c, 0]));
  for (const p of players) {
    const target = round.ballots[p];
    if (target != null && counts.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts].map(([id, votes]) => ({ id, votes })).sort((a, b) => b.votes - a.votes);
}

/** ตารางคะแนนรวม เรียงจากมากไปน้อย คะแนนเท่ากันได้อันดับเดียวกัน */
export function standings(v: PoetsView): { id: PlayerId; score: number; rank: number }[] {
  const rows = v.players
    .map((id) => ({ id, score: v.scores[id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  return rows.map((r) => ({ ...r, rank: rows.findIndex((x) => x.score === r.score) + 1 }));
}

/** แชมป์ของแมตช์ = คะแนนสูงสุด (เสมอได้หลายคน) — ไม่มีใครได้แต้มเลย = ไม่มีแชมป์ */
export function champions(v: PoetsView): PlayerId[] {
  const rows = standings(v);
  const top = rows[0]?.score ?? 0;
  return top > 0 ? rows.filter((r) => r.score === top).map((r) => r.id) : [];
}
