import { createRng, fireDeadline, removePlayer, startGame } from '@batonboard/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DURATION_MS, GUESS_MS, SpyfallError, VOTE_MS } from './constants';
import { createSpyfall } from './game';
import type { SpyfallState } from './types';
import {
  act,
  agents,
  HOST,
  players,
  spyfall,
  start,
  startVote,
  T0,
  testLocations,
  timeUp,
  tryAct,
  voteAll,
  voteOut,
} from './fixtures';

const wrongLocation = (state: SpyfallState) =>
  testLocations.find((l) => l.id !== state.locationId)?.id as string;

describe('แจกการ์ด', () => {
  it.each([3, 4, 5, 6, 7, 8])(
    'มีสายลับ 1 คนพอดี คนที่เหลือได้สถานที่เดียวกันและบทบาทไม่ซ้ำ (%i คน)',
    (n) => {
      for (let seed = 0; seed < 30; seed++) {
        const state = start(n, seed);
        expect(state.players).toEqual(players(n));
        expect(state.players).toContain(state.spy);
        expect(Object.keys(state.roles).sort()).toEqual(agents(state).sort());
        expect(state.roles[state.spy]).toBeUndefined();

        const spies = state.players.filter((p) => spyfall.playerView(state, p).you.role === 'spy');
        expect(spies).toEqual([state.spy]);

        const locationRoles = testLocations.find((l) => l.id === state.locationId)?.roles;
        const locationIds = new Set(
          agents(state).map((p) => {
            const you = spyfall.playerView(state, p).you;
            return you.role === 'agent' ? you.locationId : null;
          }),
        );
        expect(locationIds).toEqual(new Set([state.locationId]));

        const roles = Object.values(state.roles);
        expect(new Set(roles).size).toBe(roles.length);
        for (const r of roles) expect(locationRoles).toContain(r);

        expect(state.players).toContain(state.firstAsker);
      }
    },
  );

  it('เริ่มที่ questioning พร้อมเวลาจากตั้งค่าห้อง', () => {
    const state = start(4, 1);
    expect(state.phase).toBe('questioning');
    expect(state.deadline).toBe(T0 + DEFAULT_DURATION_MS);
    expect(start(4, 1, { durationMs: 120_000 }).deadline).toBe(T0 + 120_000);
  });

  it('ปฏิเสธตั้งค่าห้องที่ผิด', () => {
    for (const options of [{ durationMs: 1 }, { durationMs: 'x' }, {}]) {
      expect(startGame(spyfall, players(4), options, createRng(1), T0)).toEqual({
        ok: false,
        error: 'invalid-options',
      });
    }
  });

  it('สุ่มทั้งสายลับ สถานที่ และคนถามคนแรก', () => {
    const states = Array.from({ length: 50 }, (_, seed) => start(5, seed));
    expect(new Set(states.map((s) => s.spy)).size).toBeGreaterThan(1);
    expect(new Set(states.map((s) => s.locationId)).size).toBeGreaterThan(1);
    expect(new Set(states.map((s) => s.firstAsker)).size).toBeGreaterThan(1);
  });
});

describe('เริ่มโหวต', () => {
  it('host กดเริ่มโหวตได้ระหว่างถามตอบ: ทุกคนเป็นผู้สมัคร และมีเวลาโหวต', () => {
    const s = startVote(start(4), T0 + 30_000);
    expect(s.phase).toBe('voting');
    expect(s.voting).toEqual({ candidates: s.players, ballots: {} });
    expect(s.deadline).toBe(T0 + 30_000 + VOTE_MS);
  });

  it('คนที่ไม่ใช่ host เริ่มไม่ได้ และเริ่มซ้ำไม่ได้', () => {
    const s = start(4);
    expect(tryAct(s, 'p-bob', { type: 'START_VOTE' })).toBe(SpyfallError.NotHost);
    expect(tryAct(startVote(s), HOST, { type: 'START_VOTE' })).toBe(SpyfallError.WrongPhase);
  });

  it('หมดเวลาถามตอบ → เริ่มโหวตเอง', () => {
    const s = start(4, 8);
    expect(fireDeadline(spyfall, s, T0 + DEFAULT_DURATION_MS - 1)).toBe(s);
    const voting = timeUp(s);
    expect(voting.phase).toBe('voting');
    expect(voting.deadline).toBe(T0 + DEFAULT_DURATION_MS + VOTE_MS);
  });
});

