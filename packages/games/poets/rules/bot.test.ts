/** บอทเล่นกันเองทั้งโต๊ะ (host กดเริ่มโหวตเอง) ทุกรอบต้องจบที่ reveal โดยไม่มี action ที่ถูกปฏิเสธ */
import { describe, expect, it } from 'vitest';
import { botAction, createRng, dispatchAction } from '@batonboard/engine';
import { HOST, poets, start, T0, timeUp } from './fixtures';

describe('บอท', () => {
  it('อ่านเมื่อถึงตา โหวตแบบสุ่ม จนจบรอบ', () => {
    for (let seed = 0; seed < 30; seed++) {
      let s = start(3 + (seed % 4), seed);
      const rejected: string[] = [];
      for (let step = 0; step < 100 && s.phase !== 'reveal'; step++) {
        if (s.phase === 'discussion') s = timeUp(s);
        const rng = createRng(seed * 31 + step);
        for (const id of s.players) {
          const action = botAction(poets, s, id, rng, T0);
          if (action === null) continue;
          const res = dispatchAction(poets, s, action, id, { hostId: HOST }, T0, rng);
          if (!res.ok) rejected.push(`${action.type}:${res.error}`);
          else s = res.value;
          break;
        }
      }
      expect(s.phase).toBe('reveal');
      expect(rejected).toEqual([]);
    }
  });
});
