/**
 * จำลองเกมด้วยผู้เล่นสุ่มหลายร้อยเกมบนกระดานจริง ตรวจว่า:
 * - ทุกเกมจบได้ ไม่ค้าง
 * - ไพ่ครบ 98 ใบตลอด และเงินรวมเท่ากับเงินจากดีลที่ปิดแล้ว
 * - ทุกช่องบนกระดานปิดดีลได้จริง
 * - ความยาวเกมอยู่ในช่วงที่ออกแบบไว้
 *
 * ผู้เล่นจำลองไม่ได้เล่นเก่ง แค่ลองทุกอย่างที่กติกาเปิดให้ทำ (รวมไพ่อิทธิพลแบบสุ่ม)
 */
import { describe, expect, it } from 'vitest';
import {
  createRng,
  dispatchAction,
  fireDeadline,
  getDeadline,
  startGame,
} from '@batonboard/engine';
import type { PlayerId, Rng } from '@batonboard/engine';
import { boss } from '.';
import { cityV1 } from './data';
import { cardFamily, cardKind, FAMILIES, fullDeck, slotOwner, spaceFamilies } from './rules';
import type { BossAction, BossState, Family, Plan } from './rules';

const T0 = 1_700_000_000_000;
const MAX_STEPS = 5_000;
const DECK = fullDeck().sort();

interface Game {
  state: BossState;
  now: number;
  step: number;
  /** จำนวนเทิร์น (ทอยหรือประกาศดีลตอนต้นเทิร์น) */
  turns: number;
}

function send(game: Game, by: PlayerId, action: BossAction): boolean {
  const rng = createRng(game.step * 7919 + 13);
  const res = dispatchAction(boss, game.state, action, by, { hostId: '' }, game.now, rng);
  if (res.ok) game.state = res.value;
  return res.ok;
}

function must(game: Game, by: PlayerId, action: BossAction): void {
  const before = game.state;
  if (!send(game, by, action)) {
    const res = dispatchAction(boss, before, action, by, { hostId: '' }, game.now, createRng(1));
    throw new Error(`${by} ${JSON.stringify(action)}: ${res.ok ? '?' : res.error}`);
  }
}

/** ข้ามเวลาไปถึง deadline ถัดไปแล้วปลุกเกม */
function wait(game: Game): void {
  const deadline = getDeadline(boss, game.state);
  if (deadline === null) throw new Error('stuck: no deadline');
  game.now = Math.max(game.now, deadline);
  game.state = fireDeadline(boss, game.state, deadline);
}

function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[rng.int(items.length)];
}

/** ตระกูลนี้หามาได้ไหม: นักลงทุนที่ไม่ไปเที่ยว ไพ่บนโต๊ะ หรือไพ่ตระกูลบนมือใครสักคน */
function obtainable(state: BossState, family: Family): boolean {
  const deal = state.deal;
  const away = deal?.away ?? [];
  if (state.investors[family] !== null && !away.includes(family)) return true;
  if (deal?.offered.some((o) => cardFamily(o.card) === family)) return true;
  return state.players.some((p) => clanOf(state, p, family) !== undefined);
}

function clanOf(state: BossState, player: PlayerId, family: Family): string | undefined {
  return (state.hands[player] ?? []).find(
    (c) => cardKind(c) === 'clan' && cardFamily(c) === family,
  );
}

function feasible(state: BossState, space: number): boolean {
  const def = cityV1.spaces[space];
  if (def === undefined) return false;
  if (!def.required.every((f) => obtainable(state, f))) return false;
  const opt = def.optional;
  return opt === null || opt.from.filter((f) => obtainable(state, f)).length >= opt.count;
}

/** บอสหาแหล่งของตระกูล: นักลงทุน → ไพ่บนโต๊ะ → ขอให้คนวางไพ่ตระกูล */
function source(game: Game, family: Family): Plan['slots'][number]['source'] | null {
  const deal = game.state.deal;
  if (deal === null) return null;
  const table = { investors: game.state.investors, offered: deal.offered, away: deal.away };
  if (slotOwner(table, family, 'investor') !== null) return 'investor';
  const onTable = deal.offered.find((o) => cardFamily(o.card) === family);
  if (onTable) return onTable.card;
  for (const p of game.state.players) {
    const card = clanOf(game.state, p, family);
    if (card !== undefined) {
      must(game, p, { type: 'OFFER_CLAN', card });
      return card;
    }
  }
  return null;
}

