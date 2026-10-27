import { describe, expect, it } from 'vitest';
import { createRng, startGame } from '@batonboard/engine';
import type { PlayerId } from '@batonboard/engine';
import { createPoets } from './game';
import { PoetsError, VOTE_MS } from './constants';
import type { VillageDef } from './types';
import {
  act,
  HOST,
  players,
  poets,
  readAll,
  start,
  T0,
  testVillages,
  timeUp,
  tryAct,
  villagers,
  voteAll,
  voteOut,
} from './fixtures';

const villageOf = (lineId: string) =>
  testVillages.find((v) => v.sentences.some((s) => s.id === lineId));
const decoyOf = (lineId: string) =>
  testVillages.flatMap((v) => v.decoys).find((d) => d.id === lineId);

describe('แจกประโยค', () => {
  it('ฆาตกร 1 คนได้ข้อหลอก คนอื่นได้ประโยคของหมู่บ้านเดียวกันคนละประโยค', () => {
    for (let seed = 0; seed < 50; seed++) {
      const n = 3 + (seed % 4);
      const s = start(n, seed);
      expect(s.players).toContain(s.spy);
      expect(s.figure).not.toBe(s.spyFigure);
      const village = testVillages.find((v) => v.id === s.village);
      expect(village?.figure).toBe(s.figure);
      const villageLines = villagers(s).map((p) => s.lines[p] as string);
      expect(new Set(villageLines).size).toBe(n - 1);
      for (const line of villageLines) expect(villageOf(line)).toBe(village);
      const decoy = decoyOf(s.lines[s.spy] as string);
      expect(village?.decoys).toContain(decoy);
      expect(decoy?.figure).toBe(s.spyFigure);
      expect([...s.order].sort()).toEqual([...s.players].sort());
      expect(s.phase).toBe('reading');
      expect(s.deadline).toBeNull();
    }
  });

  it('seed เดียวกันได้ผลเหมือนเดิม', () => {
    expect(start(5, 42)).toEqual(start(5, 42));
    expect(start(5, 42)).not.toEqual(start(5, 43));
  });

  it('ค่าเริ่มต้นเล่น 6 รอบ', () => {
    expect(start(4, 1).rounds).toBe(6);
  });

  it('config ที่หมู่บ้านมีประโยคไม่พอ 6 คน หรือข้อหลอกเป็นโวหารเดียวกัน ถูกปฏิเสธ', () => {
    const [base] = testVillages as [VillageDef];
    const bad = (village: VillageDef) => () => createPoets({ setId: 'bad', villages: [village] });
    expect(bad({ ...base, sentences: base.sentences.slice(0, 4) })).toThrow();
    expect(bad({ ...base, decoys: [] })).toThrow();
    expect(bad({ ...base, decoys: [{ id: 'd', text: 'd', figure: base.figure }] })).toThrow();
    expect(bad(base)).not.toThrow();
  });

  it('เล่นครบทุกหมู่บ้านก่อนวนซ้ำ และหมู่บ้านไม่ซ้ำรอบก่อน', () => {
    let s = start(3, 7, { discussionMs: 60_000 });
    const seen = [s.village];
    for (let round = 0; round < 7; round++) {
      const before = s.village;
      s = act(voteOut(s, s.spy), HOST, { type: 'NEXT_ROUND' }, T0, round + 10);
      expect(s.village).not.toBe(before);
      seen.push(s.village);
    }
    const ids = testVillages.map((v) => v.id).sort();
    expect([...new Set(seen.slice(0, 4))].sort()).toEqual(ids);
    expect([...new Set(seen.slice(4, 8))].sort()).toEqual(ids);
  });
});

