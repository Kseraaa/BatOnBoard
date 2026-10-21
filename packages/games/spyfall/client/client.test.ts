import { describe, expect, it } from 'vitest';
import { SpyfallError } from '../rules/constants';
import { act, agents, HOST, spyfall, start, startVote, voteAll, voteOut } from '../rules/fixtures';
import type { SpyfallState } from '../rules/types';
import { canGuess, canStartVote, canVote, tally, voteTargets } from './logic';
import { GAME_DESCRIPTION, GAME_DISPLAY_NAME, spyfallMessages } from './messages';

const viewOf = (s: SpyfallState, p: string) => spyfall.playerView(s, p);

describe('ปุ่มที่แสดง (logic)', () => {
  it('ช่วงถามตอบ: เฉพาะ host เริ่มโหวตได้ และสายลับยังทายไม่ได้', () => {
    const s = start(4, 1);
    expect(canStartVote(viewOf(s, HOST), HOST)).toBe(true);
    expect(canStartVote(viewOf(s, 'p-bob'), HOST)).toBe(false);
    expect(canGuess(viewOf(s, s.spy))).toBe(false);
    expect(canVote(viewOf(s, 'p-bob'))).toBe(false);
  });

  it('ช่วงโหวต: เลือกได้ทุกคนยกเว้นตัวเอง และโหวตแล้วปุ่มหาย', () => {
    let s = startVote(start(4, 1));
    expect(voteTargets(viewOf(s, 'p-bob'))).toEqual(['p-ann', 'p-cat', 'p-dan']);
    expect(canVote(viewOf(s, 'p-bob'))).toBe(true);
    s = act(s, 'p-bob', { type: 'VOTE', target: 'p-cat' });
    expect(canVote(viewOf(s, 'p-bob'))).toBe(false);
    expect(canVote(viewOf(s, 'p-cat'))).toBe(true);
  });

  it('โหวตรอบใหม่: ผู้สมัครที่เสมอเลือกได้แค่อีกคน', () => {
    const s0 = start(4, 4);
    const [a, b, c] = agents(s0) as [string, string, string];
    const s = voteAll(startVote(s0), (p) => ({ [a]: b, [b]: a, [c]: a, [s0.spy]: b })[p] as string);
    expect(voteTargets(viewOf(s, a))).toEqual([b]);
    expect(voteTargets(viewOf(s, c)).sort()).toEqual([a, b].sort());
  });

  it('ช่วงสายลับทาย: เฉพาะสายลับเห็นปุ่มทาย', () => {
    const s0 = start(4, 2);
    const s = voteOut(s0, s0.spy);
    expect(canGuess(viewOf(s, s0.spy))).toBe(true);
    expect(canGuess(viewOf(s, agents(s0)[0] as string))).toBe(false);
  });

  it('นับคะแนนเรียงจากมากไปน้อย ไม่นับบัตรว่าง', () => {
    const counts = tally(
      {
        candidates: ['a', 'b', 'c'],
        ballots: { a: 'b', b: 'c', c: 'b', d: null },
      },
      ['a', 'b', 'c', 'd'],
    );
    expect(counts).toEqual([
      { id: 'b', votes: 2 },
      { id: 'c', votes: 1 },
      { id: 'a', votes: 0 },
    ]);
  });

  it('คนดูไม่เห็นปุ่มใด ๆ', () => {
    const v = viewOf(startVote(start(4, 4)), 'p-hal');
    expect([canVote(v), canGuess(v), canStartVote(v, HOST)]).toEqual([false, false, false]);
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
