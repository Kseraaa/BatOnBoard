import { describe, expect, it } from 'vitest';
import { createRng, EngineError, startGame } from '@batonboard/engine';
import { createBoss } from './game';
import { BossError, CLOSE_MS, DEFAULT_NEGOTIATION_MS, FAMILIES, HAND_LIMIT } from './constants';
import { fullDeck } from './cards';
import { participants } from './plan';
import type { BossState, Deal, Plan } from './types';
import {
  act,
  allCards,
  boss,
  declared,
  fire,
  investorPlan,
  owned,
  players,
  start,
  T0,
  testEndFaces,
  testSpaces,
  testValues,
  tryAct,
} from './fixtures';

function dealOf(state: BossState): Deal {
  if (state.deal === null) throw new Error('no deal');
  return state.deal;
}

/** ผู้ร่วมดีลตามแผนที่ไม่ใช่บอส */
function others(state: BossState, plan: Plan): string[] {
  const deal = dealOf(state);
  return participants(
    { investors: state.investors, offered: deal.offered, away: deal.away },
    plan,
  ).filter((p) => p !== deal.boss);
}

/** เสนอแผนใช้นักลงทุนถาวร ให้ผู้ร่วมดีลคนละ `each` แล้วทุกคนตกลง */
function agreed(state: BossState, each = 5, now = T0): BossState {
  const deal = dealOf(state);
  const plan = investorPlan(deal.space);
  const shares = Object.fromEntries(others(state, plan).map((p) => [p, each]));
  let s = act(state, deal.boss, { type: 'PROPOSE', plan: { ...plan, shares } }, now);
  for (const p of Object.keys(shares)) s = act(s, p, { type: 'RESPOND', agree: true }, now);
  return s;
}

describe('setup', () => {
  it.each([3, 4, 5, 6])('%i คน: แจกไพ่คนละ 5 ใบ ไพ่ครบ 98 ใบไม่ซ้ำ', (n) => {
    const s = start(n);
    for (const p of s.players) expect(s.hands[p]).toHaveLength(5);
    expect(allCards(s).sort()).toEqual(fullDeck().sort());
    expect(new Set(fullDeck()).size).toBe(98);
    expect(s.phase).toBe('turn');
    expect(s.players).toContain(s.current);
    for (const p of s.players) expect(s.money[p]).toBe(0);
  });

  it('3 คนได้นักลงทุนคนละ 2 ตระกูล', () => {
    const s = start(3);
    for (const p of s.players) {
      expect(FAMILIES.filter((f) => s.investors[f] === p)).toHaveLength(2);
    }
  });

  it('4 คนได้คนละ 1 ตระกูล เหลือกองกลาง 2', () => {
    const s = start(4);
    for (const p of s.players) {
      expect(FAMILIES.filter((f) => s.investors[f] === p)).toHaveLength(1);
    }
    expect(FAMILIES.filter((f) => s.investors[f] === null)).toHaveLength(2);
  });

  it('seed เดียวกันได้ผลเหมือนกัน', () => {
    expect(start(5, 42)).toEqual(start(5, 42));
    expect(start(5, 42)).not.toEqual(start(5, 43));
  });

  it('ตั้งค่าเริ่มต้น: เจรจา 5 นาที เกมเต็ม 15 ดีล', () => {
    const s = start();
    expect(s.negotiationMs).toBe(DEFAULT_NEGOTIATION_MS);
    expect(s.maxDeals).toBe(15);
    expect(start(4, 1, { negotiationMs: null, length: 'short' }).maxDeals).toBe(10);
  });

  it('ปฏิเสธตั้งค่าผิด', () => {
    for (const options of [
      { negotiationMs: 1000, length: 'full' },
      { negotiationMs: null, length: 'medium' },
      { length: 'full' },
    ]) {
      expect(startGame(boss, players(4), options, createRng(1), T0).ok).toBe(false);
    }
  });

  it('config ผิดถูกปฏิเสธตอนสร้างเกม', () => {
    const base = {
      boardId: 'x',
      spaces: testSpaces,
      dealValues: testValues,
      endFaces: testEndFaces,
    };
    expect(() => createBoss({ ...base, spaces: testSpaces.slice(1) })).toThrow();
    expect(() => createBoss({ ...base, dealValues: [...testValues].reverse() })).toThrow();
    expect(() => createBoss({ ...base, endFaces: [[7], [1], [1], [1], [1]] })).toThrow();
  });
});