describe('ช่วงอ่าน', () => {
  it('อ่านตามลำดับ คนอื่นกดแทนไม่ได้ ยกเว้น host ข้ามให้', () => {
    const s = start(4, 1);
    const reader = s.order[0] as PlayerId;
    const other = s.order.find((p) => p !== reader && p !== HOST) as PlayerId;
    expect(tryAct(s, other, { type: 'READ_DONE' })).toBe(PoetsError.NotReader);
    expect(act(s, reader, { type: 'READ_DONE' }).readCount).toBe(1);
    expect(act(s, HOST, { type: 'READ_DONE' }).readCount).toBe(1);
  });

  it('อ่านครบแล้วเข้าช่วงคุยพร้อมเวลา แล้วหมดเวลาเปิดโหวต', () => {
    const s = readAll(start(4, 1, { discussionMs: 30_000 }));
    expect(s.phase).toBe('discussion');
    expect(s.deadline).toBe(T0 + 30_000);
    const voting = timeUp(s);
    expect(voting.phase).toBe('voting');
    expect(voting.voting?.candidates).toEqual(s.players);
  });

  it('เริ่มโหวตได้เฉพาะ host ช่วงคุย', () => {
    const reading = start(4, 1);
    expect(tryAct(reading, HOST, { type: 'START_VOTE' })).toBe(PoetsError.WrongPhase);
    const s = readAll(reading);
    expect(tryAct(s, 'p-bob', { type: 'START_VOTE' })).toBe(PoetsError.NotHost);
    expect(tryAct(s, HOST, { type: 'START_VOTE' })).toBeNull();
  });

  it('คนที่ถึงตาอ่านออกจากห้อง = ข้ามไปคนถัดไป', () => {
    const s = start(5, 4);
    const reader = s.order[0] as PlayerId;
    const left = poets.onPlayerLeave?.(s, reader, T0) as typeof s;
    if (reader === s.spy) {
      expect(left.phase).toBe('reveal');
    } else {
      expect(left.readCount).toBe(1);
      expect(left.phase).toBe('reading');
    }
  });
});

describe('โหวตและผล', () => {
  it('โหวตถูก = หมู่บ้านปลอดภัย กวีทุกคนที่ไม่ใช่สายลับ +1', () => {
    const s = voteOut(start(4, 1), start(4, 1).spy);
    expect(s.phase).toBe('reveal');
    expect(s.result).toMatchObject({ winner: 'village', reason: 'caught', points: 1 });
    expect([...(s.result?.winners ?? [])].sort()).toEqual(villagers(s).sort());
    for (const p of villagers(s)) expect(s.scores[p]).toBe(1);
    expect(s.scores[s.spy]).toBe(0);
  });

  it('โหวตผิด = สายลับ +1', () => {
    const base = start(4, 1);
    const s = voteOut(base, villagers(base)[0] as PlayerId);
    expect(s.result).toMatchObject({ winner: 'spy', winners: [base.spy], reason: 'missed' });
  });

  it('โหวตคนละครั้ง ห้ามโหวตตัวเอง', () => {
    const s = act(readAll(start(4, 1)), HOST, { type: 'START_VOTE' });
    expect(tryAct(s, 'p-bob', { type: 'VOTE', target: 'p-bob' })).toBe(PoetsError.CannotVoteSelf);
    const voted = act(s, 'p-bob', { type: 'VOTE', target: 'p-cat' });
    expect(tryAct(voted, 'p-bob', { type: 'VOTE', target: 'p-dan' })).toBe(PoetsError.AlreadyVoted);
    expect(tryAct(voted, 'p-cat', { type: 'VOTE', target: 'p-zzz' })).toBe(
      PoetsError.NotACandidate,
    );
  });

  it('เสมอ = โหวตใหม่เฉพาะคนที่เสมอ เสมออีก = สายลับชนะ', () => {
    const s = act(readAll(start(4, 1)), HOST, { type: 'START_VOTE' });
    const ring = s.players;
    const next = (p: PlayerId) => ring[(ring.indexOf(p) + 1) % ring.length] as PlayerId;
    const revote = voteAll(s, next);
    expect(revote.phase).toBe('voting');
    expect(revote.voting?.candidates).toEqual(ring);
    const done = voteAll(revote, next);
    expect(done.accused).toBeNull();
    expect(done.result?.reason).toBe('missed');
  });

  it('หมดเวลาโหวตไม่มีใครโหวต = ไม่มีใครถูกเลือก', () => {
    const s = act(readAll(start(3, 1)), HOST, { type: 'START_VOTE' }, T0);
    expect(s.deadline).toBe(T0 + VOTE_MS);
    const done = timeUp(s);
    expect(done.accused).toBeNull();
    expect(done.result?.winner).toBe('spy');
  });

  it('สายลับออกกลางเกม = หมู่บ้านชนะ, คนไม่พอ = ไม่มีใครชนะ', () => {
    const s = start(3, 1);
    expect(poets.onPlayerLeave?.(s, s.spy, T0).result?.reason).toBe('spy-left');
    const v = villagers(s)[0] as PlayerId;
    expect(poets.onPlayerLeave?.(s, v, T0).result?.reason).toBe('not-enough-players');
  });

  it('แมตช์หลายรอบ: ครบแล้ว NEXT_ROUND เริ่มแมตช์ใหม่ ล้างคะแนน', () => {
    let s = start(3, 1, { discussionMs: 60_000, rounds: 2 });
    s = act(voteOut(s, s.spy), HOST, { type: 'NEXT_ROUND' });
    expect(s.round).toBe(2);
    s = voteOut(s, s.spy);
    expect(poets.playerView(s, HOST).matchOver).toBe(true);
    s = act(s, HOST, { type: 'NEXT_ROUND' });
    expect(s.round).toBe(1);
    expect(Object.values(s.scores).every((n) => n === 0)).toBe(true);
    expect(tryAct(s, 'p-bob', { type: 'NEXT_ROUND' })).toBe(PoetsError.WrongPhase);
  });

  it('ตั้งค่าผิดถูกปฏิเสธ', () => {
    const res = startGame(poets, players(4), { discussionMs: 1 }, createRng(1), T0);
    expect(res.ok).toBe(false);
  });
});

