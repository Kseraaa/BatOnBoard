/**
 * เทสต์ข้อแรกและสำคัญที่สุด: ข้อมูลลับต้องไม่หลุดไปถึงผู้เล่นที่ไม่ควรเห็น
 *
 * ตรวจด้วยการค้นข้อความใน JSON ที่จะส่งผ่าน network จริง ไม่ใช่ตรวจ field
 * เพื่อจับการรั่วจาก field ที่เพิ่มทีหลังด้วย
 * (ชื่อสถานที่ไม่เคยอยู่ใน state ของกติกา — มีแค่ใน data ซึ่ง client โหลดเอง)
 */
import { describe, expect, it } from 'vitest';
import type { SpyfallState } from './types';
import {
  act,
  agents,
  PLAYER_POOL,
  spyfall,
  start,
  startVote,
  testLocations,
  voteAll,
  voteOut,
} from './fixtures';

function viewJson(state: SpyfallState, viewer: string): string {
  return JSON.stringify(spyfall.playerView(state, viewer));
}

/** ทุก state ที่ยังไม่ถึง reveal ที่ผู้เล่นเจอได้ในรอบหนึ่ง */
function secretPhases(n: number, seed: number): [string, SpyfallState][] {
  const questioning = start(n, seed);
  const [a] = agents(questioning) as [string];
  const spy = questioning.spy;
  const voting = startVote(questioning);
  // สายลับกับ a โหวตกันเองแล้ว คนอื่นยังไม่โหวต
  const halfVoted = act(act(voting, spy, { type: 'VOTE', target: a }), a, {
    type: 'VOTE',
    target: spy,
  });
  // ทุกคนโหวตคนถัดไปในวง → เสมอกันหมด → โหวตใหม่
  const ring = questioning.players;
  const revote = voteAll(voting, (p) => ring[(ring.indexOf(p) + 1) % ring.length] as string);
  return [
    ['questioning', questioning],
    ['voting', voting],
    ['voting (มีคนโหวตแล้วบางส่วน)', halfVoted],
    ['voting รอบใหม่ (เสมอ)', revote],
    ['guessing (จับสายลับได้)', voteOut(questioning, spy)],
    ['guessing (จับผิดคน)', voteOut(questioning, a)],
  ];
}

const cases = [3, 4, 5, 6, 7, 8].flatMap((n) =>
  Array.from({ length: 8 }, (_, i) => ({ n, seed: n * 100 + i })),
);

describe('playerView ของสายลับ', () => {
  it.each(cases)('ไม่มี id สถานที่ปัจจุบันและบทบาทของใคร ($n คน, seed $seed)', ({ n, seed }) => {
    for (const [phase, state] of secretPhases(n, seed)) {
      const json = viewJson(state, state.spy);
      expect(json, phase).not.toContain(state.locationId);
      for (const role of Object.values(state.roles)) {
        expect(json, phase).not.toContain(role);
      }
    }
  });

  it('รายชื่อสถานที่อ้างอิงส่งเป็นแค่ locationSetId', () => {
    const state = start();
    const view = spyfall.playerView(state, state.spy);
    expect(view.locationSetId).toBe('test-set');
    const json = JSON.stringify(view);
    for (const loc of testLocations) {
      expect(json).not.toContain(loc.id);
    }
  });
});

