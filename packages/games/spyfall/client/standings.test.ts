import { describe, expect, it } from 'vitest';
import { HOST, spyfall, start } from '../rules/fixtures';
import type { SpyfallState } from '../rules/types';
import { champions, standings } from './logic';

const viewOf = (s: SpyfallState, p: string) => spyfall.playerView(s, p);

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