describe('host เป็นผู้ดำเนินเกม (ค่าเริ่มต้น)', () => {
  const kids = ['p-ann', 'p-bob', 'p-cat', 'p-dan', 'p-eve', 'p-fay', 'p-gus'];
  const begin = (options?: unknown, list = kids) => {
    const res = startGame(poets, list, options, createRng(3), T0, HOST);
    if (!res.ok) throw new Error(res.error);
    return res.value;
  };

  it('host ไม่ได้ไพ่ ผู้เล่น 6 + host 1', () => {
    const s = begin();
    expect(s.players).toEqual(kids.slice(1));
    expect(s.moderator).toBe(HOST);
    expect(s.lines[HOST]).toBeUndefined();
    expect(startGame(poets, kids.slice(0, 3), undefined, createRng(1), T0, HOST)).toEqual({
      ok: false,
      error: 'too-few-players',
    });
  });

  it('host เห็นไพ่ทุกคนและรู้ว่าใครเป็นสายลับ ผู้เล่นไม่เห็นไพ่ของ host', () => {
    const s = begin();
    const you = poets.playerView(s, HOST).you;
    if (you.role !== 'moderator') throw new Error(you.role);
    expect(you.cards.map((c) => c.player)).toEqual(s.order);
    expect(you.cards.filter((c) => c.spy).map((c) => c.player)).toEqual([s.spy]);
    for (const c of you.cards) {
      expect(c.figure).toBe(c.spy ? s.spyFigure : s.figure);
      expect(c.text).not.toBe('');
    }
    for (const p of s.players) expect(poets.playerView(s, p).you.role).toBe('poet');
  });

  it('host ข้ามคนอ่าน เริ่มโหวต และเริ่มรอบใหม่ได้ แต่โหวตไม่ได้', () => {
    let s = begin();
    s = act(s, HOST, { type: 'READ_DONE' });
    expect(s.readCount).toBe(1);
    s = act(readAll(s), HOST, { type: 'START_VOTE' });
    expect(s.voting?.candidates).not.toContain(HOST);
    expect(tryAct(s, HOST, { type: 'VOTE', target: s.spy })).toBe(PoetsError.NotAPlayer);
    s = voteAll(s, (p) => (p === s.spy ? (villagers(s)[0] as PlayerId) : s.spy));
    expect(s.result?.reason).toBe('caught');
    expect(s.result?.winners).not.toContain(HOST);
    const next = act(s, HOST, { type: 'NEXT_ROUND' }, T0, 9);
    expect(next.moderator).toBe(HOST);
    expect(next.players).not.toContain(HOST);
  });

  it('hostPlays = host เล่นด้วยเหมือนเดิม', () => {
    const s = begin({ discussionMs: 60_000, hostPlays: true }, kids.slice(0, 6));
    expect(s.players).toContain(HOST);
    expect(s.moderator).toBeNull();
    expect(poets.playerView(s, HOST).you.role).toBe('poet');
  });
});
