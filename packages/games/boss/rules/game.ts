import { z } from 'zod';
import type { GameDefinition, PlayerId, Rng } from '@batonboard/engine';
import type {
  BossAction,
  BossConfig,
  BossOptions,
  BossState,
  BossView,
  CardId,
  Deal,
  DealOutcome,
  EndReason,
  Family,
  PendingPlay,
  PlayResult,
  SpaceDef,
} from './types';
import {
  BOARD_SIZE,
  BossError,
  CLOSE_MS,
  DEFAULT_NEGOTIATION_MS,
  DIE_FACES,
  DRAW_COUNT,
  END_ROLL_DEALS,
  FAMILIES,
  FULL_GAME_DEALS,
  HAND_LIMIT,
  MAX_NEGOTIATION_MS,
  MAX_PLAYERS,
  MIN_NEGOTIATION_MS,
  MIN_PLAYERS,
  PENDING_MS,
  RECRUIT_SET,
  SHORT_GAME_DEALS,
  START_HAND,
} from './constants';
import { cardFamily, cardKind, fullDeck } from './cards';
import { checkPlan, participants, spaceFamilies } from './plan';

const idSchema = z.string().min(1).max(64);
const cardSchema = z.string().min(1).max(32);
const familySchema = z.enum(FAMILIES);

const actionSchema: z.ZodType<BossAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ROLL') }),
  z.object({ type: z.literal('DECLARE') }),
  z.object({ type: z.literal('DRAW') }),
  z.object({ type: z.literal('OFFER_CLAN'), card: cardSchema }),
  z.object({
    type: z.literal('PROPOSE'),
    plan: z.object({
      slots: z.array(z.object({ family: familySchema, source: cardSchema })).max(FAMILIES.length),
      shares: z.record(idSchema, z.number().int().min(0).max(1_000_000_000)),
    }),
  }),
  z.object({ type: z.literal('RESPOND'), agree: z.boolean() }),
  z.object({ type: z.literal('ABANDON') }),
  z.object({
    type: z.literal('PLAY_TRAVEL'),
    card: cardSchema,
    target: z.object({ family: familySchema, source: cardSchema }),
  }),
  z.object({ type: z.literal('PLAY_TAKEOVER'), card: cardSchema }),
  z.object({
    type: z.literal('PLAY_RECRUIT'),
    cards: z.array(cardSchema).length(RECRUIT_SET),
    family: familySchema,
  }),
  z.object({ type: z.literal('PLAY_STOP'), card: cardSchema }),
]);

const optionsSchema: z.ZodType<BossOptions> = z.object({
  negotiationMs: z.number().int().min(MIN_NEGOTIATION_MS).max(MAX_NEGOTIATION_MS).nullable(),
  length: z.enum(['full', 'short']),
});

function assertValidConfig({ spaces, dealValues, endFaces }: BossConfig): void {
  if (spaces.length !== BOARD_SIZE) throw new Error(`board needs ${BOARD_SIZE} spaces`);
  if (new Set(spaces.map((s) => s.id)).size !== spaces.length) {
    throw new Error('space ids must be unique');
  }
  for (const space of spaces) {
    const families = spaceFamilies(space);
    if (!Number.isInteger(space.shares) || space.shares < 1) {
      throw new Error(`space "${space.id}" needs positive shares`);
    }
    if (new Set(families).size !== families.length || families.some((f) => !FAMILIES.includes(f))) {
      throw new Error(`space "${space.id}" has duplicate or unknown families`);
    }
    const opt = space.optional;
    if (opt !== null && (opt.count < 1 || opt.count > opt.from.length)) {
      throw new Error(`space "${space.id}" optional count out of range`);
    }
  }
  if (
    dealValues.length !== FULL_GAME_DEALS ||
    dealValues.some((v, i) => !Number.isInteger(v) || v < 1 || v < (dealValues[i - 1] ?? 0))
  ) {
    throw new Error(`dealValues needs ${FULL_GAME_DEALS} rising positive integers`);
  }
  if (
    endFaces.length !== END_ROLL_DEALS ||
    endFaces.some((f) => new Set(f).size !== f.length || f.some((v) => v < 1 || v > DIE_FACES))
  ) {
    throw new Error(`endFaces needs ${END_ROLL_DEALS} sets of die faces`);
  }
}

