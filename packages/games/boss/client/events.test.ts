import { describe, expect, it } from 'vitest';
import { act, boss, declared, fire, give, investorPlan, owned, start } from '../rules/fixtures';
import type { BossState } from '../rules/types';
import { eventsBetween } from './events';

const viewOf = (s: BossState, p: string) => boss.playerView(s, p);

describe('เหตุการณ์จาก view (เสียง/สั่น)', () => {
  it('view แรกหลังเปิดหน้าไม่มีเหตุการณ์', () => {
    const s = start();
    expect(eventsBetween(null, viewOf(s, s.current))).toEqual([]);
  });

  it('ทอยแล้วทุกคนได้ยินลูกเต๋า', () => {
    const s = start();
    const rolled = act(s, s.current, { type: 'ROLL' });
    for (const p of s.players) {
      expect(eventsBetween(viewOf(s, p), viewOf(rolled, p))).toContain('roll');
    }
  });

  it('ถึงตาตัวเองแล้วมีเสียงเรียก ครั้งเดียว', () => {
    const s = start();
    const rolled = act(s, s.current, { type: 'ROLL' });
    const drew = act(rolled, s.current, { type: 'DRAW' });
    const next = drew.current;
    expect(eventsBetween(viewOf(rolled, next), viewOf(drew, next))).toEqual(['my-turn']);
    expect(eventsBetween(viewOf(drew, next), viewOf(drew, next))).toEqual([]);
    expect(eventsBetween(viewOf(rolled, s.current), viewOf(drew, s.current))).toEqual([]);
  });

  it('ปิดดีล: คนที่ได้เงินได้ยินเสียงเหรียญ (paid) คนอื่นได้ deal-closed', () => {
    let s = declared(owned({ ...start(4, 5), marker: 0 }));
    const deal = s.deal;
    if (deal === null) throw new Error('no deal');
    s = act(s, deal.boss, { type: 'PROPOSE', plan: investorPlan(0) });
    for (const p of s.players.filter((p) => p !== deal.boss)) {
      try {
        s = act(s, p, { type: 'RESPOND', agree: true });
      } catch {
        // ไม่ได้อยู่ในแผน
      }
    }
    const done = fire(s);
    expect(eventsBetween(viewOf(s, deal.boss), viewOf(done, deal.boss))).toContain('paid');
    const outsider = done.players.find((p) => (done.money[p] ?? 0) === 0);
    if (outsider) {
      expect(eventsBetween(viewOf(s, outsider), viewOf(done, outsider))).toContain('deal-closed');
    }
  });

  it('มีคนลงไพ่ที่ยกเลิกได้ → เตือน แล้วโดนเบรก → เตือนอีกครั้ง', () => {
    let s: BossState = { ...owned(start(4, 9)), marker: 0, current: 'p-dan' };
    s = give(give(s, 'p-cat', ['takeover-1']), 'p-bob', ['stop-1']);
    s = act(s, 'p-dan', { type: 'DECLARE' });
    const played = act(s, 'p-cat', { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    expect(eventsBetween(viewOf(s, 'p-ann'), viewOf(played, 'p-ann'))).toEqual(['pending']);
    const stopped = act(played, 'p-bob', { type: 'PLAY_STOP', card: 'stop-1' });
    expect(eventsBetween(viewOf(played, 'p-ann'), viewOf(stopped, 'p-ann'))).toEqual(['stopped']);
  });

  it('จบเกม: ผู้ชนะได้ won คนอื่นได้ lost (และมาก่อนเหตุการณ์อื่น)', () => {
    const s = start(3);
    const left = boss.onPlayerLeave?.(s, s.players[0] as string, 0) as BossState;
    const p = s.players[1] as string;
    const events = eventsBetween(viewOf(s, p), viewOf(left, p));
    // เงินเท่ากันหมด (0) ทุกคนที่เหลือจึงเป็นผู้ชนะร่วม
    expect(events[0]).toBe('won');
  });
});
