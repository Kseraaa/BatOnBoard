import { createRng, fireDeadline, removePlayer, startGame } from '@batonboard/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DURATION_MS, FINAL_VOTE_MS, SpyfallError, VOTE_MS } from './constants';
import { createSpyfall } from './game';
import type { SpyfallState } from './types';
import {
  act,
  agents,
  HOST,
  players,
  spyfall,
  start,
  T0,
  testLocations,
  timeUp,
  tryAct,
} from './fixtures';

/** ทุกคนที่ต้องโหวต (ไม่ใช่ผู้กล่าวหาและผู้ถูกกล่าวหา) โหวตตาม agree */
function voteAll(state: SpyfallState, agree: boolean, now = T0): SpyfallState {
  const vote = state.vote;
  if (!vote) throw new Error('no vote');
  let s = state;
  for (const p of state.players) {
    if (p !== vote.accuser && p !== vote.accused && s.phase === 'voting') {
      s = act(s, p, { type: 'BALLOT', agree }, now);
    }
  }
  return s;
}

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

describe('กล่าวหา', () => {
  it('ผู้เล่นกล่าวหาได้คนละ 1 ครั้งต่อรอบ', () => {
    let s = start(5, 2);
    const [a, b] = agents(s) as [string, string];
    s = act(s, s.spy, { type: 'ACCUSE', target: a });
    s = voteAll(s, false);
    expect(s.phase).toBe('questioning');
    expect(s.usedAccusation).toEqual([s.spy]);

    expect(tryAct(s, s.spy, { type: 'ACCUSE', target: b })).toBe(SpyfallError.AccusationUsed);
    // คนอื่นยังใช้สิทธิ์ของตัวเองได้
    expect(tryAct(s, a, { type: 'ACCUSE', target: b })).toBeNull();
  });

  it('สิทธิ์กลับมาใหม่ในรอบถัดไป', () => {
    let s = start(4, 2);
    const [a] = agents(s) as [string];
    s = act(s, s.spy, { type: 'ACCUSE', target: a });
    s = voteAll(s, false);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });
    s = act(s, HOST, { type: 'NEXT_ROUND' });
    expect(s.usedAccusation).toEqual([]);
  });

  it('กล่าวหาตัวเองหรือคนที่ไม่อยู่ในรอบไม่ได้', () => {
    const s = start(4);
    expect(tryAct(s, 'p-bob', { type: 'ACCUSE', target: 'p-bob' })).toBe(
      SpyfallError.CannotAccuseSelf,
    );
    expect(tryAct(s, 'p-bob', { type: 'ACCUSE', target: 'p-zed' })).toBe(
      SpyfallError.UnknownPlayer,
    );
  });
});

