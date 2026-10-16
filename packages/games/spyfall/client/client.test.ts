import { describe, expect, it } from 'vitest';
import { SpyfallError } from '../rules/constants';
import { act, agents, spyfall, start, timeUp } from '../rules/fixtures';
import type { SpyfallState } from '../rules/types';
import { canAccuse, canBallot, canGuess, canPass, voterCount } from './logic';
import { GAME_DESCRIPTION, GAME_DISPLAY_NAME, spyfallMessages } from './messages';

const viewOf = (s: SpyfallState, p: string) => spyfall.playerView(s, p);

describe('ปุ่มที่แสดง (logic)', () => {
  it('ช่วงถามตอบ: กล่าวหาได้จนกว่าจะใช้สิทธิ์ และเฉพาะสายลับที่เดาได้', () => {
    let s = start(4, 1);
    const [a, b] = agents(s) as [string, string];
    expect(canAccuse(viewOf(s, a))).toBe(true);
    expect(canGuess(viewOf(s, s.spy))).toBe(true);
    expect(canGuess(viewOf(s, a))).toBe(false);

    s = act(s, a, { type: 'ACCUSE', target: b });
    for (const p of s.players.filter((p) => p !== a && p !== b)) {
      s = act(s, p, { type: 'BALLOT', agree: false });
      break;
    }
    expect(s.phase).toBe('questioning');
    expect(canAccuse(viewOf(s, a))).toBe(false);
    expect(canAccuse(viewOf(s, b))).toBe(true);
  });

  it('ช่วงโหวต: ผู้ถูกกล่าวหาและคนที่โหวตแล้วไม่เห็นปุ่มโหวต', () => {
    let s = start(5, 2);
    const [a, b, c] = agents(s) as [string, string, string];
    s = act(s, a, { type: 'ACCUSE', target: b });
    expect(canBallot(viewOf(s, a))).toBe(false); // ผู้กล่าวหานับเป็นเห็นด้วยแล้ว
    expect(canBallot(viewOf(s, b))).toBe(false);
    expect(canBallot(viewOf(s, c))).toBe(true);
    expect(canGuess(viewOf(s, s.spy))).toBe(false);
    expect(voterCount(viewOf(s, c))).toBe(4);
    s = act(s, c, { type: 'BALLOT', agree: true });
    expect(canBallot(viewOf(s, c))).toBe(false);
  });

  it('final-vote: เสนอชื่อหรือผ่านได้คนละครั้ง', () => {
    let s = timeUp(start(4, 3));
    const [a] = agents(s) as [string];
    expect(canAccuse(viewOf(s, a))).toBe(true);
    expect(canPass(viewOf(s, a))).toBe(true);
    s = act(s, a, { type: 'PASS' });
    expect(canAccuse(viewOf(s, a))).toBe(false);
    expect(canPass(viewOf(s, a))).toBe(false);
  });

  it('คนดูไม่เห็นปุ่มใด ๆ', () => {
    const v = viewOf(start(4, 4), 'p-hal');
    expect([canAccuse(v), canPass(v), canBallot(v), canGuess(v)]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('ข้อความของเกม', () => {
  it('มีข้อความสำหรับรหัส error ทุกตัวของเกม ทั้งไทยและอังกฤษ', () => {
    for (const code of Object.values(SpyfallError)) {
      expect(spyfallMessages.th.errors[code], code).toBeTruthy();
      expect(spyfallMessages.en.errors[code], code).toBeTruthy();
    }
  });

  it('ชื่อเกมที่แสดงไม่ใช่ชื่อเกมต้นฉบับ', () => {
    const shown = JSON.stringify([
      GAME_DISPLAY_NAME,
      GAME_DESCRIPTION,
      spyfallMessages,
    ]).toLowerCase();
    expect(shown).not.toContain('spyfall');
  });
});
