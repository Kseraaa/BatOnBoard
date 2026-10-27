/** ตรวจข้อมูลจริง: ทุกหมู่บ้านมีชื่อ แจกได้ครบ 6 คน และ view ไม่รั่ว */
import { createRng, startGame } from '@batonboard/engine';
import { describe, expect, it } from 'vitest';
import { FIGURES, getFigure, VILLAGE_FIGURES } from './data/figures';
import { VILLAGES } from './data/sentences';
import { poets } from './index';
import { MAX_PLAYERS, MIN_PLAYERS } from './rules';

const T0 = 1_700_000_000_000;
const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const all = VILLAGES.flatMap((v) => [...v.sentences, ...v.decoys]);

describe('ข้อมูลหมู่บ้าน', () => {
  it('6 หมู่บ้าน ประโยคถูก 5 ข้อหลอก 1 ทุกโวหารที่อ้างถึงมีชื่อไทย/อังกฤษ', () => {
    expect(VILLAGES).toHaveLength(6);
    expect(VILLAGES.map((v) => v.figure)).toEqual(VILLAGE_FIGURES);
    for (const v of VILLAGES) {
      expect(v.sentences).toHaveLength(MAX_PLAYERS - 1);
      expect(v.decoys).toHaveLength(1);
      const ids = [v.figure, ...v.decoys.map((d) => d.figure), ...all.flatMap((s) => s.also ?? [])];
      for (const id of ids) expect(getFigure(id), id).toBeDefined();
    }
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

  it('view ก่อน reveal ไม่มีข้อความประโยคที่ยังไม่อ่าน และฆาตกรไม่เห็นหมู่บ้านจริง', () => {
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