describe('เทิร์น', () => {
  it('ทอยได้เฉพาะเจ้าของเทิร์นในช่วง turn แล้วเดินตามแต้ม', () => {
    const s = start();
    const other = s.players.find((p) => p !== s.current) as string;
    expect(tryAct(s, other, { type: 'ROLL' })).toBe(BossError.NotYourTurn);
    const rolled = act(s, s.current, { type: 'ROLL' });
    const roll = rolled.lastRoll;
    expect(roll).toMatchObject({ by: s.current, kind: 'move', seq: 1 });
    expect(rolled.marker).toBe((s.marker + (roll?.value ?? 0)) % 16);
    expect(rolled.phase).toBe('moved');
    expect(tryAct(rolled, s.current, { type: 'ROLL' })).toBe(BossError.WrongPhase);
  });

  it('เดินข้ามช่องที่ปิดดีลแล้ว', () => {
    const s = { ...start(), marker: 0, closed: [1, 2, 3, 4, 5, 6] };
    const rolled = act(s, s.current, { type: 'ROLL' });
    expect(rolled.marker).toBe(6 + (rolled.lastRoll?.value ?? 0));
  });

  it('จั่วได้หลังทอยเท่านั้น ได้ 3 ใบแล้วเทิร์นไปคนทางซ้าย', () => {
    const s = start();
    expect(tryAct(s, s.current, { type: 'DRAW' })).toBe(BossError.WrongPhase);
    const rolled = act(s, s.current, { type: 'ROLL' });
    const drew = act(rolled, s.current, { type: 'DRAW' });
    expect(drew.hands[s.current]).toHaveLength(8);
    expect(drew.phase).toBe('turn');
    const i = s.players.indexOf(s.current);
    expect(drew.current).toBe(s.players[(i + 1) % s.players.length]);
    expect(allCards(drew).sort()).toEqual(fullDeck().sort());
  });

  it(`ถือไพ่ได้ไม่เกิน ${HAND_LIMIT} ใบ`, () => {
    let s = start();
    const p = s.current;
    s = { ...s, hands: { ...s.hands, [p]: s.deck.slice(0, 11) }, deck: s.deck.slice(11) };
    const drew = act(act(s, p, { type: 'ROLL' }), p, { type: 'DRAW' });
    expect(drew.hands[p]).toHaveLength(HAND_LIMIT);
  });

  it('กองจั่วหมดแล้วสับกองทิ้งมาใช้', () => {
    let s = start();
    s = { ...s, discard: [...s.discard, ...s.deck.slice(1)], deck: s.deck.slice(0, 1) };
    const drew = act(act(s, s.current, { type: 'ROLL' }), s.current, { type: 'DRAW' });
    expect(drew.hands[s.current]).toHaveLength(8);
    expect(allCards(drew).sort()).toEqual(fullDeck().sort());
  });

  it('ประกาศดีลได้ทั้งก่อนทอยและหลังทอย บอสคือคนประกาศ', () => {
    const s = start();
    const before = declared(s);
    expect(before.phase).toBe('deal');
    expect(dealOf(before)).toMatchObject({ space: s.marker, boss: s.current, plan: null });
    expect(dealOf(before).deadline).toBe(T0 + DEFAULT_NEGOTIATION_MS);

    const rolled = act(s, s.current, { type: 'ROLL' });
    expect(dealOf(declared(rolled)).space).toBe(rolled.marker);
  });

  it('ไม่จำกัดเวลาเจรจา = ดีลไม่มี deadline', () => {
    const s = declared(start(4, 1, { negotiationMs: null, length: 'full' }));
    expect(dealOf(s).deadline).toBeNull();
    expect(boss.nextDeadline?.(s)).toBeNull();
  });
});

