/** ตรวจข้อมูลจริง: ทุกโวหารมีชื่อ แจกได้ครบ 6 คน และ view ไม่รั่ว */
import { createRng, startGame } from '@batonboard/engine';
import { describe, expect, it } from 'vitest';
import { FIGURES } from './data/figures';
import { SENTENCES } from './data/sentences';
import { poets } from './index';
import { MAX_PLAYERS, MIN_PLAYERS, pairings } from './rules';

const T0 = 1_700_000_000_000;
const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const all = SENTENCES.flatMap((f) => f.sentences);

describe('ข้อมูลโวหาร', () => {
  it('ทุกโวหารมีชื่อไทย/อังกฤษ และมีประโยค', () => {
    expect(SENTENCES.map((f) => f.id).sort()).toEqual(FIGURES.map((f) => f.id).sort());
    for (const f of FIGURES) {
      expect(f.name.th && f.name.en && f.hint.th && f.hint.en).toBeTruthy();
    }
  });

  it('ประโยคไม่ซ้ำ ไม่มีช่องว่างเกิน และไม่มีสระอำแบบแยกตัว (ํ + า)', () => {
    expect(new Set(all.map((s) => s.text)).size).toBe(all.length);
    for (const s of all) {
      expect(s.text).toBe(s.text.trim());
      expect(s.text).not.toMatch(/\s{2}/);
      expect(s.text).not.toMatch(/ํ/);
    }
  });

  it(`ทุกโวหารเป็นโวหารของหมู่บ้านได้ตั้งแต่ ${MIN_PLAYERS} ถึง ${MAX_PLAYERS} คน`, () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const villages = new Set(pairings(SENTENCES, n).map((p) => p.figure));
      expect([...villages].sort()).toEqual(FIGURES.map((f) => f.id).sort());
    }
  });

  it('view ก่อน reveal ไม่มีข้อความประโยคที่ยังไม่อ่าน และสายลับไม่เห็นโวหารหมู่บ้าน', () => {
    for (let seed = 0; seed < 200; seed++) {
      const n = MIN_PLAYERS + (seed % (MAX_PLAYERS - MIN_PLAYERS + 1));
      const res = startGame(poets, players.slice(0, n), undefined, createRng(seed), T0);
      if (!res.ok) throw new Error(res.error);
      const state = res.value;
      for (const viewer of state.players) {
        const view = JSON.stringify(poets.playerView(state, viewer));
        if (viewer === state.spy) expect(view).not.toContain(`"${state.figure}"`);
        else expect(view).not.toContain(`"${state.spyFigure}"`);
        for (const p of state.players) {
          if (p === viewer) continue;
          const text = all.find((s) => s.id === state.lines[p])?.text as string;
          expect(view).not.toContain(text);
        }
      }
    }
  });
});