describe('โหวต', () => {
  it('ผ่านเมื่อทุกคนยกเว้นผู้ถูกกล่าวหาเห็นด้วย และผู้กล่าวหานับเป็นเห็นด้วยอัตโนมัติ', () => {
    let s = start(5, 4);
    const [a] = agents(s) as [string];
    s = act(s, a, { type: 'ACCUSE', target: s.spy });
    expect(s.vote?.ballots).toEqual({ [a]: true });

    const others = agents(s).filter((p) => p !== a);
    for (const p of others.slice(0, -1)) {
      s = act(s, p, { type: 'BALLOT', agree: true });
      expect(s.phase).toBe('voting');
    }
    s = act(s, others.at(-1) as string, { type: 'BALLOT', agree: true });
    expect(s.phase).toBe('reveal');
  });

  it('ผู้ถูกกล่าวหาโหวตไม่ได้ และโหวตซ้ำไม่ได้', () => {
    let s = start(5, 4);
    const [a, b, c] = agents(s) as [string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    expect(tryAct(s, b, { type: 'BALLOT', agree: false })).toBe(SpyfallError.AccusedCannotVote);
    expect(tryAct(s, a, { type: 'BALLOT', agree: false })).toBe(SpyfallError.AlreadyVoted);
    s = act(s, c, { type: 'BALLOT', agree: true });
    expect(tryAct(s, c, { type: 'BALLOT', agree: false })).toBe(SpyfallError.AlreadyVoted);
  });

  it('มีคนไม่เห็นด้วยคนเดียวก็ไม่ผ่านทันที', () => {
    let s = start(6, 4);
    const [a, b, c] = agents(s) as [string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = act(s, c, { type: 'BALLOT', agree: false });
    expect(s.phase).toBe('questioning');
    expect(s.vote).toBeNull();
  });

  it('จับสายลับได้ = ฝ่ายผู้เล่นชนะ', () => {
    let s = start(4, 5);
    s = act(s, agents(s)[0] as string, { type: 'ACCUSE', target: s.spy });
    s = voteAll(s, true);
    expect(s.result).toEqual({ winner: 'agents', reason: 'spy-caught' });
    for (const p of agents(s)) expect(s.scores[p]).toBe(1);
    expect(s.scores[s.spy]).toBe(0);
  });

  it('จับผิดคน = สายลับชนะ', () => {
    let s = start(4, 5);
    const [a, b] = agents(s) as [string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = voteAll(s, true);
    expect(s.result).toEqual({ winner: 'spy', reason: 'innocent-convicted' });
    expect(s.scores[s.spy]).toBe(1);
  });

  it('หมดเวลาโหวต = ไม่ผ่าน (คนที่ไม่โหวตนับเป็นไม่เห็นด้วย)', () => {
    let s = start(5, 6);
    const [a, b, c] = agents(s) as [string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: b }, T0 + 1_000);
    s = act(s, c, { type: 'BALLOT', agree: true }, T0 + 2_000);
    expect(spyfall.nextDeadline?.(s)).toBe(T0 + 1_000 + VOTE_MS);
    expect(fireDeadline(spyfall, s, T0 + 1_000 + VOTE_MS - 1)).toBe(s);
    s = fireDeadline(spyfall, s, T0 + 1_000 + VOTE_MS);
    expect(s.phase).toBe('questioning');
    expect(s.result).toBeNull();
  });

  it('view แสดงว่าใครโหวตแล้ว แต่ไม่แสดงว่าโหวตอะไร', () => {
    let s = start(5, 6);
    const [a, b, c] = agents(s) as [string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = act(s, c, { type: 'BALLOT', agree: true });
    const view = spyfall.playerView(s, b);
    expect(view.vote).toEqual({ accuser: a, accused: b, voted: [a, c], deadline: T0 + VOTE_MS });
  });
});

describe('ผลโหวตล่าสุด (lastVote)', () => {
  it('ระหว่างโหวตยังไม่มี แล้วเปิดเผยว่าใครโหวตอะไรหลังตัดสินว่าไม่ผ่าน', () => {
    let s = start(6, 4);
    const [a, b, c] = agents(s) as [string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    expect(spyfall.playerView(s, c).lastVote).toBeNull();
    s = act(s, c, { type: 'BALLOT', agree: false });
    const ballots = Object.fromEntries(
      s.players.filter((p) => p !== b).map((p) => [p, p === a ? true : p === c ? false : null]),
    );
    const expected = { accuser: a, accused: b, final: false, ballots, passed: false };
    expect(s.lastVote).toEqual(expected);
    expect(spyfall.playerView(s, s.spy).lastVote).toEqual(expected);
  });

  it('โหวตผ่านเก็บผลไว้ให้ reveal', () => {
    let s = start(4, 5);
    const a = agents(s)[0] as string;
    s = act(s, a, { type: 'ACCUSE', target: s.spy });
    s = voteAll(s, true);
    expect(s.phase).toBe('reveal');
    expect(s.lastVote?.passed).toBe(true);
    expect(Object.values(s.lastVote?.ballots ?? {})).toEqual([true, true, true]);
  });

  it('หมดเวลาโหวต: คนที่ไม่ได้โหวตเป็น null', () => {
    let s = start(4, 6);
    const [a, b] = agents(s) as [string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = fireDeadline(spyfall, s, T0 + VOTE_MS);
    expect(s.lastVote?.passed).toBe(false);
    expect(Object.values(s.lastVote?.ballots ?? {}).filter((v) => v === null)).toHaveLength(2);
  });

  it('จบรอบด้วยเหตุอื่นหรือแจกไพ่ใหม่ = ล้างผลโหวต', () => {
    let s = start(6, 4);
    const [a, b, c] = agents(s) as [string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = act(s, c, { type: 'BALLOT', agree: false });
    expect(s.lastVote).not.toBeNull();
    const guessed = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });
    expect(guessed.lastVote).toBeNull();
    const next = act(guessed, HOST, { type: 'NEXT_ROUND' }, T0 + 5_000);
    expect(next.lastVote).toBeNull();
  });
});

describe('เวลา', () => {
  it('หยุดตอนโหวตและเดินต่อจาก pausedRemaining', () => {
    let s = start(4, 7);
    const [a, b] = agents(s) as [string, string];
    s = act(s, a, { type: 'ACCUSE', target: b }, T0 + 100_000);
    expect(s.deadline).toBeNull();
    expect(s.pausedRemaining).toBe(DEFAULT_DURATION_MS - 100_000);
    expect(spyfall.playerView(s, a).pausedRemaining).toBe(DEFAULT_DURATION_MS - 100_000);

    s = voteAll(s, false, T0 + 130_000);
    expect(s.pausedRemaining).toBeNull();
    expect(s.deadline).toBe(T0 + 130_000 + DEFAULT_DURATION_MS - 100_000);
  });

  it('หมดเวลาถามตอบ → final-vote ที่มีเวลาของตัวเอง', () => {
    let s = start(4, 8);
    expect(fireDeadline(spyfall, s, T0 + DEFAULT_DURATION_MS - 1)).toBe(s);
    s = timeUp(s);
    expect(s.phase).toBe('final-vote');
    expect(s.deadline).toBe(T0 + DEFAULT_DURATION_MS + FINAL_VOTE_MS);
  });
});

describe('final-vote', () => {
  it('ทุกคนเสนอชื่อได้ใหม่ แม้ใช้สิทธิ์ไปแล้วช่วงถามตอบ', () => {
    let s = start(4, 9);
    const [a, b] = agents(s) as [string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = voteAll(s, false);
    s = timeUp(s);
    s = act(s, a, { type: 'ACCUSE', target: s.spy });
    expect(s.phase).toBe('voting');
    expect(s.vote?.final).toBe(true);
    s = voteAll(s, true);
    expect(s.result).toEqual({ winner: 'agents', reason: 'spy-caught' });
  });

  it('โหวตไม่ผ่านกลับ final-vote และใช้สิทธิ์ได้คนละครั้ง', () => {
    let s = timeUp(start(4, 10));
    const [a, b] = agents(s) as [string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = voteAll(s, false);
    expect(s.phase).toBe('final-vote');
    expect(tryAct(s, a, { type: 'ACCUSE', target: s.spy })).toBe(SpyfallError.FinalTurnUsed);
    expect(tryAct(s, a, { type: 'PASS' })).toBe(SpyfallError.FinalTurnUsed);
  });

  it('ทุกคนใช้สิทธิ์ครบแล้วไม่มีใครถูกจับ = สายลับชนะ', () => {
    let s = timeUp(start(4, 11));
    for (const p of s.players) s = act(s, p, { type: 'PASS' });
    expect(s.result).toEqual({ winner: 'spy', reason: 'spy-survived' });
  });

  it('โหวตสุดท้ายไม่ผ่าน → ครบทุกคน = สายลับชนะ', () => {
    let s = timeUp(start(3, 12));
    const [a, b] = agents(s) as [string, string];
    s = act(s, s.spy, { type: 'PASS' });
    s = act(s, b, { type: 'PASS' });
    s = act(s, a, { type: 'ACCUSE', target: b });
    s = act(s, s.spy, { type: 'BALLOT', agree: false });
    expect(s.result).toEqual({ winner: 'spy', reason: 'spy-survived' });
  });

  it('final-vote หมดเวลา = สายลับชนะ', () => {
    const s = timeUp(timeUp(start(4, 13)));
    expect(s.result).toEqual({ winner: 'spy', reason: 'time-up' });
  });

  it('PASS ใช้ได้แค่ใน final-vote', () => {
    expect(tryAct(start(4), 'p-ann', { type: 'PASS' })).toBe(SpyfallError.WrongPhase);
  });
});

describe('สายลับเดาสถานที่', () => {
  it('เดาถูก = สายลับชนะ', () => {
    let s = start(4, 14);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });
    expect(s.result).toEqual({ winner: 'spy', reason: 'spy-guessed' });
    expect(s.spyGuess).toBe(s.locationId);
  });

  it('เดาผิด = ฝ่ายผู้เล่นชนะ', () => {
    let s = start(4, 14);
    const guess = wrongLocation(s);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: guess });
    expect(s.result).toEqual({ winner: 'agents', reason: 'spy-guessed-wrong' });
    expect(spyfall.playerView(s, 'p-ann').reveal?.spyGuess).toBe(guess);
  });

  it('เดาไม่ได้ระหว่างโหวตและใน final-vote', () => {
    let s = start(4, 15);
    const [a, b] = agents(s) as [string, string];
    const voting = act(s, a, { type: 'ACCUSE', target: b });
    expect(tryAct(voting, voting.spy, { type: 'SPY_GUESS', locationId: s.locationId })).toBe(
      SpyfallError.WrongPhase,
    );
    s = timeUp(s);
    expect(tryAct(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId })).toBe(
      SpyfallError.WrongPhase,
    );
  });

  it('คนที่ไม่ใช่สายลับเดาไม่ได้ และสถานที่ต้องมีอยู่จริง', () => {
    const s = start(4, 16);
    expect(tryAct(s, agents(s)[0] as string, { type: 'SPY_GUESS', locationId: s.locationId })).toBe(
      SpyfallError.NotSpy,
    );
    expect(tryAct(s, s.spy, { type: 'SPY_GUESS', locationId: 'loc-nowhere' })).toBe(
      SpyfallError.UnknownLocation,
    );
  });
});

describe('action ผิดคนหรือผิด phase ถูกปฏิเสธ', () => {
  const s = start(4, 17);
  const revealed = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });

  it.each([
    ['BALLOT ตอนไม่มีโหวต', s, 'p-bob', { type: 'BALLOT', agree: true }, SpyfallError.WrongPhase],
    ['NEXT_ROUND ก่อน reveal', s, HOST, { type: 'NEXT_ROUND' }, SpyfallError.WrongPhase],
    [
      'NEXT_ROUND โดยคนที่ไม่ใช่ host',
      revealed,
      'p-bob',
      { type: 'NEXT_ROUND' },
      SpyfallError.NotHost,
    ],
    [
      'ACCUSE หลัง reveal',
      revealed,
      'p-bob',
      { type: 'ACCUSE', target: 'p-cat' },
      SpyfallError.WrongPhase,
    ],
    [
      'คนนอกรอบส่ง action',
      s,
      'p-zed',
      { type: 'ACCUSE', target: 'p-bob' },
      SpyfallError.NotAPlayer,
    ],
    ['payload ผิดรูป', s, 'p-bob', { type: 'ACCUSE' }, 'invalid-action'],
    ['action ที่ไม่มีจริง', s, 'p-bob', { type: 'START_ROUND' }, 'invalid-action'],
  ])('%s', (_name, state, by, action, error) => {
    expect(tryAct(state, by, action)).toBe(error);
  });

  it('host เริ่มรอบใหม่ได้: สุ่มใหม่ เปลี่ยนสถานที่ และเก็บคะแนน', () => {
    const next = act(revealed, HOST, { type: 'NEXT_ROUND' }, T0 + 5_000, 99);
    expect(next.phase).toBe('questioning');
    expect(next.locationId).not.toBe(revealed.locationId);
    expect(next.scores).toEqual(revealed.scores);
    expect(next.deadline).toBe(T0 + 5_000 + DEFAULT_DURATION_MS);
    expect(next.result).toBeNull();
  });
});