describe('เจรจาดีล', () => {
  it('ทุกคนตกลง → นับถอยหลัง → ปิดดีลและจ่ายเงินตามแผน', () => {
    const s0 = declared(owned(start(4, 5)));
    const deal = dealOf(s0);
    const s = agreed(s0, 7, T0 + 1000);
    expect(dealOf(s).closeAt).toBe(T0 + 1000 + CLOSE_MS);

    const done = fire(s);
    const payout = (testValues[0] as number) * (testSpaces[deal.space]?.shares ?? 0);
    const members = others(s, investorPlan(deal.space));
    for (const p of members) expect(done.money[p]).toBe(7);
    expect(done.money[deal.boss]).toBe(payout - 7 * members.length);
    expect(done.closed).toEqual([deal.space]);
    expect(done.dealsDone).toBe(1);
    expect(done.marker).toBe((deal.space + 1) % 16);
    expect(done.phase).toBe('turn');
    const i = s.players.indexOf(deal.boss);
    expect(done.current).toBe(s.players[(i + 1) % 4]);
    expect(done.lastDeal).toMatchObject({ kind: 'closed', space: deal.space, payout });
  });

  it('ดีลถัดไปจ่ายด้วยราคาหุ้นที่สูงขึ้น และประกาศช่องที่ปิดแล้วไม่ได้', () => {
    const done = fire(agreed(declared(owned(start(4, 5)))));
    expect(boss.playerView(done, done.current).price).toBe(testValues[1]);
    expect(
      tryAct({ ...done, marker: done.closed[0] as number }, done.current, { type: 'DECLARE' }),
    ).toBe(BossError.SpaceClosed);
  });

  it('มีคนไม่ตกลง → ยกเลิกนับถอยหลัง และเสนอใหม่ต้องตอบใหม่', () => {
    const s = agreed(declared(owned(start(4, 5))));
    const deal = dealOf(s);
    const member = others(s, investorPlan(deal.space))[0];
    if (member === undefined) return;
    const no = act(s, member, { type: 'RESPOND', agree: false });
    expect(dealOf(no).closeAt).toBeNull();
    expect(boss.nextDeadline?.(no)).toBe(deal.deadline);

    const again = act(no, deal.boss, { type: 'PROPOSE', plan: investorPlan(deal.space) });
    expect(dealOf(again).responses).toEqual({});
  });

  it('แผนต้องครบตระกูลตามช่อง', () => {
    const s = declared(owned({ ...start(4, 5), marker: 0 }));
    const b = dealOf(s).boss;
    const propose = (plan: Plan) => tryAct(s, b, { type: 'PROPOSE', plan });
    const [req, opt1, opt2] = ['red', 'blue', 'yellow'] as const;
    const slot = (family: (typeof FAMILIES)[number]) => ({ family, source: 'investor' });

    expect(propose({ slots: [slot(req), slot(opt1)], shares: {} })).toBeNull();
    expect(propose({ slots: [slot(req), slot(opt2)], shares: {} })).toBeNull();
    // ขาดตระกูลที่ต้องมี / เลือกเกิน / เลือกนอกรายการ / ซ้ำ
    expect(propose({ slots: [slot(opt1), slot(opt2)], shares: {} })).toBe(BossError.InvalidPlan);
    expect(propose({ slots: [slot(req), slot(opt1), slot(opt2)], shares: {} })).toBe(
      BossError.InvalidPlan,
    );
    expect(propose({ slots: [slot(req), slot('green')], shares: {} })).toBe(BossError.InvalidPlan);
    expect(propose({ slots: [slot(req), slot(req)], shares: {} })).toBe(BossError.InvalidPlan);
  });

  it('ส่วนแบ่งรวมเกินเงินดีล หรือให้คนนอกดีลไม่ได้', () => {
    const s = declared(owned({ ...start(4, 5), marker: 0 }));
    const deal = dealOf(s);
    const plan = investorPlan(0);
    const payout = (testValues[0] as number) * (testSpaces[0]?.shares ?? 0);
    const member = others(s, plan)[0] as string;
    const outsider = s.players.find((p) => p !== deal.boss && !others(s, plan).includes(p));
    const propose = (shares: Plan['shares']) =>
      tryAct(s, deal.boss, { type: 'PROPOSE', plan: { ...plan, shares } });

    expect(propose({ [member]: payout })).toBeNull();
    expect(propose({ [member]: payout + 1 })).toBe(BossError.SharesTooHigh);
    if (outsider) expect(propose({ [outsider]: 1 })).toBe(BossError.InvalidPlan);
    expect(propose({ [deal.boss]: 1 })).toBe(BossError.InvalidPlan);
    expect(propose({ [member]: -1 })).toBe(EngineError.InvalidAction);
  });

  it('เฉพาะบอสเสนอแผนได้ และเฉพาะผู้ร่วมดีลตอบได้', () => {
    const s = declared(owned({ ...start(4, 5), marker: 0 }));
    const deal = dealOf(s);
    const plan = investorPlan(0);
    const notBoss = s.players.find((p) => p !== deal.boss) as string;
    expect(tryAct(s, notBoss, { type: 'PROPOSE', plan })).toBe(BossError.NotBoss);
    expect(tryAct(s, notBoss, { type: 'RESPOND', agree: true })).toBe(BossError.NoPlan);
    const proposed = act(s, deal.boss, { type: 'PROPOSE', plan });
    const outsider = s.players.find((p) => p !== deal.boss && !others(s, plan).includes(p));
    if (outsider) {
      expect(tryAct(proposed, outsider, { type: 'RESPOND', agree: true })).toBe(
        BossError.NotParticipant,
      );
    }
    expect(tryAct(proposed, deal.boss, { type: 'RESPOND', agree: true })).toBe(
      BossError.NotParticipant,
    );
  });

  it('ไพ่ตระกูลแทนนักลงทุนที่อยู่กองกลางได้ ใช้แล้วลงกองทิ้ง ที่ไม่ได้ใช้กลับมือ', () => {
    let s = { ...start(4, 5), marker: 0 };
    // ช่อง 0 ต้องมี red + เลือก blue/yellow — ให้ red อยู่กองกลาง
    s = { ...owned(s), investors: { ...owned(s).investors, red: null } };
    const holder = s.players[1] as string;
    const spare = s.players[2] as string;
    s = {
      ...s,
      hands: {
        ...s.hands,
        [holder]: [...(s.hands[holder] ?? []), 'clan-red-1'],
        [spare]: [...(s.hands[spare] ?? []), 'clan-blue-1'],
      },
    };
    s = declared(s);
    const b = dealOf(s).boss;

    expect(tryAct(s, holder, { type: 'OFFER_CLAN', card: 'clan-blue-1' })).toBe(
      BossError.NotInHand,
    );
    s = act(s, holder, { type: 'OFFER_CLAN', card: 'clan-red-1' });
    s = act(s, spare, { type: 'OFFER_CLAN', card: 'clan-blue-1' });
    expect(s.hands[holder]).not.toContain('clan-red-1');

    // ใช้นักลงทุน red ไม่ได้เพราะอยู่กองกลาง
    const viaInvestor: Plan = {
      slots: [
        { family: 'red', source: 'investor' },
        { family: 'yellow', source: 'investor' },
      ],
      shares: {},
    };
    expect(tryAct(s, b, { type: 'PROPOSE', plan: viaInvestor })).toBe(BossError.SourceUnavailable);
    // ใช้ไพ่ตระกูลผิดสีไม่ได้
    const wrongCard: Plan = {
      slots: [
        { family: 'red', source: 'clan-blue-1' },
        { family: 'yellow', source: 'investor' },
      ],
      shares: {},
    };
    expect(tryAct(s, b, { type: 'PROPOSE', plan: wrongCard })).toBe(BossError.SourceUnavailable);

    const plan: Plan = {
      slots: [
        { family: 'red', source: 'clan-red-1' },
        { family: 'yellow', source: 'investor' },
      ],
      shares: {},
    };
    s = act(s, b, { type: 'PROPOSE', plan });
    for (const p of others(s, plan)) s = act(s, p, { type: 'RESPOND', agree: true });
    const done = fire(s);
    expect(done.discard).toContain('clan-red-1');
    expect(done.hands[spare]).toContain('clan-blue-1');
  });

  it('วางไพ่ตระกูลที่ช่องนี้ไม่ใช้ หรือไพ่ที่ไม่ใช่ไพ่ตระกูลไม่ได้', () => {
    let s = owned({ ...start(4, 5), marker: 0 });
    const p = s.players[1] as string;
    s = declared({ ...s, hands: { ...s.hands, [p]: ['clan-green-1', 'stop-1'] } });
    expect(tryAct(s, p, { type: 'OFFER_CLAN', card: 'clan-green-1' })).toBe(
      BossError.FamilyNotInDeal,
    );
    expect(tryAct(s, p, { type: 'OFFER_CLAN', card: 'stop-1' })).toBe(BossError.NotAClanCard);
  });

  it('บอสยอมแพ้ → ดีลล่ม ไพ่บนโต๊ะกลับมือ เทิร์นไปคนทางซ้ายของบอส', () => {
    let s = owned({ ...start(4, 5), marker: 0 });
    const p = s.players[1] as string;
    s = declared({ ...s, hands: { ...s.hands, [p]: ['clan-red-1'] } });
    s = act(s, p, { type: 'OFFER_CLAN', card: 'clan-red-1' });
    const b = dealOf(s).boss;
    expect(tryAct(s, p, { type: 'ABANDON' })).toBe(p === b ? null : BossError.NotBoss);
    const broken = act(s, b, { type: 'ABANDON' });
    expect(broken.phase).toBe('turn');
    expect(broken.deal).toBeNull();
    expect(broken.closed).toEqual([]);
    expect(broken.marker).toBe(0);
    expect(broken.hands[p]).toContain('clan-red-1');
    const i = s.players.indexOf(b);
    expect(broken.current).toBe(s.players[(i + 1) % 4]);
    expect(broken.lastDeal).toMatchObject({ kind: 'broken', reason: 'abandoned' });
  });

  it('หมดเวลาเจรจา → ดีลล่ม', () => {
    const s = declared(start());
    const broken = fire(s);
    expect(broken.phase).toBe('turn');
    expect(broken.lastDeal).toMatchObject({ kind: 'broken', reason: 'time-up' });
  });
});