describe('ต่างคนต่างโหวต', () => {
  it('โหวตได้คนละครั้ง โหวตตัวเองหรือคนนอกรอบไม่ได้', () => {
    let s = startVote(start(4));
    expect(tryAct(s, 'p-bob', { type: 'VOTE', target: 'p-bob' })).toBe(SpyfallError.CannotVoteSelf);
    expect(tryAct(s, 'p-bob', { type: 'VOTE', target: 'p-zed' })).toBe(SpyfallError.NotACandidate);
    s = act(s, 'p-bob', { type: 'VOTE', target: 'p-cat' });
    expect(tryAct(s, 'p-bob', { type: 'VOTE', target: 'p-dan' })).toBe(SpyfallError.AlreadyVoted);
  });

  it('view บอกว่าใครโหวตแล้ว แต่ไม่บอกว่าโหวตใคร ยกเว้นบัตรของตัวเอง', () => {
    let s = startVote(start(4));
    s = act(s, 'p-bob', { type: 'VOTE', target: 'p-cat' });
    expect(spyfall.playerView(s, 'p-bob').vote).toEqual({
      round: 1,
      candidates: s.players,
      voted: ['p-bob'],
      myVote: 'p-cat',
    });
    const other = spyfall.playerView(s, 'p-dan');
    expect(other.vote).toEqual({ round: 1, candidates: s.players, voted: ['p-bob'], myVote: null });
    expect(other.voteRounds).toEqual([]);
  });

  it('เสียงส่วนใหญ่เลือก แล้วเข้าช่วงสายลับทาย', () => {
    const s = start(5, 2);
    const [a, b] = agents(s) as [string, string];
    // a ได้ 4 เสียง (ทุกคนยกเว้นตัวเอง) b ได้ 1 เสียง (จาก a)
    const votes = Object.fromEntries(s.players.map((p) => [p, p === a ? b : a]));
    const out = voteAll(startVote(s), (p) => votes[p] as string, T0 + 1_000);
    expect(out.phase).toBe('guessing');
    expect(out.accused).toBe(a);
    expect(out.deadline).toBe(T0 + 1_000 + GUESS_MS);
    expect(out.voteRounds).toHaveLength(1);
    expect(out.voteRounds[0]?.ballots).toEqual(votes);
  });

  it('สายลับโหวตด้วยและนับคะแนน', () => {
    const s = start(4, 3);
    const [a, b, c] = agents(s) as [string, string, string];
    // a กับ b โหวตกันเอง c โหวต a สายลับโหวต b → เสมอ 2-2 ถ้าไม่นับสายลับจะเป็น a ชนะ 2-1
    const pick: Record<string, string> = { [a]: b, [b]: a, [c]: a, [s.spy]: b };
    const out = voteAll(startVote(s), (p) => pick[p] as string);
    expect(out.phase).toBe('voting');
    expect(out.voting?.candidates.sort()).toEqual([a, b].sort());
  });

  it('คะแนนเสมอ → โหวตใหม่เฉพาะคนที่เสมอ แล้วตัดสินจากรอบใหม่', () => {
    const s = start(4, 4);
    const [a, b, c] = agents(s) as [string, string, string];
    let out = voteAll(startVote(s), (p) => ({ [a]: b, [b]: a, [c]: a, [s.spy]: b })[p] as string);
    expect(out.voteRounds).toHaveLength(1);
    expect(spyfall.playerView(out, c).vote?.round).toBe(2);
    // ผู้สมัครรอบสองเลือกได้แค่คนที่เสมอ
    expect(tryAct(out, a, { type: 'VOTE', target: c })).toBe(SpyfallError.NotACandidate);
    out = voteAll(out, (p) => (p === b ? a : b));
    expect(out.phase).toBe('guessing');
    expect(out.accused).toBe(b);
    expect(out.voteRounds).toHaveLength(2);
  });

  it('เสมออีกครั้งในรอบสอง = ไม่มีใครถูกเลือก (นับเป็นโหวตผิด)', () => {
    const s = start(4, 4);
    const [a, b, c] = agents(s) as [string, string, string];
    const tie = (p: string) => ({ [a]: b, [b]: a, [c]: a, [s.spy]: b })[p] as string;
    const out = voteAll(voteAll(startVote(s), tie), tie);
    expect(out.phase).toBe('guessing');
    expect(out.accused).toBeNull();
  });

  it('หมดเวลาโหวต: คนที่ไม่โหวตงดออกเสียง ตัดสินจากบัตรที่มี', () => {
    let s = startVote(start(4, 5));
    s = act(s, 'p-bob', { type: 'VOTE', target: 'p-cat' });
    s = timeUp(s);
    expect(s.phase).toBe('guessing');
    expect(s.accused).toBe('p-cat');
    expect(s.voteRounds[0]?.ballots).toEqual({
      'p-ann': null,
      'p-bob': 'p-cat',
      'p-cat': null,
      'p-dan': null,
    });
  });

  it('ไม่มีใครโหวตเลย = ไม่มีใครถูกเลือก ไม่ต้องโหวตใหม่', () => {
    const s = timeUp(startVote(start(4, 5)));
    expect(s.phase).toBe('guessing');
    expect(s.accused).toBeNull();
    expect(s.voteRounds).toHaveLength(1);
  });
});

