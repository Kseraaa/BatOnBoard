/**
 * บอททดสอบเล่นกันเองทั้งโต๊ะบนกระดานจริง จังหวะเดียวกับบนห้อง (1 action ต่อ BOT_STEP_MS)
 * ตรวจว่าทุกเกมจบ และบอทไม่เคยส่ง action ที่ validate ไม่ผ่าน
 */
import { describe, expect, it } from 'vitest';
import {
  botAction,
  createRng,
  dispatchAction,
  fireDeadline,
  getDeadline,
  startGame,
} from '@batonboard/engine';
import { boss } from '..';
import type { BossOptions, BossState } from './types';

const T0 = 1_700_000_000_000;
const BOT_STEP_MS = 1_500;
const MAX_STEPS = 20_000;

function play(seed: number, players: number, options: BossOptions) {
  const ids = Array.from({ length: players }, (_, i) => `bot${i + 1}`);
  const started = startGame(boss, ids, options, createRng(seed), T0);
  if (!started.ok) throw new Error(started.error);
  let state: BossState = started.value;
  let now = T0;
  const rejected: string[] = [];
  const kinds = new Set<string>();

  for (let step = 0; step < MAX_STEPS && state.phase !== 'ended'; step++) {
    now += BOT_STEP_MS;
    for (let d = getDeadline(boss, state); d !== null && d <= now; d = getDeadline(boss, state)) {
      state = fireDeadline(boss, state, d);
    }
    if (state.phase === 'ended') break;
    const rng = createRng(seed * 31 + step);
    for (const id of ids) {
      const action = botAction(boss, state, id, rng, now);
      if (action === null) continue;
      const res = dispatchAction(boss, state, action, id, { hostId: 'bot1' }, now, rng);
      if (!res.ok) {
        rejected.push(`${action.type}: ${res.error}`);
        continue;
      }
      kinds.add(action.type);
      state = res.value;
      break;
    }
  }
  return { state, rejected, kinds };
}

describe('บอททดสอบ', () => {
  it('บอทล้วนเล่นจนจบเกมทุกเกม และไม่ส่ง action ผิด', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const players = 3 + (seed % 4);
      const { state, rejected, kinds } = play(seed, players, {
        negotiationMs: seed % 3 === 0 ? null : 60_000,
        length: seed % 2 === 0 ? 'short' : 'full',
      });
      expect(state.phase, `seed ${seed}`).toBe('ended');
      expect(rejected, `seed ${seed}`).toEqual([]);
      for (const k of kinds) seen.add(k);
    }
    // บอทได้ลองทุกอย่างที่ใช้ทดสอบหน้าจอ
    for (const type of ['ROLL', 'DECLARE', 'DRAW', 'OFFER_CLAN', 'PROPOSE', 'RESPOND']) {
      expect(seen).toContain(type);
    }
    expect([...seen].some((t) => t.startsWith('PLAY_'))).toBe(true);
  });

  it('ไม่เล่นแทนคนที่ไม่ได้อยู่ในเกม', () => {
    const started = startGame(boss, ['a', 'b', 'c'], boss.defaultOptions, createRng(1), T0);
    if (!started.ok) throw new Error(started.error);
    expect(botAction(boss, started.value, 'ghost', createRng(2), T0)).toBeNull();
  });
});