describe('จบเกม', () => {
  it('ดีลสุดท้ายปิดแล้วจบเกม คนเงินมากสุดชนะ', () => {
    let s = owned(start(4, 5, { negotiationMs: null, length: 'short' }));
    s = { ...s, dealsDone: 9 };
    const done = fire(agreed(declared(s)));
    expect(done.phase).toBe('ended');
    expect(done.result?.reason).toBe('last-deal');
    expect(boss.isOver(done)).toBe(true);
    const top = Math.max(...done.players.map((p) => done.money[p] ?? 0));
    expect(done.result?.winners.every((p) => done.money[p] === top)).toBe(true);
  });

  it('ก่อนช่วงสุ่มจบ ไม่มีการทอยจบเกม', () => {
    const done = fire(agreed(declared(owned(start(4, 5)))));
    expect(done.lastRoll).toBeNull();
    expect(done.phase).toBe('turn');
  });

  it('ช่วงสุ่มจบ: แต้มตรงกับหน้าที่กำหนด = จบ ไม่ตรง = เล่นต่อ', () => {
    // เกมเต็ม: หลังดีลที่ 10 จบเมื่อทอยได้ 1
    const base = { ...owned(start(4, 5)), dealsDone: 9 };
    const s = declared(base);
    const at = (endRoll: number) => fire(agreed({ ...s, deal: { ...dealOf(s), endRoll } }));
    const ended = at(1);
    expect(ended.phase).toBe('ended');
    expect(ended.result?.reason).toBe('end-roll');
    expect(ended.lastRoll).toMatchObject({ value: 1, kind: 'end' });
    const goOn = at(2);
    expect(goOn.phase).toBe('turn');
    expect(goOn.lastRoll).toMatchObject({ value: 2, kind: 'end' });
  });

  it('รับ action ไม่ได้หลังจบเกม', () => {
    const s = { ...start(), phase: 'ended' as const };
    expect(tryAct(s, s.current, { type: 'ROLL' })).toBe(EngineError.GameOver);
  });
});