/** คนทางซ้าย (index ถัดไป) ของ `player` ใน `order` */
function leftOf(order: PlayerId[], player: PlayerId): PlayerId {
  const i = order.indexOf(player);
  return order[(i + 1) % order.length] as PlayerId;
}

/** เดินจาก `from` ไป `steps` ช่องที่ยังเปิดอยู่ (ข้ามช่องที่ปิดดีลแล้ว) */
function advance(from: number, steps: number, closed: number[]): number {
  let at = from;
  for (let moved = 0; moved < steps;) {
    at = (at + 1) % BOARD_SIZE;
    if (!closed.includes(at)) moved++;
  }
  return at;
}

/** จั่วจากกอง ถ้ากองหมดสับกองทิ้งมาใช้ใหม่ */
function draw(
  state: BossState,
  player: PlayerId,
  count: number,
  rng: Rng,
): Pick<BossState, 'deck' | 'discard' | 'hands'> {
  let deck = state.deck;
  let discard = state.discard;
  const hand = [...(state.hands[player] ?? [])];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discard.length === 0) break;
      deck = rng.shuffle(discard);
      discard = [];
    }
    hand.push(deck[0] as CardId);
    deck = deck.slice(1);
  }
  return { deck, discard, hands: { ...state.hands, [player]: hand } };
}

function winners(state: BossState): PlayerId[] {
  const top = Math.max(...state.players.map((p) => state.money[p] ?? 0));
  return state.players.filter((p) => (state.money[p] ?? 0) === top);
}

function endGame(state: BossState, reason: EndReason): BossState {
  return { ...state, phase: 'ended', deal: null, result: { reason, winners: winners(state) } };
}

/**
 * คืนไพ่บนโต๊ะ: ที่ใช้ในดีลลงกองทิ้ง ที่ไม่ได้ใช้กลับมือเจ้าของ (ถ้ายังอยู่)
 * ไพ่ที่รอผลอยู่ไม่มีผลแล้ว ลงกองทิ้ง
 */
function clearTable(state: BossState, deal: Deal, used: CardId[]): BossState {
  const hands = { ...state.hands };
  const discard = [...state.discard, ...(deal.pending?.cards ?? [])];
  for (const { card, by } of deal.offered) {
    const hand = hands[by];
    if (used.includes(card) || hand === undefined) discard.push(card);
    else hands[by] = [...hand, card];
  }
  return { ...state, hands, discard, deal: null };
}

function breakDeal(
  state: BossState,
  reason: Extract<DealOutcome, { kind: 'broken' }>['reason'],
  next: PlayerId,
): BossState {
  const deal = state.deal;
  if (deal === null) return state;
  return {
    ...clearTable(state, deal, []),
    phase: 'turn',
    current: next,
    lastDeal: { kind: 'broken', space: deal.space, boss: deal.boss, reason },
  };
}

/** ผู้เล่นถือไพ่ทุกใบนี้ (ไม่ซ้ำกัน) และเป็นชนิด `kind` */
function holds(state: BossState, by: PlayerId, cards: CardId[], kind: string): string | null {
  const hand = state.hands[by] ?? [];
  if (new Set(cards).size !== cards.length || cards.some((c) => !hand.includes(c))) {
    return BossError.NotInHand;
  }
  return cards.every((c) => cardKind(c) === kind) ? null : BossError.WrongCard;
}

function nextSeq(state: BossState): number {
  return (state.lastPlay?.seq ?? 0) + 1;
}

/** ไพ่ที่จะลง (ยังไม่มีเวลารอผล) */
type NewPlay = PendingPlay extends infer P ? (P extends unknown ? Omit<P, 'until'> : never) : never;

