import { describe, expect, it } from 'vitest';
import { BossError, DEFAULT_NEGOTIATION_MS, PENDING_MS } from './constants';
import { fullDeck } from './cards';
import type { BossState, Deal, Plan } from './types';
import { act, allCards, boss, fire, give, owned, start, T0, tryAct } from './fixtures';

const [ANN, BOB, CAT, DAN] = ['p-ann', 'p-bob', 'p-cat', 'p-dan'] as const;

/**
 * 4 คน ทุกตระกูลมีเจ้าของ: red/orange = ann, blue/green = bob, yellow = cat, purple = dan
 * ดันประกาศดีลช่อง 0 (ต้องมี red + เลือก blue หรือ yellow) ดันจึงเป็นบอสที่ไม่ได้ถือตระกูลในดีล
 */
function dealing(cards: Record<string, string[]> = {}): BossState {
  let s: BossState = { ...owned(start(4, 9)), marker: 0, current: DAN };
  for (const [p, list] of Object.entries(cards)) s = give(s, p, list);
  return act(s, DAN, { type: 'DECLARE' });
}

function dealOf(state: BossState): Deal {
  if (state.deal === null) throw new Error('no deal');
  return state.deal;
}

const redBlue: Plan = {
  slots: [
    { family: 'red', source: 'investor' },
    { family: 'blue', source: 'investor' },
  ],
  shares: { [ANN]: 5, [BOB]: 5 },
};

const complete = (s: BossState) => expect(allCards(s).sort()).toEqual(fullDeck().sort());

describe('ไพ่ไปเที่ยว', () => {
  it('ส่งนักลงทุนไปเที่ยว: รอ 6 วินาทีแล้วมีผล ตระกูลนั้นใช้ในดีลนี้ไม่ได้', () => {
    let s = act(dealing({ [CAT]: ['travel-blue-1'] }), DAN, { type: 'PROPOSE', plan: redBlue });
    s = act(s, CAT, {
      type: 'PLAY_TRAVEL',
      card: 'travel-blue-1',
      target: { family: 'blue', source: 'investor' },
    });
    expect(dealOf(s).pending).toMatchObject({ kind: 'travel', by: CAT, until: T0 + PENDING_MS });
    expect(s.hands[CAT]).not.toContain('travel-blue-1');
    expect(boss.nextDeadline?.(s)).toBe(T0 + PENDING_MS);
    complete(s);

    s = fire(s);
    expect(dealOf(s).pending).toBeNull();
    expect(dealOf(s).away).toEqual(['blue']);
    // แผนเดิมใช้ blue จึงถูกล้าง
    expect(dealOf(s).plan).toBeNull();
    expect(s.lastPlay).toMatchObject({ kind: 'travel', outcome: 'resolved', seq: 1 });
    expect(s.discard).toContain('travel-blue-1');
    expect(tryAct(s, DAN, { type: 'PROPOSE', plan: redBlue })).toBe(BossError.SourceUnavailable);
    const redYellow: Plan = {
      slots: [
        { family: 'red', source: 'investor' },
        { family: 'yellow', source: 'investor' },
      ],
      shares: {},
    };
    expect(tryAct(s, DAN, { type: 'PROPOSE', plan: redYellow })).toBeNull();
    complete(s);
  });

  it('ไพ่ประจำตระกูลใช้ได้กับตระกูลนั้น ไพ่ใช้กับใครก็ได้ใช้ได้ทุกตระกูลในดีล', () => {
    const s = dealing({ [CAT]: ['travel-red-1', 'travel-any-1'] });
    const travel = (card: string, family: 'blue' | 'purple' | 'red') =>
      tryAct(s, CAT, { type: 'PLAY_TRAVEL', card, target: { family, source: 'investor' } });
    expect(travel('travel-red-1', 'blue')).toBe(BossError.WrongCard);
    expect(travel('travel-red-1', 'red')).toBeNull();
    expect(travel('travel-any-1', 'blue')).toBeNull();
    // purple ไม่อยู่ในดีลช่อง 0
    expect(travel('travel-any-1', 'purple')).toBe(BossError.FamilyNotInDeal);
    expect(
      tryAct(s, BOB, {
        type: 'PLAY_TRAVEL',
        card: 'travel-any-1',
        target: { family: 'blue', source: 'investor' },
      }),
    ).toBe(BossError.NotInHand);
  });

  it('นักลงทุนที่อยู่กองกลางหรือไปเที่ยวแล้ว ส่งไปเที่ยวไม่ได้', () => {
    let s: BossState = { ...owned(start(4, 9)), marker: 0, current: DAN };
    s = give({ ...s, investors: { ...s.investors, blue: null } }, CAT, ['travel-any-1']);
    s = act(s, DAN, { type: 'DECLARE' });
    expect(
      tryAct(s, CAT, {
        type: 'PLAY_TRAVEL',
        card: 'travel-any-1',
        target: { family: 'blue', source: 'investor' },
      }),
    ).toBe(BossError.InvalidTarget);
  });

  it('ส่งไพ่ตระกูลบนโต๊ะไปเที่ยว: ทั้งสองใบลงกองทิ้ง', () => {
    let s = dealing({ [CAT]: ['clan-red-1'], [ANN]: ['travel-any-1'] });
    s = act(s, CAT, { type: 'OFFER_CLAN', card: 'clan-red-1' });
    s = act(s, ANN, {
      type: 'PLAY_TRAVEL',
      card: 'travel-any-1',
      target: { family: 'red', source: 'clan-red-1' },
    });
    s = fire(s);
    expect(dealOf(s).offered).toEqual([]);
    expect(s.discard).toEqual(expect.arrayContaining(['clan-red-1', 'travel-any-1']));
    complete(s);
  });

  it('เป้าหายไปก่อนมีผล = ไม่มีผล (fizzled)', () => {
    let s = dealing({ [CAT]: ['clan-red-1'], [ANN]: ['travel-any-1'] });
    s = act(s, CAT, { type: 'OFFER_CLAN', card: 'clan-red-1' });
    s = act(s, ANN, {
      type: 'PLAY_TRAVEL',
      card: 'travel-any-1',
      target: { family: 'red', source: 'clan-red-1' },
    });
    // คนวางไพ่ออกจากเกม ไพ่ตระกูลของเขาหายจากโต๊ะ
    s = boss.onPlayerLeave?.(s, CAT, T0) as BossState;
    s = fire(s);
    expect(s.lastPlay?.outcome).toBe('fizzled');
    complete(s);
  });
});