describe('ผู้เล่นออกกลางเกม', () => {
  it('นักลงทุนกลับกองกลาง ไพ่บนมือลงกองทิ้ง', () => {
    const s = owned(start(5));
    const p = s.players[1] as string;
    const left = boss.onPlayerLeave?.(s, p, T0) as BossState;
    expect(left.players).not.toContain(p);
    expect(FAMILIES.some((f) => left.investors[f] === p)).toBe(false);
    expect(left.discard).toEqual(expect.arrayContaining(s.hands[p] ?? []));
    expect(allCards(left).sort()).toEqual(fullDeck().sort());
  });

  it('เจ้าของเทิร์นออก → เทิร์นไปคนถัดไป', () => {
    const s = start(5);
    const i = s.players.indexOf(s.current);
    const left = boss.onPlayerLeave?.(s, s.current, T0) as BossState;
    expect(left.current).toBe(s.players[(i + 1) % 5]);
    expect(left.phase).toBe('turn');
  });

  it('บอสออก → ดีลล่ม', () => {
    const s = declared(start(5));
    const left = boss.onPlayerLeave?.(s, dealOf(s).boss, T0) as BossState;
    expect(left.phase).toBe('turn');
    expect(left.lastDeal).toMatchObject({ kind: 'broken', reason: 'boss-left' });
  });

  it('ผู้ร่วมดีลออก → แผนถูกล้าง', () => {
    const s = agreed(declared(owned({ ...start(5, 5), marker: 0 })));
    const member = others(s, investorPlan(0))[0];
    if (member === undefined) return;
    const left = boss.onPlayerLeave?.(s, member, T0) as BossState;
    expect(dealOf(left).plan).toBeNull();
    expect(dealOf(left).closeAt).toBeNull();
  });

  it('เหลือน้อยกว่า 3 คน → จบเกม', () => {
    const s = start(3);
    const left = boss.onPlayerLeave?.(s, s.players[0] as string, T0) as BossState;
    expect(left.phase).toBe('ended');
    expect(left.result?.reason).toBe('not-enough-players');
  });
});
