/**
 * บอททดสอบเล่นกันเองทั้งโต๊ะ (host เป็นคนกดเริ่มโหวตและรอบใหม่ เพราะบอทไม่เป็น host)
 * ตรวจว่าทุกรอบจบที่ reveal และบอทส่งแต่ action ที่ validate ผ่าน ยกเว้นการเดาสถานที่ที่ห้องปิดไว้
 */
import { describe, expect, it } from 'vitest';
import {
  botAction,
  createRng,
  dispatchAction,
  fireDeadline,
  getDeadline,
} from '@batonboard/engine';
import { act, HOST, players, spyfall, start, T0 } from './fixtures';
import type { SpyfallState } from './types';

const BOT_STEP_MS = 1_500;

function playRound(game: typeof spyfall, state: SpyfallState, seed: number) {
  let s = act(state, HOST, { type: 'START_VOTE' });
  let now = T0;
  const rejected: string[] = [];
  for (let step = 0; step < 500 && s.phase !== 'reveal'; step++) {
    now += BOT_STEP_MS;
    for (let d = getDeadline(game, s); d !== null && d <= now; d = getDeadline(game, s)) {
      s = fireDeadline(game, s, d);
    }
    const rng = createRng(seed * 31 + step);
    for (const id of s.players) {
      const action = botAction(game, s, id, rng, now);
      if (action === null) continue;
      const res = dispatchAction(game, s, action, id, { hostId: HOST }, now, rng);
      if (res.ok) {
        s = res.value;
        break;
      }
      rejected.push(`${action.type}:${res.error}`);
    }
  }
  return { state: s, rejected };
}

describe('บอททดสอบ', () => {
  it.each([3, 5, 8])('บอทโหวตและสายลับทายจนจบรอบ (%i คน)', (n) => {
    for (let seed = 0; seed < 20; seed++) {
      const { state, rejected } = playRound(spyfall, start(n, seed), seed);
      expect(state.phase).toBe('reveal');
      expect(rejected.filter((r) => !r.endsWith('unknown-location'))).toEqual([]);
      // ทุกคนโหวตทุกรอบ (ไม่ต้องรอหมดเวลา) และสายลับทายทัน
      expect(state.voteRounds.at(-1)?.ballots).not.toContain(null);
      expect(state.spyGuess).not.toBeNull();
    }
  });

  it('ช่วงถามตอบและ reveal บอทไม่ทำอะไร', () => {
    const s = start(4);
    for (const id of players(4)) expect(botAction(spyfall, s, id, createRng(1), T0)).toBeNull();
  });

  it('ห้องที่ปิดชุดมาตรฐานบางแห่ง บอทเดาจนเจอสถานที่ที่ใช้ได้', () => {
    for (let seed = 0; seed < 10; seed++) {
      const s = start(4, seed, { durationMs: 60_000, disabled: [] });
      // เหลือแค่สถานที่จริงกับอีกแห่ง เหมือน host ปิดที่เหลือ
      const deck = s.deck.filter((l, i) => l.id === s.locationId || i === 0).slice(0, 2);
      const { state } = playRound(spyfall, { ...s, deck }, seed);
      expect(state.phase).toBe('reveal');
      expect(deck.map((l) => l.id)).toContain(state.spyGuess);
    }
  });
});
