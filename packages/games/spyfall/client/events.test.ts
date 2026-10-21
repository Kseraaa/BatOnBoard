import { describe, expect, it } from 'vitest';
import { act, agents, HOST, spyfall, start, startVote, voteAll, voteOut } from '../rules/fixtures';
import type { SpyfallState } from '../rules/types';
import { eventsBetween } from './events';
import { champions, standings } from './logic';

const viewOf = (s: SpyfallState, p: string) => spyfall.playerView(s, p);
const between = (a: SpyfallState, b: SpyfallState, p: string) =>
  eventsBetween(viewOf(a, p), viewOf(b, p));

describe('เสียงตามเหตุการณ์ (eventsBetween)', () => {
  it('view แรกหลังเปิดหน้าไม่ดัง และ view เดิมไม่ดังซ้ำ', () => {
    const s = start(4, 1);
    expect(eventsBetween(null, viewOf(s, HOST))).toEqual([]);
    expect(between(s, s, HOST)).toEqual([]);
  });

  it('เริ่มโหวต → ปิดโหวต (สายลับได้เสียงถึงตาทาย) → เฉลยชนะ/แพ้ → รอบใหม่', () => {
    const s0 = start(4, 1);
    const voting = startVote(s0);
    expect(between(s0, voting, HOST)).toEqual(['vote-open']);

    const guessing = voteOut(s0, s0.spy);
    const agent = agents(s0)[0] as string;
    expect(between(voting, guessing, s0.spy)).toEqual(['spy-guess']);
    expect(between(voting, guessing, agent)).toEqual(['vote-closed']);

    const wrong = guessing.deck.find((l) => l.id !== guessing.locationId)?.id as string;
    const revealed = act(guessing, s0.spy, { type: 'SPY_GUESS', locationId: wrong });
    expect(between(guessing, revealed, s0.spy)).toEqual(['lost']);
    expect(between(guessing, revealed, agent)).toEqual(['won']);

    const next = act(revealed, HOST, { type: 'NEXT_ROUND' }, undefined, 7);
    expect(between(revealed, next, HOST)).toEqual(['round-start']);
  });

  it('คะแนนเสมอ → เสียงโหวตใหม่', () => {
    const s0 = start(4, 4);
    const [a, b, c] = agents(s0) as [string, string, string];
    const voting = startVote(s0);
    // a กับ b ได้คนละ 2 เสียง
    const tie = voteAll(voting, (p) => (p === a || p === c ? b : a));
    expect(tie.voteRounds).toHaveLength(1);
    expect(between(voting, tie, HOST)).toEqual(['revote']);
  });
});

describe('ตารางคะแนนรวม', () => {
  it('เรียงมากไปน้อย คะแนนเท่ากันอันดับเดียวกัน แชมป์เสมอได้', () => {
    const view = {
      ...viewOf(start(4), HOST),
      scores: { 'p-ann': 1, 'p-bob': 3, 'p-cat': 3, 'p-dan': 0 },
    };
    expect(standings(view)).toEqual([
      { id: 'p-bob', score: 3, rank: 1 },
      { id: 'p-cat', score: 3, rank: 1 },
      { id: 'p-ann', score: 1, rank: 3 },
      { id: 'p-dan', score: 0, rank: 4 },
    ]);
    expect(champions(view)).toEqual(['p-bob', 'p-cat']);
    expect(champions(viewOf(start(4), HOST))).toEqual([]);
  });
});
