/**
 * เทสต์ข้อแรก: ไพ่บนมือของคนอื่นและลำดับกองจั่วต้องไม่หลุดไปใน view
 *
 * ตรวจด้วยการค้นข้อความใน JSON ที่จะส่งผ่าน network จริง ไม่ใช่ตรวจ field
 * เพื่อจับการรั่วจาก field ที่เพิ่มทีหลังด้วย (id ไพ่ครอบด้วย " เพราะ stop-1 เป็น substring ของ stop-10)
 */
import { describe, expect, it } from 'vitest';
import type { BossState } from './types';
import { act, boss, declared, investorPlan, owned, start } from './fixtures';

function viewJson(state: BossState, viewer: string): string {
  return JSON.stringify(boss.playerView(state, viewer));
}

/** state ที่ผู้เล่นเจอได้ระหว่างเกม */
function states(n: number, seed: number): [string, BossState][] {
  const begin = start(n, seed);
  const rolled = act(begin, begin.current, { type: 'ROLL' });
  const drew = act(rolled, rolled.current, { type: 'DRAW' });
  const dealing = declared(owned(begin));
  const deal = dealing.deal;
  if (deal === null) throw new Error('no deal');
  const proposed = act(dealing, deal.boss, { type: 'PROPOSE', plan: investorPlan(deal.space) });
  return [
    ['start', begin],
    ['moved', rolled],
    ['after draw', drew],
    ['deal', dealing],
    ['proposed', proposed],
  ];
}

const cases = [3, 4, 5, 6].flatMap((n) =>
  Array.from({ length: 6 }, (_, i) => ({ n, seed: n * 100 + i })),
);

describe('playerView', () => {
  it.each(cases)('ไม่มีไพ่บนมือของคนอื่นและไพ่ในกองจั่ว ($n คน, seed $seed)', ({ n, seed }) => {
    for (const [label, state] of states(n, seed)) {
      for (const viewer of state.players) {
        const json = viewJson(state, viewer);
        const secret = [
          ...state.deck,
          ...state.players.filter((p) => p !== viewer).flatMap((p) => state.hands[p] ?? []),
        ];
        for (const card of secret) expect(json, `${label} ${viewer}`).not.toContain(`"${card}"`);
        // ไพ่บนมือตัวเองต้องเห็นครบ
        for (const card of state.hands[viewer] ?? []) expect(json).toContain(`"${card}"`);
      }
    }
  });

  it('ผู้ชม (ไม่ได้อยู่ในเกม) ไม่เห็นไพ่ของใครเลย', () => {
    const state = start(4, 7);
    const json = viewJson(state, 'p-spectator');
    for (const card of Object.values(state.hands).flat()) expect(json).not.toContain(`"${card}"`);
  });

  it('ไม่ส่งแต้มทอยสุ่มจบเกมที่สุ่มไว้ล่วงหน้า', () => {
    const state = declared(owned(start(4, 3)));
    const view = boss.playerView(state, state.players[0] as string);
    expect(view.deal).not.toBeNull();
    expect(Object.keys(view.deal ?? {})).not.toContain('endRoll');
  });
});
