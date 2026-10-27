/**
 * ข้อมูลลับต้องไม่หลุด: ก่อน reveal ห้ามมีใครรู้ว่าใครเป็นสายลับ ห้ามเห็นโวหารของอีกฝั่ง
 * และห้ามเห็นประโยคของคนที่ยังไม่ได้อ่านออกเสียง — ตรวจด้วยการค้นข้อความใน JSON ที่ส่งจริง
 */
import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@batonboard/engine';
import {
  act,
  HOST,
  poets,
  readAll,
  start,
  testFigureIds,
  textOf,
  villagers,
  voteAll,
} from './fixtures';
import type { PoetsState } from './types';

const json = (state: PoetsState, viewer: PlayerId) =>
  JSON.stringify(poets.playerView(state, viewer));

/** ทุก state ก่อน reveal: เริ่มอ่าน, อ่านไปครึ่งหนึ่ง, ช่วงคุย, ระหว่างโหวต */
function secretStates(n: number, seed: number): PoetsState[] {
  const reading = start(n, seed);
  const half = act(reading, reading.order[0] as PlayerId, { type: 'READ_DONE' });
  const discussion = readAll(reading);
  const voting = act(discussion, HOST, { type: 'START_VOTE' });
  const [a, b] = discussion.players as [PlayerId, PlayerId];
  const halfVoted = voteAll(act(voting, a, { type: 'VOTE', target: b }), () => a);
  return [reading, half, discussion, voting, halfVoted].filter((s) => s.phase !== 'reveal');
}

describe('playerView ไม่รั่ว', () => {
  it('สายลับไม่เห็นโวหารหมู่บ้าน หมู่บ้านไม่เห็นโวหารสายลับ และไม่มีใครรู้ว่าใครเป็นสายลับ', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const state of secretStates(3 + (seed % 4), seed)) {
        expect(json(state, state.spy)).not.toContain(`"${state.figure}"`);
        for (const p of villagers(state)) {
          const view = json(state, p);
          expect(view).not.toContain(`"${state.spyFigure}"`);
          expect(poets.playerView(state, p).reveal).toBeNull();
        }
        // view ของสายลับกับคนอื่นมีโครงสร้างเหมือนกัน — ไม่มี field ที่บอกว่าเป็นสายลับ
        const spyView = poets.playerView(state, state.spy);
        const villagerView = poets.playerView(state, villagers(state)[0] as PlayerId);
        expect(Object.keys(spyView.you)).toEqual(Object.keys(villagerView.you));
      }
    }
  });

  it('ไม่เห็นประโยคของคนที่ยังไม่ได้อ่าน และไม่มี id ประโยคเลย', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const state of secretStates(4 + (seed % 3), seed)) {
        const unread = state.order.slice(state.readCount);
        for (const viewer of state.players) {
          const view = json(state, viewer);
          for (const p of unread) {
            if (p === viewer) continue;
            expect(view).not.toContain(textOf(state.lines[p] as string));
          }
          for (const id of Object.values(state.lines)) expect(view).not.toContain(id);
        }
      }
    }
  });

  it('ซ่อนชื่อโวหาร = view ไม่มี id โวหารเลยจนถึง reveal', () => {
    const state = start(5, 3, { discussionMs: 60_000, hideFigure: true });
    for (const p of state.players) {
      const view = json(state, p);
      for (const f of testFigureIds) expect(view).not.toContain(`"${f}"`);
    }
  });

  it('reveal เปิดเผยสายลับ โวหารทั้งสองฝั่ง และประโยคทุกคน', () => {
    const state = readAll(start(4, 2));
    const voting = act(state, HOST, { type: 'START_VOTE' });
    const done = voteAll(voting, (p) =>
      p === state.spy ? (villagers(state)[0] as string) : state.spy,
    );
    const view = poets.playerView(done, villagers(done)[0] as PlayerId);
    expect(view.reveal?.spy).toBe(done.spy);
    expect(view.reveal?.figure).toBe(done.figure);
    expect(view.reveal?.spyFigure).toBe(done.spyFigure);
    expect(view.reveal?.lines).toHaveLength(4);
  });
});