function buildPlan(game: Game, rng: Rng): Plan | null {
  const deal = game.state.deal;
  if (deal === null) return null;
  const def = cityV1.spaces[deal.space];
  if (def === undefined) return null;
  const slots: Plan['slots'] = [];
  for (const family of def.required) {
    const s = source(game, family);
    if (s === null) return null;
    slots.push({ family, source: s });
  }
  if (def.optional !== null) {
    const choices = rng.shuffle(def.optional.from);
    for (const family of choices) {
      if (slots.length === def.required.length + def.optional.count) break;
      const s = source(game, family);
      if (s !== null) slots.push({ family, source: s });
    }
    if (slots.length < def.required.length + def.optional.count) return null;
  }
  const after = game.state.deal;
  if (after === null) return null;
  const table = { investors: game.state.investors, offered: after.offered, away: after.away };
  const members = [
    ...new Set(slots.map((s) => slotOwner(table, s.family, s.source)).filter((p) => p !== null)),
  ].filter((p) => p !== after.boss);
  const payout = (cityV1.dealValues[game.state.dealsDone] ?? 0) * def.shares;
  const each = Math.floor(payout / (members.length + 1));
  const shares = Object.fromEntries(members.map((p) => [p, rng.int(each + 1)]));
  return { slots, shares };
}

/** บางครั้งมีคนลงไพ่อิทธิพลแบบสุ่ม */
function randomInfluence(game: Game, rng: Rng): void {
  const s = game.state;
  const deal = s.deal;
  if (deal === null) return;
  const p = pick(rng, s.players);
  if (p === undefined) return;
  const hand = s.hands[p] ?? [];
  if (deal.pending !== null) {
    const stop = hand.find((c) => cardKind(c) === 'stop');
    if (stop !== undefined && rng.next() < 0.4) send(game, p, { type: 'PLAY_STOP', card: stop });
    return;
  }
  const roll = rng.next();
  if (roll < 0.4) {
    const card = hand.find((c) => cardKind(c) === 'travel');
    const space = cityV1.spaces[deal.space];
    const family = space && pick(rng, spaceFamilies(space));
    if (card !== undefined && family !== undefined) {
      const onTable = deal.offered.find((o) => cardFamily(o.card) === family);
      send(game, p, {
        type: 'PLAY_TRAVEL',
        card,
        target: { family, source: onTable && rng.next() < 0.5 ? onTable.card : 'investor' },
      });
    }
  } else if (roll < 0.6) {
    const card = hand.find((c) => cardKind(c) === 'takeover');
    if (card !== undefined) send(game, p, { type: 'PLAY_TAKEOVER', card });
  } else {
    const cards = hand.filter((c) => cardKind(c) === 'recruit').slice(0, 3);
    const family = pick(rng, FAMILIES);
    if (cards.length === 3 && family !== undefined) {
      send(game, p, { type: 'PLAY_RECRUIT', cards, family });
    }
  }
}

function checkInvariants(game: Game): void {
  const s = game.state;
  const cards = [
    ...s.deck,
    ...s.discard,
    ...Object.values(s.hands).flat(),
    ...(s.deal?.offered.map((o) => o.card) ?? []),
    ...(s.deal?.pending?.cards ?? []),
    ...(s.pending?.cards ?? []),
  ];
  if (s.phase !== 'ended') expect(cards.sort()).toEqual(DECK);
  for (const hand of Object.values(s.hands)) expect(hand.length).toBeLessThanOrEqual(12 + 6);
  const earned = Object.values(s.money).reduce((a, b) => a + b, 0);
  // ไม่รู้ลำดับราคาตอนปิดแต่ละช่องจาก state จึงตรวจแค่ขอบบน/ล่าง
  expect(earned).toBeGreaterThanOrEqual(0);
  for (const m of Object.values(s.money)) expect(m).toBeGreaterThanOrEqual(0);
}

function playDeal(game: Game, rng: Rng): void {
  let proposals = 0;
  while (game.state.phase === 'deal' && game.step++ < MAX_STEPS) {
    const deal = game.state.deal;
    if (deal === null) return;
    checkInvariants(game);
    if (rng.next() < 0.15) randomInfluence(game, rng);
    const now = game.state.deal;
    if (now === null || game.state.phase !== 'deal') return;

    if (now.pending !== null) {
      randomInfluence(game, rng);
      if (game.state.deal?.pending) wait(game);
      continue;
    }
    if (now.plan === null) {
      const plan = proposals < 4 ? buildPlan(game, rng) : null;
      proposals++;
      if (plan === null) {
        must(game, now.boss, { type: 'ABANDON' });
        return;
      }
      if (!send(game, now.boss, { type: 'PROPOSE', plan })) {
        must(game, now.boss, { type: 'ABANDON' });
        return;
      }
      continue;
    }
    const table = { investors: game.state.investors, offered: now.offered, away: now.away };
    const members = [
      ...new Set(
        now.plan.slots.map((s) => slotOwner(table, s.family, s.source)).filter((p) => p !== null),
      ),
    ].filter((p) => p !== now.boss);
    const waiting = members.find((p) => now.responses[p] === undefined);
    if (waiting !== undefined) {
      must(game, waiting, { type: 'RESPOND', agree: rng.next() < 0.85 });
      continue;
    }
    if (now.closeAt === null) {
      // มีคนไม่ตกลง บอสเสนอใหม่
      if (proposals >= 4) {
        must(game, now.boss, { type: 'ABANDON' });
        return;
      }
      const plan = buildPlan(game, rng);
      proposals++;
      if (plan === null || !send(game, now.boss, { type: 'PROPOSE', plan })) {
        must(game, now.boss, { type: 'ABANDON' });
        return;
      }
      continue;
    }
    wait(game);
  }
}

