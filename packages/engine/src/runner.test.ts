import { describe, expect, it, vi } from 'vitest';
import { createRng } from './rng';
import {
  dispatchAction,
  fireDeadline,
  getDeadline,
  removePlayer,
  startGame,
  viewsFor,
} from './runner';
import { secretGame } from './test-game';
import type { SecretState } from './test-game';
import { EngineError } from './types';

const T0 = 1_700_000_000_000;
const players = ['ann', 'bob', 'cat'];
const ctx = { hostId: 'ann' };

function start(seed = 1): SecretState {
  const res = startGame(secretGame, players, undefined, createRng(seed), T0);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

describe('startGame', () => {
  it('ใช้ defaultOptions เมื่อไม่ส่ง options', () => {
    expect(start().deadline).toBe(T0 + 10_000);
  });

  it('ตรวจ options ด้วย optionsSchema', () => {
    const ok = startGame(secretGame, players, { durationMs: 5_000 }, createRng(1), T0);
    expect(ok.ok && ok.value.deadline).toBe(T0 + 5_000);

    const bad = startGame(secretGame, players, { durationMs: 'forever' }, createRng(1), T0);
    expect(bad).toEqual({ ok: false, error: EngineError.InvalidOptions });
  });

  it('ตรวจจำนวนผู้เล่นและชื่อซ้ำ', () => {
    const rng = createRng(1);
    expect(startGame(secretGame, ['ann'], undefined, rng, T0)).toEqual({
      ok: false,
      error: EngineError.TooFewPlayers,
    });
    expect(startGame(secretGame, ['a', 'b', 'c', 'd', 'e'], undefined, rng, T0)).toEqual({
      ok: false,
      error: EngineError.TooManyPlayers,
    });
    expect(startGame(secretGame, ['a', 'a', 'b'], undefined, rng, T0)).toEqual({
      ok: false,
      error: EngineError.DuplicatePlayers,
    });
  });

  it('seed เดิมให้ state เดิม', () => {
    expect(start(77)).toEqual(start(77));
  });

  it('ไม่ส่ง array ผู้เล่นตัวเดิมเข้า setup', () => {
    const input = [...players];
    const res = startGame(secretGame, input, undefined, createRng(1), T0);
    expect(res.ok && res.value.players).not.toBe(input);
  });
});

describe('dispatchAction', () => {
  it('payload ที่ไม่ผ่าน schema ถูกปฏิเสธก่อนถึง validate', () => {
    const spy = vi.spyOn(secretGame, 'validate');
    const state = start();
    for (const payload of [
      null,
      'GUESS',
      { type: 'HACK' },
      { type: 'GUESS', target: 'bob', value: 500 },
      { type: 'GUESS', target: 'bob' },
    ]) {
      expect(dispatchAction(secretGame, state, payload, 'ann', ctx, T0, createRng(1))).toEqual({
        ok: false,
        error: EngineError.InvalidAction,
      });
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('คืนรหัส error จาก validate และไม่เปลี่ยน state', () => {
    const state = start();
    const before = structuredClone(state);
    const res = dispatchAction(secretGame, state, { type: 'END' }, 'bob', ctx, T0, createRng(1));
    expect(res).toEqual({ ok: false, error: 'not-host' });
    expect(state).toEqual(before);
  });

  it('ส่ง ctx.hostId ให้เกมตรวจสิทธิ์ host', () => {
    const state = start();
    const res = dispatchAction(
      secretGame,
      state,
      { type: 'END' },
      'bob',
      { hostId: 'bob' },
      T0,
      createRng(1),
    );
    expect(res.ok && res.value.over).toBe(true);
  });

  it('apply ได้ state ใหม่ ไม่แก้ของเดิม และได้ now/rng ที่ส่งเข้าไป', () => {
    const state = start();
    const before = structuredClone(state);
    const target = state.secrets.bob as number;
    const res = dispatchAction(
      secretGame,
      state,
      { type: 'GUESS', target: 'bob', value: target },
      'ann',
      ctx,
      T0 + 123,
      createRng(1),
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.value).not.toBe(state);
    expect(res.value.scores.ann).toBe(1);
    expect(res.value.lastGuessAt).toBe(T0 + 123);
    expect(state).toEqual(before);

    const a = dispatchAction(secretGame, state, { type: 'REROLL' }, 'ann', ctx, T0, createRng(5));
    const b = dispatchAction(secretGame, state, { type: 'REROLL' }, 'ann', ctx, T0, createRng(5));
    expect(a).toEqual(b);
  });

  it('ปฏิเสธทุก action เมื่อเกมจบแล้ว', () => {
    const over = { ...start(), over: true };
    expect(
      dispatchAction(secretGame, over, { type: 'REROLL' }, 'ann', ctx, T0, createRng(1)),
    ).toEqual({
      ok: false,
      error: EngineError.GameOver,
    });
  });
});

describe('deadline', () => {
  it('getDeadline คืน null เมื่อเกมจบ', () => {
    const state = start();
    expect(getDeadline(secretGame, state)).toBe(T0 + 10_000);
    expect(getDeadline(secretGame, { ...state, over: true })).toBeNull();
  });

  it('timer ที่มาก่อนเวลาไม่ทำอะไร (คืน object เดิม)', () => {
    const state = start();
    expect(fireDeadline(secretGame, state, T0 + 9_999)).toBe(state);
  });

  it('ถึงเวลาแล้วเรียก onDeadline', () => {
    const state = start();
    expect(fireDeadline(secretGame, state, T0 + 10_000).over).toBe(true);
  });
});

describe('removePlayer', () => {
  it('เรียก onPlayerLeave ของเกม', () => {
    const state = start();
    const after = removePlayer(secretGame, state, 'cat', T0);
    expect(after.players).toEqual(['ann', 'bob']);
    expect(after.over).toBe(false);
    expect(removePlayer(secretGame, after, 'bob', T0).over).toBe(true);
  });
});

describe('viewsFor', () => {
  it('ส่ง view แยกรายคน และไม่มีเลขลับของคนอื่น', () => {
    const state = start();
    const views = viewsFor(secretGame, state, players);
    expect([...views.keys()]).toEqual(players);
    for (const p of players) {
      const view = views.get(p);
      expect(view?.mySecret).toBe(state.secrets[p]);
      expect(view?.secrets).toBeNull();
    }
  });

  it('เปิดเผยทุกอย่างเมื่อเกมกำหนดให้เปิด', () => {
    const state = { ...start(), over: true };
    expect(viewsFor(secretGame, state, ['ann']).get('ann')?.secrets).toEqual(state.secrets);
  });
});