describe('ไพ่เบรก', () => {
  it('ยกเลิกไพ่ที่รอผลอยู่ ไพ่ทั้งคู่ลงกองทิ้ง', () => {
    let s = dealing({ [CAT]: ['travel-blue-1'], [BOB]: ['stop-1'] });
    expect(tryAct(s, BOB, { type: 'PLAY_STOP', card: 'stop-1' })).toBe(BossError.NothingToStop);
    s = act(s, CAT, {
      type: 'PLAY_TRAVEL',
      card: 'travel-blue-1',
      target: { family: 'blue', source: 'investor' },
    });
    s = act(s, BOB, { type: 'PLAY_STOP', card: 'stop-1' }, T0 + 2000);
    expect(dealOf(s).pending).toBeNull();
    expect(dealOf(s).away).toEqual([]);
    expect(s.discard).toEqual(expect.arrayContaining(['travel-blue-1', 'stop-1']));
    expect(s.lastPlay).toMatchObject({ kind: 'travel', outcome: 'stopped', stoppedBy: BOB });
    expect(boss.nextDeadline?.(s)).toBe(dealOf(s).deadline);
    complete(s);
  });

  it('เบรกยกเลิกเบรกไม่ได้ (เบรกมีผลทันที ไม่มีอะไรให้เบรกต่อ)', () => {
    let s = dealing({ [CAT]: ['takeover-1'], [BOB]: ['stop-1'], [ANN]: ['stop-2'] });
    s = act(s, CAT, { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    s = act(s, BOB, { type: 'PLAY_STOP', card: 'stop-1' });
    expect(tryAct(s, ANN, { type: 'PLAY_STOP', card: 'stop-2' })).toBe(BossError.NothingToStop);
  });

  it('ไพ่อื่นที่ไม่ใช่เบรกใช้เบรกไม่ได้', () => {
    let s = dealing({ [CAT]: ['takeover-1'], [BOB]: ['takeover-2'] });
    s = act(s, CAT, { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    expect(tryAct(s, BOB, { type: 'PLAY_STOP', card: 'takeover-2' })).toBe(BossError.WrongCard);
  });
});

describe('ระหว่างมีไพ่รอผล', () => {
  it('ลงไพ่ที่ยกเลิกได้ใบอื่น เสนอแผน หรือตอบไม่ได้', () => {
    let s = act(dealing({ [CAT]: ['takeover-1'], [BOB]: ['takeover-2'] }), DAN, {
      type: 'PROPOSE',
      plan: redBlue,
    });
    s = act(s, CAT, { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    expect(tryAct(s, BOB, { type: 'PLAY_TAKEOVER', card: 'takeover-2' })).toBe(
      BossError.CardPending,
    );
    expect(tryAct(s, DAN, { type: 'PROPOSE', plan: redBlue })).toBe(BossError.CardPending);
    expect(tryAct(s, ANN, { type: 'RESPOND', agree: true })).toBe(BossError.CardPending);
  });

  it('ลงไพ่แล้วการตกลงทั้งหมดถูกล้าง แม้ไพ่ไม่กระทบแผน', () => {
    let s = act(dealing({ [CAT]: ['travel-yellow-1'] }), DAN, { type: 'PROPOSE', plan: redBlue });
    s = act(s, ANN, { type: 'RESPOND', agree: true });
    s = act(s, BOB, { type: 'RESPOND', agree: true });
    expect(dealOf(s).closeAt).not.toBeNull();
    s = act(s, CAT, {
      type: 'PLAY_TRAVEL',
      card: 'travel-yellow-1',
      target: { family: 'yellow', source: 'investor' },
    });
    expect(dealOf(s).closeAt).toBeNull();
    expect(dealOf(s).responses).toEqual({});
    s = fire(s);
    // yellow ไม่อยู่ในแผน แผนยังอยู่ แต่ต้องตกลงใหม่
    expect(dealOf(s).plan).toEqual(redBlue);
    expect(dealOf(s).closeAt).toBeNull();
  });

  it('บอสยอมแพ้ระหว่างรอผล → ไพ่ที่รอผลลงกองทิ้ง', () => {
    let s = dealing({ [CAT]: ['takeover-1'] });
    s = act(s, CAT, { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    s = act(s, DAN, { type: 'ABANDON' });
    expect(s.discard).toContain('takeover-1');
    complete(s);
  });

  it('คนลงไพ่ออกจากเกม → ไพ่ที่รอผลถูกยกเลิก', () => {
    let s = dealing({ [CAT]: ['takeover-1'] });
    s = act(s, CAT, { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    s = boss.onPlayerLeave?.(s, CAT, T0) as BossState;
    expect(dealOf(s).pending).toBeNull();
    expect(dealOf(s).boss).toBe(DAN);
    complete(s);
  });
});

describe('ไพ่ยึดดีล', () => {
  it('คนลงเป็นบอสคนใหม่ แผนถูกล้าง และได้เวลาเจรจาใหม่', () => {
    let s = act(dealing({ [BOB]: ['takeover-1'], [DAN]: ['takeover-2'] }), DAN, {
      type: 'PROPOSE',
      plan: redBlue,
    });
    expect(tryAct(s, DAN, { type: 'PLAY_TAKEOVER', card: 'takeover-2' })).toBe(
      BossError.AlreadyBoss,
    );
    s = act(s, BOB, { type: 'PLAY_TAKEOVER', card: 'takeover-1' }, T0 + 10_000);
    s = fire(s);
    const deal = dealOf(s);
    expect(deal.boss).toBe(BOB);
    expect(deal.plan).toBeNull();
    expect(deal.deadline).toBe(T0 + 10_000 + PENDING_MS + DEFAULT_NEGOTIATION_MS);
    expect(tryAct(s, DAN, { type: 'PROPOSE', plan: redBlue })).toBe(BossError.NotBoss);
  });

  it('ดีลจบแล้วเทิร์นไปคนทางซ้ายของบอสคนใหม่', () => {
    let s = dealing({ [BOB]: ['takeover-1'] });
    s = fire(act(s, BOB, { type: 'PLAY_TAKEOVER', card: 'takeover-1' }));
    const plan: Plan = { ...redBlue, shares: { [ANN]: 5 } };
    s = act(s, BOB, { type: 'PROPOSE', plan });
    s = act(s, ANN, { type: 'RESPOND', agree: true });
    const done = fire(s);
    expect(done.lastDeal).toMatchObject({ kind: 'closed', boss: BOB });
    expect(done.current).toBe(CAT);
    // บอสเดิม (ดัน) ไม่ได้อะไร
    expect(done.money[DAN]).toBe(0);

    const broken = act(s, BOB, { type: 'ABANDON' });
    expect(broken.current).toBe(CAT);
  });
});

describe('ไพ่ซื้อตัว', () => {
  const recruits = ['recruit-1', 'recruit-2', 'recruit-3'];

  it('มีนักลงทุนในกองกลาง ต้องซื้อจากกองกลาง', () => {
    // 4 คนไม่เรียก owned(): มี 2 ตระกูลอยู่กองกลาง
    let s: BossState = { ...start(4, 9), current: DAN };
    s = act(give(s, ANN, recruits), DAN, { type: 'DECLARE' });
    const pool = (['red', 'blue', 'yellow', 'purple', 'orange', 'green'] as const).filter(
      (f) => s.investors[f] === null,
    );
    const owned = (['red', 'blue', 'yellow', 'purple', 'orange', 'green'] as const).find(
      (f) => s.investors[f] !== null,
    );
    const family = pool[0];
    if (family === undefined || owned === undefined) throw new Error('need pool');
    expect(tryAct(s, ANN, { type: 'PLAY_RECRUIT', cards: recruits, family: owned })).toBe(
      BossError.RecruitFromPool,
    );
    s = fire(act(s, ANN, { type: 'PLAY_RECRUIT', cards: recruits, family }));
    expect(s.investors[family]).toBe(ANN);
    expect(s.discard).toEqual(expect.arrayContaining(recruits));
    complete(s);
  });

  it('กองกลางว่าง ซื้อจากคนอื่นได้ แต่ซื้อของตัวเองไม่ได้', () => {
    const s = dealing({ [ANN]: recruits });
    expect(tryAct(s, ANN, { type: 'PLAY_RECRUIT', cards: recruits, family: 'red' })).toBe(
      BossError.InvalidTarget,
    );
    const done = fire(act(s, ANN, { type: 'PLAY_RECRUIT', cards: recruits, family: 'blue' }));
    expect(done.investors.blue).toBe(ANN);
  });

  it('ต้องลง 3 ใบไม่ซ้ำ และเป็นไพ่ซื้อตัวทั้งหมด', () => {
    const s = dealing({ [ANN]: [...recruits, 'stop-1'] });
    const play = (cards: string[]) =>
      tryAct(s, ANN, { type: 'PLAY_RECRUIT', cards, family: 'blue' });
    expect(play(['recruit-1', 'recruit-2'])).toBe('invalid-action');
    expect(play(['recruit-1', 'recruit-1', 'recruit-2'])).toBe(BossError.NotInHand);
    expect(play(['recruit-1', 'recruit-2', 'stop-1'])).toBe(BossError.WrongCard);
  });

  it('ซื้อตัวนักลงทุนที่อยู่ในแผน → เจ้าของเปลี่ยน ส่วนแบ่งเดิมไม่ตรง แผนถูกล้าง', () => {
    let s = act(dealing({ [CAT]: recruits }), DAN, { type: 'PROPOSE', plan: redBlue });
    s = fire(act(s, CAT, { type: 'PLAY_RECRUIT', cards: recruits, family: 'blue' }));
    expect(s.investors.blue).toBe(CAT);
    // ส่วนแบ่งให้ bob ซึ่งไม่ได้อยู่ในดีลแล้ว
    expect(dealOf(s).plan).toBeNull();
  });
});

describe('ลงไพ่อิทธิพลนอกดีลไม่ได้', () => {
  it('ช่วงเทิร์นปกติ', () => {
    const s = give({ ...start(4, 9), current: DAN }, ANN, ['takeover-1', 'stop-1']);
    expect(tryAct(s, ANN, { type: 'PLAY_TAKEOVER', card: 'takeover-1' })).toBe(
      BossError.WrongPhase,
    );
    expect(tryAct(s, ANN, { type: 'PLAY_STOP', card: 'stop-1' })).toBe(BossError.WrongPhase);
  });
});

describe('ไพ่เกิน 12 ใบ: ลงชุดซื้อตัวแทนการทิ้ง (กติกาต้นฉบับ)', () => {
  const recruits = ['recruit-1', 'recruit-2', 'recruit-3'];

  /** ดันถือ 15 ใบ (มีซื้อตัว 3 ใบ) และต้องทิ้ง 3 ใบ */
  function overLimit(extra: Record<string, string[]> = {}): BossState {
    let s: BossState = { ...owned(start(4, 9)), current: DAN };
    const filler = s.deck.filter((c) => !c.startsWith('recruit') && !c.startsWith('stop'));
    s = give(s, DAN, [...recruits, ...filler.slice(0, 12 - (s.hands[DAN]?.length ?? 0))]);
    for (const [p, list] of Object.entries(extra)) s = give(s, p, list);
    expect(s.hands[DAN]).toHaveLength(15);
    return { ...s, phase: 'discard' };
  }

  it('ซื้อตัวแล้วรอเบรก ระหว่างนั้นทิ้งไม่ได้ พอมีผลได้นักลงทุนและจบเทิร์น', () => {
    let s = overLimit({ [BOB]: ['recruit-4', 'recruit-5', 'recruit-6'] });
    expect(tryAct(s, BOB, { type: 'PLAY_RECRUIT', cards: recruits, family: 'blue' })).toBe(
      BossError.NotYourTurn,
    );
    expect(tryAct(s, DAN, { type: 'PLAY_RECRUIT', cards: recruits, family: 'purple' })).toBe(
      BossError.InvalidTarget,
    );
    s = act(s, DAN, { type: 'PLAY_RECRUIT', cards: recruits, family: 'blue' });
    expect(s.pending).toMatchObject({ kind: 'recruit', by: DAN, until: T0 + PENDING_MS });
    expect(boss.playerView(s, ANN).pending).toMatchObject({ kind: 'recruit', family: 'blue' });
    expect(tryAct(s, DAN, { type: 'DISCARD', cards: [] })).toBe(BossError.CardPending);
    complete(s);

    s = fire(s);
    expect(s.investors.blue).toBe(DAN);
    expect(s.hands[DAN]).toHaveLength(12);
    expect(s).toMatchObject({ phase: 'turn', current: ANN, pending: null });
    expect(s.lastPlay).toMatchObject({ kind: 'recruit', outcome: 'resolved' });
    complete(s);
  });

  it('คนอื่นเบรกได้ ไม่ได้นักลงทุน ไพ่ลงกองทิ้ง แล้วจบเทิร์น', () => {
    let s = overLimit({ [CAT]: ['stop-1'] });
    s = act(s, DAN, { type: 'PLAY_RECRUIT', cards: recruits, family: 'blue' });
    s = act(s, CAT, { type: 'PLAY_STOP', card: 'stop-1' });
    expect(s.investors.blue).toBe(BOB);
    expect(s.discard).toEqual(expect.arrayContaining([...recruits, 'stop-1']));
    expect(s).toMatchObject({ phase: 'turn', current: ANN, pending: null });
    expect(s.lastPlay).toMatchObject({ outcome: 'stopped', stoppedBy: CAT });
    complete(s);
  });

  it('ไม่มีไพ่รอผล เบรกไม่ได้', () => {
    const s = overLimit({ [CAT]: ['stop-1'] });
    expect(tryAct(s, CAT, { type: 'PLAY_STOP', card: 'stop-1' })).toBe(BossError.NothingToStop);
  });
});

describe('บอสควักเงินตัวเองจ่ายเพิ่มได้ (กติกาต้นฉบับ)', () => {
  it('ส่วนแบ่งรวมเกินเงินดีลได้ไม่เกินเงินที่บอสมี', () => {
    let s = dealing();
    s = { ...s, money: { ...s.money, [DAN]: 100 } };
    const payout = boss.playerView(s, DAN).deal?.payout ?? 0;
    const plan = (extra: number): Plan => ({
      ...redBlue,
      shares: { [ANN]: payout, [BOB]: extra },
    });
    expect(tryAct(s, DAN, { type: 'PROPOSE', plan: plan(101) })).toBe(BossError.SharesTooHigh);
    s = act(s, DAN, { type: 'PROPOSE', plan: plan(100) });
    s = act(s, ANN, { type: 'RESPOND', agree: true });
    s = fire(act(s, BOB, { type: 'RESPOND', agree: true }));
    expect(s.money).toMatchObject({ [DAN]: 0, [ANN]: payout, [BOB]: 100 });
  });
});