describe('สายลับทายสถานที่', () => {
  it('ห้ามเปิดตัวก่อน: ทายระหว่างถามตอบหรือโหวตไม่ได้', () => {
    const s = start(4, 14);
    expect(tryAct(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId })).toBe(
      SpyfallError.WrongPhase,
    );
    expect(tryAct(startVote(s), s.spy, { type: 'SPY_GUESS', locationId: s.locationId })).toBe(
      SpyfallError.WrongPhase,
    );
  });

  it('คนที่ไม่ใช่สายลับทายไม่ได้ และสถานที่ต้องมีอยู่จริง', () => {
    const s = voteOut(start(4, 16), 'p-bob');
    expect(tryAct(s, agents(s)[0] as string, { type: 'SPY_GUESS', locationId: s.locationId })).toBe(
      SpyfallError.NotSpy,
    );
    expect(tryAct(s, s.spy, { type: 'SPY_GUESS', locationId: 'loc-nowhere' })).toBe(
      SpyfallError.UnknownLocation,
    );
  });

  it('โหวตถูก + สายลับทายถูก = สายลับชนะ', () => {
    let s = voteOut(start(4, 20), start(4, 20).spy);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });
    expect(s.result).toEqual({
      winner: 'spy',
      winners: [s.spy],
      reason: 'caught-spy-guessed',
      points: 1,
    });
    expect(s.spyGuess).toBe(s.locationId);
    expect(s.scores[s.spy]).toBe(1);
  });

  it('โหวตถูก + สายลับทายผิด = เฉพาะคนที่โหวตถูกชนะ', () => {
    const s0 = start(5, 21);
    const [a, b, c, d] = agents(s0) as [string, string, string, string];
    // a, b, c โหวตสายลับ / d โหวต a / สายลับโหวต a
    const pick: Record<string, string> = {
      [a]: s0.spy,
      [b]: s0.spy,
      [c]: s0.spy,
      [d]: a,
      [s0.spy]: a,
    };
    let s = voteAll(startVote(s0), (p) => pick[p] as string);
    expect(s.accused).toBe(s0.spy);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: wrongLocation(s) });
    expect(s.result?.winner).toBe('voters');
    expect(s.result?.reason).toBe('caught');
    expect(s.result?.winners.sort()).toEqual([a, b, c].sort());
    expect([a, b, c, d, s.spy].map((p) => s.scores[p])).toEqual([1, 1, 1, 0, 0]);
  });

  it('โหวตผิด + สายลับทายถูก = สายลับได้ 2 แต้ม', () => {
    const s0 = start(4, 22);
    let s = voteOut(s0, agents(s0)[0] as string);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });
    expect(s.result).toEqual({
      winner: 'spy',
      winners: [s.spy],
      reason: 'missed-spy-guessed',
      points: 2,
    });
    expect(s.scores[s.spy]).toBe(2);
  });

  it('โหวตผิด + สายลับทายผิด = สายลับได้ 1 แต้ม', () => {
    const s0 = start(4, 23);
    let s = voteOut(s0, agents(s0)[0] as string);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: wrongLocation(s) });
    expect(s.result).toEqual({ winner: 'spy', winners: [s.spy], reason: 'missed', points: 1 });
    expect(agents(s).map((p) => s.scores[p])).toEqual([0, 0, 0]);
    expect(s.scores[s.spy]).toBe(1);
  });

  it('สายลับไม่ทายภายในเวลา = ทายผิด', () => {
    const s0 = start(4, 24);
    const s = timeUp(voteOut(s0, s0.spy, T0 + 1_000));
    expect(s.spyGuess).toBeNull();
    expect(s.result?.reason).toBe('caught');
    expect(s.result?.winners.sort()).toEqual(agents(s0).sort());
  });

  it('จับได้ในรอบโหวตใหม่ = คนที่โหวตถูกนับจากรอบที่ตัดสิน', () => {
    const s0 = start(4, 4);
    const [a, b, c] = agents(s0) as [string, string, string];
    // รอบแรก: a กับสายลับเสมอ
    let s = voteAll(
      startVote(s0),
      (p) => ({ [a]: s0.spy, [b]: a, [c]: s0.spy, [s0.spy]: a })[p] as string,
    );
    expect(s.phase).toBe('voting');
    // รอบสอง: a, b, c เลือกสายลับ (a เปลี่ยนใจไม่ได้ เพราะเลือกตัวเองไม่ได้ จึงเลือกสายลับ)
    s = voteAll(s, (p) => (p === s0.spy ? a : s0.spy));
    expect(s.accused).toBe(s0.spy);
    s = act(s, s0.spy, { type: 'SPY_GUESS', locationId: wrongLocation(s) });
    expect(s.result?.winners.sort()).toEqual([a, b, c].sort());
  });
});