export function createBoss(
  config: BossConfig,
): GameDefinition<BossState, BossAction, BossView, BossOptions> {
  assertValidConfig(config);
  const { spaces, dealValues, endFaces } = config;

  const spaceAt = (i: number) => spaces[i] as SpaceDef;
  const priceOf = (state: BossState) => dealValues[state.dealsDone] ?? 0;
  const payoutOf = (state: BossState, deal: Deal) => priceOf(state) * spaceAt(deal.space).shares;
  const tableOf = (state: BossState, deal: Deal) => ({
    investors: state.investors,
    offered: deal.offered,
    away: deal.away,
  });

  /** ลงไพ่ที่ยกเลิกได้: ออกจากมือ รอผล `PENDING_MS` และล้างการตกลงทั้งหมด */
  function playPending(state: BossState, play: NewPlay, now: number): BossState {
    const deal = state.deal;
    if (deal === null) return state;
    const hand = state.hands[play.by] ?? [];
    return {
      ...state,
      hands: { ...state.hands, [play.by]: hand.filter((c) => !play.cards.includes(c)) },
      deal: {
        ...deal,
        pending: { ...play, until: now + PENDING_MS },
        responses: {},
        closeAt: null,
      },
    };
  }

  /** ไพ่ที่รอผลครบเวลาแล้ว: มีผลตามชนิด แล้วตรวจว่าแผนยังใช้ได้ไหม */
  function resolvePending(state: BossState, now: number): BossState {
    const deal = state.deal;
    const pending = deal?.pending;
    if (deal == null || pending == null) return state;
    let next: Deal = { ...deal, pending: null };
    let investors = state.investors;
    const discard = [...state.discard, ...pending.cards];
    let outcome: PlayResult['outcome'] = 'resolved';

    switch (pending.kind) {
      case 'travel': {
        const { family, source } = pending.target;
        if (source === 'investor') {
          next = { ...next, away: [...next.away, family] };
        } else if (next.offered.some((o) => o.card === source)) {
          next = { ...next, offered: next.offered.filter((o) => o.card !== source) };
          discard.push(source);
        } else {
          outcome = 'fizzled';
        }
        break;
      }
      case 'takeover':
        next = {
          ...next,
          boss: pending.by,
          plan: null,
          // บอสใหม่ได้เวลาเจรจาเต็มอีกครั้ง
          deadline: state.negotiationMs === null ? null : now + state.negotiationMs,
        };
        break;
      case 'recruit':
        investors = { ...investors, [pending.family]: pending.by };
        break;
    }

    const resolved: BossState = {
      ...state,
      investors,
      discard,
      deal: next,
      lastPlay: { ...pending, seq: nextSeq(state), outcome, stoppedBy: null },
    };
    // ไพ่ที่มีผลอาจทำให้แผนเดิมใช้ไม่ได้ (เช่น ตระกูลในแผนไปเที่ยว) บอสต้องเสนอใหม่
    const plan = next.plan;
    const broken =
      plan !== null &&
      checkPlan(
        spaceAt(next.space),
        tableOf(resolved, next),
        plan,
        next.boss,
        payoutOf(resolved, next),
      ) !== null;
    return broken ? { ...resolved, deal: { ...next, plan: null } } : resolved;
  }

  function closeDeal(state: BossState): BossState {
    const deal = state.deal;
    if (deal === null || deal.plan === null) return state;
    const plan = deal.plan;
    const payout = payoutOf(state, deal);
    const paid: Record<PlayerId, number> = { ...plan.shares };
    const shared = Object.values(plan.shares).reduce((sum, v) => sum + v, 0);
    paid[deal.boss] = (paid[deal.boss] ?? 0) + payout - shared;
    const money = { ...state.money };
    for (const [p, amount] of Object.entries(paid)) money[p] = (money[p] ?? 0) + amount;

    const used = plan.slots.flatMap((s) => (s.source === 'investor' ? [] : [s.source]));
    const closed = [...state.closed, deal.space];
    const dealsDone = state.dealsDone + 1;
    const next: BossState = {
      ...clearTable(state, deal, used),
      phase: 'turn',
      money,
      closed,
      dealsDone,
      marker: advance(deal.space, 1, closed),
      current: leftOf(state.players, deal.boss),
      lastDeal: { kind: 'closed', space: deal.space, boss: deal.boss, payout, paid },
    };

    if (dealsDone >= state.maxDeals) return endGame(next, 'last-deal');
    const check = dealsDone - (state.maxDeals - END_ROLL_DEALS);
    const faces = endFaces[check];
    if (faces === undefined) return next;
    const rolled: BossState = {
      ...next,
      lastRoll: {
        value: deal.endRoll,
        seq: (state.lastRoll?.seq ?? 0) + 1,
        by: deal.boss,
        kind: 'end',
      },
    };
    return faces.includes(deal.endRoll) ? endGame(rolled, 'end-roll') : rolled;
  }

  /** ทุกคนในแผน (ยกเว้นบอส) ตกลงแล้ว → เริ่มนับถอยหลังปิดดีล */
  function updateClose(state: BossState, now: number): BossState {
    const deal = state.deal;
    if (deal === null || deal.plan === null) return state;
    const others = participants(tableOf(state, deal), deal.plan).filter((p) => p !== deal.boss);
    const ready = others.every((p) => deal.responses[p] === true);
    return { ...state, deal: { ...deal, closeAt: ready ? now + CLOSE_MS : null } };
  }

  return {
    id: 'boss',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    actionSchema,
    optionsSchema,
    defaultOptions: { negotiationMs: DEFAULT_NEGOTIATION_MS, length: 'full' },

    setup(players, options, rng) {
      const families = rng.shuffle(FAMILIES);
      // 3 คนได้นักลงทุนคนละ 2 ตระกูล นอกนั้นคนละ 1 ที่เหลืออยู่กองกลาง
      const perPlayer = players.length === MIN_PLAYERS ? 2 : 1;
      const investors = Object.fromEntries(
        families.map((f, i) => [f, players[Math.floor(i / perPlayer)] ?? null]),
      ) as Record<Family, PlayerId | null>;

      let deck = rng.shuffle(fullDeck());
      const hands: Record<PlayerId, CardId[]> = {};
      for (const p of players) {
        hands[p] = deck.slice(0, START_HAND);
        deck = deck.slice(START_HAND);
      }

      return {
        phase: 'turn',
        players,
        current: players[rng.int(players.length)] as PlayerId,
        marker: rng.int(BOARD_SIZE),
        closed: [],
        dealsDone: 0,
        maxDeals: options.length === 'short' ? SHORT_GAME_DEALS : FULL_GAME_DEALS,
        negotiationMs: options.negotiationMs,
        investors,
        hands,
        deck,
        discard: [],
        money: Object.fromEntries(players.map((p) => [p, 0])),
        deal: null,
        lastRoll: null,
        lastDeal: null,
        lastPlay: null,
        result: null,
      };
    },

    validate(state, action, by) {
      if (!state.players.includes(by)) return BossError.NotAPlayer;
      const deal = state.deal;

      switch (action.type) {
        case 'ROLL':
          if (state.phase !== 'turn') return BossError.WrongPhase;
          return by === state.current ? null : BossError.NotYourTurn;
        case 'DECLARE':
          if (state.phase !== 'turn' && state.phase !== 'moved') return BossError.WrongPhase;
          if (by !== state.current) return BossError.NotYourTurn;
          return state.closed.includes(state.marker) ? BossError.SpaceClosed : null;
        case 'DRAW':
          if (state.phase !== 'moved') return BossError.WrongPhase;
          return by === state.current ? null : BossError.NotYourTurn;
        case 'OFFER_CLAN': {
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          if (!(state.hands[by] ?? []).includes(action.card)) return BossError.NotInHand;
          const family = cardFamily(action.card);
          if (cardKind(action.card) !== 'clan' || family === null) return BossError.NotAClanCard;
          return spaceFamilies(spaceAt(deal.space)).includes(family)
            ? null
            : BossError.FamilyNotInDeal;
        }
        case 'PROPOSE':
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          if (by !== deal.boss) return BossError.NotBoss;
          if (deal.pending !== null) return BossError.CardPending;
          return checkPlan(
            spaceAt(deal.space),
            tableOf(state, deal),
            action.plan,
            deal.boss,
            payoutOf(state, deal),
          );
        case 'RESPOND':
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          if (deal.plan === null) return BossError.NoPlan;
          if (deal.pending !== null) return BossError.CardPending;
          if (by === deal.boss || !participants(tableOf(state, deal), deal.plan).includes(by)) {
            return BossError.NotParticipant;
          }
          return null;
        case 'ABANDON':
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          return by === deal.boss ? null : BossError.NotBoss;
        case 'PLAY_TRAVEL': {
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          if (deal.pending !== null) return BossError.CardPending;
          const err = holds(state, by, [action.card], 'travel');
          if (err !== null) return err;
          const { family, source } = action.target;
          const cardFor = cardFamily(action.card);
          // ไพ่ไปเที่ยวประจำตระกูลใช้ได้กับตระกูลนั้นเท่านั้น (`travel-any-*` ใช้ได้ทุกตระกูล)
          if (cardFor !== null && cardFor !== family) return BossError.WrongCard;
          if (!spaceFamilies(spaceAt(deal.space)).includes(family)) {
            return BossError.FamilyNotInDeal;
          }
          if (source === 'investor') {
            return state.investors[family] === null || deal.away.includes(family)
              ? BossError.InvalidTarget
              : null;
          }
          return deal.offered.some((o) => o.card === source) && cardFamily(source) === family
            ? null
            : BossError.InvalidTarget;
        }
        case 'PLAY_TAKEOVER':
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          if (deal.pending !== null) return BossError.CardPending;
          if (by === deal.boss) return BossError.AlreadyBoss;
          return holds(state, by, [action.card], 'takeover');
        case 'PLAY_RECRUIT': {
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          if (deal.pending !== null) return BossError.CardPending;
          const err = holds(state, by, action.cards, 'recruit');
          if (err !== null) return err;
          // มีนักลงทุนเหลือกองกลาง ต้องซื้อจากกองกลางก่อน ไม่งั้นซื้อจากคนอื่น
          const pool = FAMILIES.filter((f) => state.investors[f] === null);
          if (pool.length > 0) {
            return pool.includes(action.family) ? null : BossError.RecruitFromPool;
          }
          return state.investors[action.family] === by ? BossError.InvalidTarget : null;
        }
        case 'PLAY_STOP':
          if (state.phase !== 'deal' || deal === null) return BossError.WrongPhase;
          if (deal.pending === null) return BossError.NothingToStop;
          return holds(state, by, [action.card], 'stop');
      }
    },

    apply(state, action, by, now, rng) {
      const deal = state.deal;
      switch (action.type) {
        case 'ROLL': {
          const value = rng.int(DIE_FACES) + 1;
          return {
            ...state,
            phase: 'moved',
            marker: advance(state.marker, value, state.closed),
            lastRoll: { value, seq: (state.lastRoll?.seq ?? 0) + 1, by, kind: 'move' },
          };
        }
        case 'DECLARE':
          return {
            ...state,
            phase: 'deal',
            deal: {
              space: state.marker,
              boss: by,
              offered: [],
              away: [],
              pending: null,
              plan: null,
              responses: {},
              deadline: state.negotiationMs === null ? null : now + state.negotiationMs,
              closeAt: null,
              endRoll: rng.int(DIE_FACES) + 1,
            },
          };
        case 'DRAW': {
          const room = Math.max(0, HAND_LIMIT - (state.hands[by]?.length ?? 0));
          return {
            ...state,
            ...draw(state, by, Math.min(DRAW_COUNT, room), rng),
            phase: 'turn',
            current: leftOf(state.players, by),
          };
        }
        case 'OFFER_CLAN':
          if (deal === null) return state;
          return {
            ...state,
            hands: {
              ...state.hands,
              [by]: (state.hands[by] ?? []).filter((c) => c !== action.card),
            },
            deal: { ...deal, offered: [...deal.offered, { card: action.card, by }] },
          };
        case 'PROPOSE':
          if (deal === null) return state;
          return updateClose(
            { ...state, deal: { ...deal, plan: action.plan, responses: {} } },
            now,
          );
        case 'RESPOND':
          if (deal === null) return state;
          return updateClose(
            { ...state, deal: { ...deal, responses: { ...deal.responses, [by]: action.agree } } },
            now,
          );
        case 'ABANDON':
          return breakDeal(state, 'abandoned', leftOf(state.players, by));
        case 'PLAY_TRAVEL':
          return playPending(
            state,
            { kind: 'travel', by, cards: [action.card], target: action.target },
            now,
          );
        case 'PLAY_TAKEOVER':
          return playPending(state, { kind: 'takeover', by, cards: [action.card] }, now);
        case 'PLAY_RECRUIT':
          return playPending(
            state,
            { kind: 'recruit', by, cards: action.cards, family: action.family },
            now,
          );
        case 'PLAY_STOP': {
          const pending = deal?.pending;
          if (deal == null || pending == null) return state;
          // เบรกยกเลิกไพ่ที่รอผล ทั้งคู่ลงกองทิ้ง (เบรกด้วยกันยกเลิกไม่ได้ จึงไม่ต้องรอ)
          return {
            ...state,
            hands: {
              ...state.hands,
              [by]: (state.hands[by] ?? []).filter((c) => c !== action.card),
            },
            discard: [...state.discard, ...pending.cards, action.card],
            deal: { ...deal, pending: null },
            lastPlay: { ...pending, seq: nextSeq(state), outcome: 'stopped', stoppedBy: by },
          };
        }
      }
    },

    playerView(state, viewer): BossView {
      const deal = state.deal;
      return {
        phase: state.phase,
        me: viewer,
        boardId: config.boardId,
        players: state.players,
        current: state.current,
        marker: state.marker,
        closed: state.closed,
        dealsDone: state.dealsDone,
        maxDeals: state.maxDeals,
        price: state.phase === 'ended' ? null : priceOf(state),
        investors: state.investors,
        hand: state.hands[viewer] ?? [],
        handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]?.length ?? 0])),
        deckCount: state.deck.length,
        discardCount: state.discard.length,
        money: state.money,
        // ไม่ส่ง endRoll — เปิดเผยตอนปิดดีลผ่าน lastRoll
        deal: deal && {
          space: deal.space,
          boss: deal.boss,
          offered: deal.offered,
          away: deal.away,
          pending: deal.pending,
          plan: deal.plan,
          responses: deal.responses,
          deadline: deal.deadline,
          closeAt: deal.closeAt,
          payout: payoutOf(state, deal),
        },
        lastRoll: state.lastRoll,
        lastDeal: state.lastDeal,
        lastPlay: state.lastPlay,
        result: state.result,
      };
    },

    nextDeadline(state) {
      const deal = state.deal;
      if (state.phase !== 'deal' || deal === null) return null;
      const times = [deal.pending?.until ?? null, deal.closeAt, deal.deadline].filter(
        (t): t is number => t !== null,
      );
      return times.length === 0 ? null : Math.min(...times);
    },

    onDeadline(state, now) {
      const deal = state.deal;
      if (state.phase !== 'deal' || deal === null) return state;
      if (deal.pending !== null && now >= deal.pending.until) return resolvePending(state, now);
      if (deal.closeAt !== null && now >= deal.closeAt) return closeDeal(state);
      if (deal.deadline !== null && now >= deal.deadline) {
        return breakDeal(state, 'time-up', leftOf(state.players, deal.boss));
      }
      return state;
    },

    onPlayerLeave(state, player) {
      if (!state.players.includes(player) || state.phase === 'ended') return state;
      const order = state.players;
      const players = order.filter((p) => p !== player);
      // คนถัดไปทางซ้ายที่ยังอยู่ (คิดจากลำดับเดิมก่อนตัดคนออก)
      const nextAfter = (p: PlayerId) => {
        let next = leftOf(order, p);
        while (next === player) next = leftOf(order, next);
        return next;
      };

      const hands = Object.fromEntries(Object.entries(state.hands).filter(([p]) => p !== player));
      const investors = Object.fromEntries(
        FAMILIES.map((f) => [f, state.investors[f] === player ? null : state.investors[f]]),
      ) as Record<Family, PlayerId | null>;
      let left: BossState = {
        ...state,
        players,
        investors,
        hands,
        discard: [...state.discard, ...(state.hands[player] ?? [])],
      };

      const deal = state.deal;
      if (deal !== null) {
        const wasMember =
          deal.plan !== null && participants(tableOf(state, deal), deal.plan).includes(player);
        const pendingGone = deal.pending?.by === player;
        left = {
          ...left,
          discard: [
            ...left.discard,
            ...deal.offered.filter((o) => o.by === player).map((o) => o.card),
            ...(pendingGone ? (deal.pending?.cards ?? []) : []),
          ],
          deal: {
            ...deal,
            offered: deal.offered.filter((o) => o.by !== player),
            pending: pendingGone ? null : deal.pending,
            // แผนที่มีคนที่ออกใช้ต่อไม่ได้ บอสต้องเสนอใหม่
            ...(wasMember ? { plan: null, responses: {}, closeAt: null } : {}),
          },
        };
      }

      if (players.length < MIN_PLAYERS) return endGame(left, 'not-enough-players');
      if (deal !== null && deal.boss === player) {
        return breakDeal(left, 'boss-left', nextAfter(player));
      }
      if (state.current === player && state.phase !== 'deal') {
        return { ...left, phase: 'turn', current: nextAfter(player) };
      }
      if (state.current === player) return { ...left, current: nextAfter(player) };
      return left;
    },

    isOver: (state) => state.phase === 'ended',
  };
}
