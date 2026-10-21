import { createRng, startGame } from '@batonboard/engine';
import { describe, expect, it } from 'vitest';
import { MAX_MATCH_ROUNDS } from './constants';
import { act, agents, HOST, players, spyfall, start, T0, voteOut } from './fixtures';
import type { SpyfallState } from './types';

/** จับสายลับได้ + สายลับทายผิด → คนที่โหวตสายลับได้แต้ม */
function playRound(state: SpyfallState): SpyfallState {
  const caught = voteOut(state, state.spy);
  const wrong = caught.deck.find((l) => l.id !== caught.locationId)?.id as string;
  return act(caught, caught.spy, { type: 'SPY_GUESS', locationId: wrong });
}

describe('แมตช์หลายรอบ', () => {
  it('ไม่ตั้งจำนวนรอบ = ไม่จำกัด (เหมือนเดิม)', () => {
    let s = start(4);
    for (let i = 1; i <= 4; i++) {
      s = playRound(s);
      const view = spyfall.playerView(s, HOST);
      expect(view).toMatchObject({ round: i, rounds: null, matchOver: false });
      s = act(s, HOST, { type: 'NEXT_ROUND' }, T0, i);
    }
  });

  it('นับรอบ สะสมคะแนน และจบแมตช์เมื่อครบ แล้ว NEXT_ROUND เริ่มแมตช์ใหม่', () => {
    let s = start(4, 1, { durationMs: 60_000, rounds: 3 });
    const total: Record<string, number> = {};
    for (let i = 1; i <= 3; i++) {
      expect(spyfall.playerView(s, HOST)).toMatchObject({ round: i, rounds: 3 });
      s = playRound(s);
      for (const p of s.result?.winners ?? []) total[p] = (total[p] ?? 0) + 1;
      expect(spyfall.playerView(s, HOST).matchOver).toBe(i === 3);
      if (i < 3) s = act(s, HOST, { type: 'NEXT_ROUND' }, T0, i);
    }
    expect(Object.entries(s.scores).filter(([, n]) => n > 0)).toEqual(
      Object.entries(total).sort(([a], [b]) => players(4).indexOf(a) - players(4).indexOf(b)),
    );

    const fresh = act(s, HOST, { type: 'NEXT_ROUND' }, T0, 9);
    expect(fresh).toMatchObject({ phase: 'questioning', round: 1, rounds: 3 });
    expect(Object.values(fresh.scores).every((n) => n === 0)).toBe(true);
    expect(agents(fresh)).toHaveLength(3);
  });

  it('ตรวจจำนวนรอบใน options', () => {
    for (const rounds of [0, MAX_MATCH_ROUNDS + 1, 2.5, '3']) {
      const res = startGame(spyfall, players(4), { durationMs: 60_000, rounds }, createRng(1), T0);
      expect(res).toEqual({ ok: false, error: 'invalid-options' });
    }
  });

  it('ห้องที่เริ่มก่อนมีแมตช์ (ไม่มี round/rounds) ยังเล่นต่อได้', () => {
    const legacy: SpyfallState = { ...playRound(start(4)) };
    delete legacy.round;
    delete legacy.rounds;
    expect(spyfall.playerView(legacy, HOST)).toMatchObject({
      round: 1,
      rounds: null,
      matchOver: false,
    });
    expect(act(legacy, HOST, { type: 'NEXT_ROUND' })).toMatchObject({ round: 2, rounds: null });
  });
});