describe('action ผิดคนหรือผิด phase ถูกปฏิเสธ', () => {
  const s = start(4, 17);
  const s0 = start(4, 17);
  const guessing = voteOut(s0, s0.spy);
  const revealed = act(guessing, s0.spy, { type: 'SPY_GUESS', locationId: s0.locationId });

  it.each([
    [
      'VOTE ตอนยังไม่เริ่มโหวต',
      s,
      'p-bob',
      { type: 'VOTE', target: 'p-cat' },
      SpyfallError.WrongPhase,
    ],
    ['NEXT_ROUND ก่อน reveal', s, HOST, { type: 'NEXT_ROUND' }, SpyfallError.WrongPhase],
    [
      'NEXT_ROUND โดยคนที่ไม่ใช่ host',
      revealed,
      'p-bob',
      { type: 'NEXT_ROUND' },
      SpyfallError.NotHost,
    ],
    [
      'VOTE หลัง reveal',
      revealed,
      'p-bob',
      { type: 'VOTE', target: 'p-cat' },
      SpyfallError.WrongPhase,
    ],
    ['START_VOTE ตอนสายลับทาย', guessing, HOST, { type: 'START_VOTE' }, SpyfallError.WrongPhase],
    ['คนนอกรอบส่ง action', s, 'p-zed', { type: 'START_VOTE' }, SpyfallError.NotAPlayer],
    ['payload ผิดรูป', s, 'p-bob', { type: 'VOTE' }, 'invalid-action'],
    [
      'action แบบเก่า (กล่าวหา) ใช้ไม่ได้แล้ว',
      s,
      'p-bob',
      { type: 'ACCUSE', target: 'p-cat' },
      'invalid-action',
    ],
  ])('%s', (_name, state, by, action, error) => {
    expect(tryAct(state, by, action)).toBe(error);
  });

  it('host เริ่มรอบใหม่ได้: สุ่มใหม่ เปลี่ยนสถานที่ เก็บคะแนน และล้างผลโหวต', () => {
    const next = act(revealed, HOST, { type: 'NEXT_ROUND' }, T0 + 5_000, 99);
    expect(next.phase).toBe('questioning');
    expect(next.locationId).not.toBe(revealed.locationId);
    expect(next.scores).toEqual(revealed.scores);
    expect(next.deadline).toBe(T0 + 5_000 + DEFAULT_DURATION_MS);
    expect(next.result).toBeNull();
    expect(next.voteRounds).toEqual([]);
    expect(next.accused).toBeNull();
  });
});