describe('ผู้เล่นออกกลางเกม', () => {
  it('สายลับออก = ฝ่ายผู้เล่นชนะ', () => {
    const s = start(4, 18);
    const after = removePlayer(spyfall, s, s.spy, T0);
    expect(after.result).toEqual({ winner: 'agents', reason: 'spy-left' });
    expect(after.players).not.toContain(s.spy);
  });

  it('เหลือน้อยกว่า 3 คน = จบโดยไม่มีผู้ชนะ และ isOver', () => {
    const s = start(3, 19);
    const after = removePlayer(spyfall, s, agents(s)[0] as string, T0);
    expect(after.result).toEqual({ winner: null, reason: 'not-enough-players' });
    expect(spyfall.isOver(after)).toBe(true);
    expect(tryAct(after, HOST, { type: 'NEXT_ROUND' })).toBe('game-over');
  });

  it('ผู้ถูกกล่าวหาออก = ยกเลิกโหวตและเดินเวลาต่อ', () => {
    let s = start(5, 20);
    const [a, b] = agents(s) as [string, string];
    s = act(s, a, { type: 'ACCUSE', target: b }, T0 + 10_000);
    s = removePlayer(spyfall, s, b, T0 + 20_000);
    expect(s.phase).toBe('questioning');
    expect(s.deadline).toBe(T0 + 20_000 + DEFAULT_DURATION_MS - 10_000);
  });

  it('คนที่ยังไม่โหวตออก = ตัดสินโหวตใหม่จากคนที่เหลือ', () => {
    let s = start(5, 21);
    const [a, b, c, d] = agents(s) as [string, string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: s.spy });
    s = act(s, b, { type: 'BALLOT', agree: true });
    s = act(s, c, { type: 'BALLOT', agree: true });
    expect(s.phase).toBe('voting');
    s = removePlayer(spyfall, s, d, T0);
    expect(s.result).toEqual({ winner: 'agents', reason: 'spy-caught' });
  });

  it('คนที่ยังไม่ใช้สิทธิ์ใน final-vote ออก = เช็กว่าครบหรือยัง', () => {
    let s = timeUp(start(4, 22));
    const [a, b, c] = agents(s) as [string, string, string];
    for (const p of [s.spy, a, b]) s = act(s, p, { type: 'PASS' });
    s = removePlayer(spyfall, s, c, T0);
    expect(s.result).toEqual({ winner: 'spy', reason: 'spy-survived' });
  });

  it('ออกตอน reveal แค่ลบออกจากรายชื่อ', () => {
    let s = start(4, 23);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });
    const quitter = agents(s)[0] as string;
    const after = removePlayer(spyfall, s, quitter, T0);
    expect(after.players).not.toContain(quitter);
    expect(after.result).toEqual(s.result);
  });
});

describe('seeded rng', () => {
  function playScript(seed: number): SpyfallState[] {
    const trail: SpyfallState[] = [];
    let s = start(6, seed);
    trail.push(s);
    const [a, b] = agents(s) as [string, string];
    s = act(s, a, { type: 'ACCUSE', target: b }, T0 + 1_000);
    s = voteAll(s, false, T0 + 2_000);
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