describe('playerView ของผู้เล่นทั่วไป', () => {
  it.each(cases)(
    'ไม่รู้ว่าใครเป็นสายลับและไม่เห็นบทบาทคนอื่น ($n คน, seed $seed)',
    ({ n, seed }) => {
      for (const [phase, state] of secretPhases(n, seed)) {
        for (const viewer of agents(state)) {
          const view = spyfall.playerView(state, viewer);
          expect(view.you, phase).toEqual({
            role: 'agent',
            locationId: state.locationId,
            roleId: state.roles[viewer],
          });

          const json = JSON.stringify(view);
          for (const other of agents(state)) {
            if (other !== viewer) expect(json, phase).not.toContain(state.roles[other]);
          }

          // ทุกที่ที่ id ของสายลับโผล่ใน view ต้องเป็นข้อมูลสาธารณะ
          // (รายชื่อผู้เล่น, คะแนน, คนถามคนแรก, ผู้สมัคร/คนที่โหวตแล้ว, ผลโหวตที่ปิดแล้ว, คนที่ถูกเลือก)
          // — ลบออกแล้วต้องไม่เหลือ
          const publicOnly = JSON.stringify({
            ...view,
            players: [],
            scores: {},
            firstAsker: null,
            vote: view.vote && { ...view.vote, candidates: [], voted: [], myVote: null },
            voteRounds: [],
            accused: null,
          });
          expect(publicOnly, phase).not.toContain(state.spy);
        }
      }
    },
  );

  it('ระหว่างโหวต ไม่เห็นว่าคนอื่นโหวตใคร (เห็นแค่ว่าโหวตแล้ว)', () => {
    const voting = startVote(start(5, 3));
    const a = act(voting, 'p-bob', { type: 'VOTE', target: 'p-cat' });
    const b = act(voting, 'p-bob', { type: 'VOTE', target: 'p-eve' });
    expect(spyfall.playerView(a, 'p-dan')).toEqual(spyfall.playerView(b, 'p-dan'));
    expect(spyfall.playerView(a, 'p-bob').vote?.myVote).toBe('p-cat');
  });

  it('ช่วงสายลับทาย ไม่บอกว่าคนที่ถูกเลือกเป็นสายลับหรือไม่', () => {
    const state = start(5, 3);
    const [viewer, other] = agents(state) as [string, string];
    const caught = voteOut(state, state.spy);
    const view = spyfall.playerView(caught, viewer);
    expect(view.accused).toBe(state.spy);
    expect(view.result).toBeNull();
    expect(view.reveal).toBeNull();
    // โครง view เหมือนกรณีจับผิดคน ต่างกันแค่ชื่อคนที่ถูกเลือก
    const missed = spyfall.playerView(voteOut(state, other), viewer);
    expect(Object.keys(missed)).toEqual(Object.keys(view));
    expect(missed.phase).toBe(view.phase);
  });

  it('view ของผู้เล่นทั่วไปเหมือนกันไม่ว่าสายลับจะเป็นใคร', () => {
    // สลับสายลับระหว่างสองคนที่ไม่ใช่ผู้ดู แล้ว view ของผู้ดูต้องไม่เปลี่ยน
    const state = start(5, 3);
    const [viewer, other] = agents(state) as [string, string];
    const swapped: SpyfallState = {
      ...state,
      spy: other,
      roles: Object.fromEntries(
        Object.entries({ ...state.roles, [state.spy]: state.roles[other] as string }).filter(
          ([p]) => p !== other,
        ),
      ),
    };
    expect(spyfall.playerView(swapped, viewer)).toEqual(spyfall.playerView(state, viewer));
  });
});

describe('playerView ของคนที่ไม่อยู่ในรอบ', () => {
  it('ไม่ได้ข้อมูลลับใด ๆ', () => {
    const state = start(4);
    const outsider = PLAYER_POOL[7] as string;
    const view = spyfall.playerView(state, outsider);
    expect(view.you).toEqual({ role: 'spectator' });
    const json = JSON.stringify(view);
    expect(json).not.toContain(state.locationId);
    for (const role of Object.values(state.roles)) expect(json).not.toContain(role);
  });
});

describe('phase reveal', () => {
  it('เปิดเผยสายลับ สถานที่ และบทบาททุกคนให้ทุกคน', () => {
    const state = start(4);
    const s = act(voteOut(state, state.spy), state.spy, {
      type: 'SPY_GUESS',
      locationId: 'loc-bakery',
    });
    expect(s.phase).toBe('reveal');
    for (const viewer of s.players) {
      const view = spyfall.playerView(s, viewer);
      expect(view.reveal).toEqual({
        spy: s.spy,
        locationId: s.locationId,
        roles: s.roles,
        spyGuess: 'loc-bakery',
      });
    }
  });
});