describe('ผู้เล่นออกกลางเกม', () => {
  it('สายลับออก = ทุกคนที่เหลือชนะ', () => {
    const s = start(4, 18);
    const after = removePlayer(spyfall, s, s.spy, T0);
    expect(after.result).toEqual({
      winner: 'voters',
      winners: agents(s),
      reason: 'spy-left',
      points: 1,
    });
    expect(after.players).not.toContain(s.spy);
  });

  it('เหลือน้อยกว่า 3 คน = จบโดยไม่มีผู้ชนะ และ isOver', () => {
    const s = start(3, 19);
    const after = removePlayer(spyfall, s, agents(s)[0] as string, T0);
    expect(after.result).toEqual({
      winner: null,
      winners: [],
      reason: 'not-enough-players',
      points: 1,
    });
    expect(spyfall.isOver(after)).toBe(true);
    expect(tryAct(after, HOST, { type: 'NEXT_ROUND' })).toBe('game-over');
  });

  it('คนที่ยังไม่โหวตออก = ปิดรอบถ้าที่เหลือโหวตครบ และไม่นับเสียงที่ให้คนที่ออก', () => {
    const s0 = start(5, 21);
    const [a, b, c, d] = agents(s0) as [string, string, string, string];
    let s = startVote(s0);
    // ทุกคนยกเว้น d โหวตแล้ว: a ได้ 2 (จาก b, สายลับ) d ได้ 2 (จาก a, c)
    s = act(s, a, { type: 'VOTE', target: d });
    s = act(s, c, { type: 'VOTE', target: d });
    s = act(s, b, { type: 'VOTE', target: a });
    s = act(s, s0.spy, { type: 'VOTE', target: a });
    s = removePlayer(spyfall, s, d, T0);
    expect(s.phase).toBe('guessing');
    expect(s.accused).toBe(a);
  });

  it('ออกตอน reveal แค่ลบออกจากรายชื่อ', () => {
    const s0 = start(4, 23);
    const s = act(voteOut(s0, s0.spy), s0.spy, { type: 'SPY_GUESS', locationId: s0.locationId });
    const quitter = agents(s)[0] as string;
    const after = removePlayer(spyfall, s, quitter, T0);
    expect(after.players).not.toContain(quitter);
    expect(after.result).toEqual(s.result);
  });
});

describe('ห้องที่เล่นค้างจากกติกาเก่า', () => {
  it('phase เก่าไม่ทำให้พัง: deadline ถูกล้าง และ view ยังสร้างได้', () => {
    const old = {
      ...start(4),
      phase: 'final-vote',
      voteRounds: undefined,
    } as unknown as SpyfallState;
    const next = fireDeadline(spyfall, old, T0 + DEFAULT_DURATION_MS);
    expect(next.deadline).toBeNull();
    expect(spyfall.playerView(next, 'p-bob').voteRounds).toEqual([]);
  });
});

describe('seeded rng', () => {
  function playScript(seed: number): SpyfallState[] {
    const trail: SpyfallState[] = [];
    let s = start(6, seed);
    trail.push(s);
    s = voteOut(s, agents(s)[0] as string, T0 + 1_000);
    trail.push(s);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: wrongLocation(s) }, T0 + 3_000);
    s = act(s, HOST, { type: 'NEXT_ROUND' }, T0 + 4_000, seed);
    trail.push(s);
    return trail;
  }

  it('seed เดิม + action เดิม = ผลเหมือนเดิมทุกขั้น', () => {
    expect(playScript(31)).toEqual(playScript(31));
  });

  it('seed ต่างกันให้ผลต่างกัน', () => {
    const results = new Set(
      Array.from({ length: 10 }, (_, seed) => JSON.stringify(start(6, seed))),
    );
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('createSpyfall', () => {
  it('ปฏิเสธชุดสถานที่ที่ใช้ไม่ได้', () => {
    const roles = Array.from({ length: 7 }, (_, i) => `r${i}`);
    const good = { id: 'a', roles };
    expect(() => createSpyfall({ locationSetId: 'x', locations: [good] })).toThrow(/at least 2/);
    expect(() => createSpyfall({ locationSetId: 'x', locations: [good, good] })).toThrow(/unique/);
    expect(() =>
      createSpyfall({ locationSetId: 'x', locations: [good, { id: 'b', roles: roles.slice(1) }] }),
    ).toThrow(/7 unique roles/);
    expect(() =>
      createSpyfall({
        locationSetId: 'x',
        locations: [good, { id: 'b', roles: [...roles.slice(1), 'r1'] }],
      }),
    ).toThrow(/7 unique roles/);
  });
});