function simulate(n: number, seed: number, options?: unknown): Game {
  const rng = createRng(seed);
  const players = Array.from({ length: n }, (_, i) => `p${i}`);
  const res = startGame(boss, players, options, createRng(seed + 1), T0);
  if (!res.ok) throw new Error(res.error);
  const game: Game = { state: res.value, now: T0, step: 0, turns: 0 };

  while (game.state.phase !== 'ended' && game.step++ < MAX_STEPS) {
    checkInvariants(game);
    const s = game.state;
    game.now += 1_000;
    if (s.phase === 'turn') {
      game.turns++;
      if (feasible(s, s.marker) && rng.next() < 0.5) must(game, s.current, { type: 'DECLARE' });
      else must(game, s.current, { type: 'ROLL' });
    } else if (s.phase === 'moved') {
      if (feasible(s, s.marker) && rng.next() < 0.8) must(game, s.current, { type: 'DECLARE' });
      else must(game, s.current, { type: 'DRAW' });
    } else if (s.phase === 'discard') {
      const hand = rng.shuffle(s.hands[s.current] ?? []);
      must(game, s.current, { type: 'DISCARD', cards: hand.slice(0, hand.length - 12) });
    } else if (s.phase === 'deal') {
      playDeal(game, rng);
    }
  }
  return game;
}

/** เงินรวมต้องเท่ากับผลรวมเงินจากดีลที่ปิด (ราคาหุ้นตามลำดับที่ปิด) */
function expectedMoney(state: BossState): number {
  return state.closed.reduce(
    (sum, space, i) => sum + (cityV1.dealValues[i] ?? 0) * (cityV1.spaces[space]?.shares ?? 0),
    0,
  );
}

describe('จำลองเกมบนกระดานจริง', () => {
  const runs = [3, 4, 5, 6].flatMap((n) =>
    Array.from({ length: 60 }, (_, i) => ({ n, seed: n * 1000 + i })),
  );
  const games = runs.map(({ n, seed }) => ({ n, game: simulate(n, seed) }));

  it('ทุกเกมจบได้ด้วยดีลที่ 10–15 และเงินรวมถูกต้อง', () => {
    for (const { n, game } of games) {
      const s = game.state;
      expect(s.phase, `${n} คน`).toBe('ended');
      expect(['last-deal', 'end-roll']).toContain(s.result?.reason);
      expect(s.dealsDone).toBeGreaterThanOrEqual(10);
      expect(s.dealsDone).toBeLessThanOrEqual(15);
      const total = Object.values(s.money).reduce((a, b) => a + b, 0);
      expect(total).toBe(expectedMoney(s));
      expect(s.result?.winners.length).toBeGreaterThan(0);
    }
  });

  it('ทุกช่องบนกระดานปิดดีลได้จริง', () => {
    const closed = new Set(games.flatMap(({ game }) => game.state.closed));
    expect([...closed].sort((a, b) => a - b)).toEqual(cityV1.spaces.map((_, i) => i));
  });

  it('ความยาวเกม: เฉลี่ย 11–13 ดีล และเทิร์นไม่ยืดเกินไป', () => {
    const deals = games.map(({ game }) => game.state.dealsDone);
    const avgDeals = deals.reduce((a, b) => a + b, 0) / deals.length;
    expect(avgDeals).toBeGreaterThan(11);
    expect(avgDeals).toBeLessThan(13);
    const turns = games.map(({ game }) => game.turns);
    const avgTurns = turns.reduce((a, b) => a + b, 0) / turns.length;
    // ผู้เล่นสุ่มเล่นแย่กว่าคนจริง เพดานนี้จึงหลวม ไว้จับกติกาที่ทำให้เกมยืดผิดปกติ
    expect(avgTurns).toBeLessThan(60);
  });

  it('เกมสั้นจบด้วยดีลที่ 5–10', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = simulate(4, 9000 + seed, { negotiationMs: null, length: 'short' }).state;
      expect(s.phase).toBe('ended');
      expect(s.dealsDone).toBeGreaterThanOrEqual(5);
      expect(s.dealsDone).toBeLessThanOrEqual(10);
    }
  });
});
