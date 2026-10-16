/**
 * เทสต์ข้อมูลรั่วกับชุดสถานที่จริง: view ของสายลับต้องไม่มี id หรือชื่อ (ไทย/อังกฤษ)
 * ของสถานที่ปัจจุบัน และไม่มีชื่อบทบาทของใคร
 */
import { createRng, dispatchAction, startGame } from '@batonboard/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATION_SET_ID, getLocationSet } from './data';
import { spyfall } from './index';

const T0 = 1_700_000_000_000;
const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const set = getLocationSet(DEFAULT_LOCATION_SET_ID);

describe('เกม spyfall ที่ใช้ data จริง', () => {
  it('ใช้ชุดสถานที่เริ่มต้น', () => {
    const res = startGame(spyfall, players.slice(0, 4), undefined, createRng(1), T0);
    if (!res.ok) throw new Error(res.error);
    expect(spyfall.playerView(res.value, 'p1').locationSetId).toBe(DEFAULT_LOCATION_SET_ID);
  });

  it('view ของสายลับไม่มี id หรือชื่อสถานที่ปัจจุบัน และไม่มีชื่อบทบาท', () => {
    const seenLocations = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const n = 3 + (seed % 6);
      const res = startGame(spyfall, players.slice(0, n), undefined, createRng(seed), T0);
      if (!res.ok) throw new Error(res.error);
      let state = res.value;
      const location = set?.locations.find((l) => l.id === state.locationId);
      if (!location) throw new Error(`unknown location ${state.locationId}`);
      seenLocations.add(location.id);

      // ระหว่างโหวตด้วย
      const accuser = state.players.find((p) => p !== state.spy) as string;
      const voting = dispatchAction(
        spyfall,
        state,
        { type: 'ACCUSE', target: state.spy },
        accuser,
        { hostId: 'p1' },
        T0,
        createRng(seed),
      );
      for (const s of voting.ok ? [state, voting.value] : [state]) {
        const json = JSON.stringify(spyfall.playerView(s, s.spy));
        expect(json).not.toContain(location.id);
        expect(json).not.toContain(location.name.th);
        expect(json).not.toContain(location.name.en);
        for (const role of location.roles) {
          expect(json).not.toContain(role.name.th);
          expect(json).not.toContain(role.name.en);
        }
      }
      state = voting.ok ? voting.value : state;
    }
    // สุ่มได้สถานที่หลากหลายพอให้เทสต์มีความหมาย
    expect(seenLocations.size).toBeGreaterThan(15);
  });
});
