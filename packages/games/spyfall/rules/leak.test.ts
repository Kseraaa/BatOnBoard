/**
 * เทสต์ข้อแรกและสำคัญที่สุด: ข้อมูลลับต้องไม่หลุดไปถึงผู้เล่นที่ไม่ควรเห็น
 *
 * ตรวจด้วยการค้นข้อความใน JSON ที่จะส่งผ่าน network จริง ไม่ใช่ตรวจ field
 * เพื่อจับการรั่วจาก field ที่เพิ่มทีหลังด้วย
 * (ชื่อสถานที่ไม่เคยอยู่ใน state ของกติกา — มีแค่ใน data ซึ่ง client โหลดเอง)
 */
import { describe, expect, it } from 'vitest';
import type { SpyfallState } from './types';
import { act, agents, PLAYER_POOL, spyfall, start, testLocations, timeUp } from './fixtures';

function viewJson(state: SpyfallState, viewer: string): string {
  return JSON.stringify(spyfall.playerView(state, viewer));
}

/** ทุก state ที่ยังไม่ถึง reveal ที่ผู้เล่นเจอได้ในรอบหนึ่ง */
function secretPhases(n: number, seed: number): [string, SpyfallState][] {
  const questioning = start(n, seed);
  const [a, b] = agents(questioning) as [string, string];
  const accusingSpy = act(questioning, a, { type: 'ACCUSE', target: questioning.spy });
  const accusingAgent = act(questioning, questioning.spy, { type: 'ACCUSE', target: b });
  const finalVote = timeUp(questioning);
  const finalVoting = act(finalVote, a, { type: 'ACCUSE', target: b });
  // โหวตไม่ผ่าน (มีผลโหวตล่าสุดใน view) — กรณี 3 คน b อาจเป็นคนเดียวที่โหวตได้
  const failed = act(accusingAgent, a, { type: 'BALLOT', agree: false });
  return [
    ['after failed vote', failed],
    ['questioning', questioning],
    ['voting (สายลับถูกกล่าวหา)', accusingSpy],
    ['voting (สายลับเป็นคนกล่าวหา)', accusingAgent],
    ['final-vote', finalVote],
    ['final-vote voting', finalVoting],
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
          // (รายชื่อผู้เล่น, คะแนน, คนถามคนแรก, คนที่กล่าวหา/ถูกกล่าวหา/ใช้สิทธิ์แล้ว, ผลโหวตที่ตัดสินแล้ว)
          // — ลบออกแล้วต้องไม่เหลือ
          const publicOnly = JSON.stringify({
            ...view,
            players: [],
            scores: {},
            firstAsker: null,
            usedAccusation: [],
            finalTurns: [],
            vote: view.vote && { ...view.vote, accuser: null, accused: null, voted: [] },
            lastVote: view.lastVote && {
              ...view.lastVote,
              accuser: null,
              accused: null,
              ballots: {},
            },
          });
          expect(publicOnly, phase).not.toContain(state.spy);
        }
      }
    },
  );

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
    const [a] = agents(state) as [string];
    let s = act(state, a, { type: 'ACCUSE', target: state.spy });
    for (const p of agents(state).filter((p) => p !== a))
      s = act(s, p, { type: 'BALLOT', agree: true });
    expect(s.phase).toBe('reveal');
    for (const viewer of s.players) {
      const view = spyfall.playerView(s, viewer);
      expect(view.reveal).toEqual({
        spy: s.spy,
        locationId: s.locationId,
        roles: s.roles,
        spyGuess: null,
      });
    }
  });
});
