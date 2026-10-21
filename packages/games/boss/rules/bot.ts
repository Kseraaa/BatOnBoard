/**
 * บอททดสอบ — เล่นจาก view ของตัวเองเท่านั้น (เห็นเท่าผู้เล่นคนหนึ่ง) ไม่ได้เล่นเก่ง
 * แค่ทำให้เกมเดินได้ครบทุกแบบ: ทอย ประกาศ วางไพ่ตระกูล เสนอ/ตอบแผน ลงไพ่อิทธิพลบ้าง
 * action ที่คืนยังผ่าน validate ของเกมเสมอ ถ้าผิดก็แค่ไม่มีผล
 */
import type { PlayerId, Rng } from '@batonboard/engine';
import { cardFamily, cardKind } from './cards';
import { FAMILIES, HAND_LIMIT, RECRUIT_SET } from './constants';
import { autoSlots, checkPlan, participants, sourcesOf, spaceFamilies } from './plan';
import type { Table } from './plan';
import type { BossAction, BossView, CardId, DealView, Family, Plan, SpaceDef } from './types';

/** โอกาสต่อครั้งที่บอทได้เล่น */
const STOP_CHANCE = 0.35;
const INFLUENCE_CHANCE = 0.08;
const REFUSE_CHANCE = 0.1;
/** บอสที่ดีลไม่ครบรอคนวางไพ่ตระกูลก่อน แล้วค่อยยอมแพ้ */
const GIVE_UP_CHANCE = 0.1;
/** ไม่ตกลง = บอสเพิ่มส่วนแบ่งให้คนนั้นอีกเท่านี้ของมูลค่าดีล */
const RAISE = 0.1;

const pick = <T>(items: readonly T[], rng: Rng): T | undefined =>
  items.length === 0 ? undefined : items[rng.int(items.length)];

export function createBossBot(spaces: readonly SpaceDef[]) {
  return function bot(view: BossView, rng: Rng): BossAction | null {
    const me = view.me;
    if (!view.players.includes(me)) return null;
    const myTurn = view.current === me;

    switch (view.phase) {
      case 'turn':
        return myTurn ? { type: 'ROLL' } : null;
      case 'moved': {
        if (!myTurn) return null;
        const space = spaces[view.marker];
        const open = !view.closed.includes(view.marker);
        return open && space && reachable(view, space) ? { type: 'DECLARE' } : { type: 'DRAW' };
      }
      case 'discard': {
        if (!myTurn) return null;
        const extra = view.hand.length - HAND_LIMIT;
        return { type: 'DISCARD', cards: rng.shuffle(view.hand).slice(0, extra) };
      }
      case 'deal': {
        const deal = view.deal;
        const space = deal && spaces[deal.space];
        return deal && space ? inDeal(view, deal, space, rng) : null;
      }
      default:
        return null;
    }
  };
}

/** ตระกูลที่ช่องนี้ต้องใช้มีนักลงทุนหรือไพ่ตระกูลบนมือครบ (ประกาศแล้วน่าจะปิดได้) */
function reachable(view: BossView, space: SpaceDef): boolean {
  const has = (f: Family) => view.investors[f] !== null || view.hand.some((c) => isClanOf(c, f));
  if (!space.required.every(has)) return false;
  const optional = space.optional;
  return optional === null || optional.from.filter(has).length >= optional.count;
}

const isClanOf = (card: CardId, family: Family) =>
  cardKind(card) === 'clan' && cardFamily(card) === family;

function inDeal(view: BossView, deal: DealView, space: SpaceDef, rng: Rng): BossAction | null {
  const me = view.me;
  const table: Table = { investors: view.investors, offered: deal.offered, away: deal.away };

  if (deal.pending !== null) {
    // ระหว่างรอผลเสนอ/ตอบแผนไม่ได้ — เบรกไพ่ของคนอื่นได้อย่างเดียว
    const stop = view.hand.find((c) => cardKind(c) === 'stop');
    if (deal.pending.by === me || stop === undefined || rng.next() >= STOP_CHANCE) return null;
    return { type: 'PLAY_STOP', card: stop };
  }

  const offer = missingClan(view, table, space);
  if (offer !== undefined) return { type: 'OFFER_CLAN', card: offer };

  if (rng.next() < INFLUENCE_CHANCE) {
    const play = influence(view, deal, table, space, rng);
    if (play !== null) return play;
  }

  if (deal.boss === me) return asBoss(view, deal, table, space, rng);

  const plan = deal.plan;
  if (plan === null || deal.responses[me] !== undefined) return null;
  if (!participants(table, plan).includes(me)) return null;
  return { type: 'RESPOND', agree: rng.next() >= REFUSE_CHANCE };
}

/** ไพ่ตระกูลบนมือของตระกูลที่ดีลยังขาด */
function missingClan(view: BossView, table: Table, space: SpaceDef): CardId | undefined {
  const lacking = (f: Family) => sourcesOf(table, f).length === 0;
  const optional = space.optional;
  const optionalShort =
    optional !== null && optional.from.filter((f) => !lacking(f)).length < optional.count;
  const wanted = spaceFamilies(space).filter(
    (f) => lacking(f) && (space.required.includes(f) || optionalShort),
  );
  return view.hand.find((c) => wanted.some((f) => isClanOf(c, f)));
}

function asBoss(
  view: BossView,
  deal: DealView,
  table: Table,
  space: SpaceDef,
  rng: Rng,
): BossAction | null {
  const me = view.me;
  const current = deal.plan;
  if (current === null) {
    const slots = autoSlots(space, table);
    const members = participants(table, { slots, shares: {} }).filter((p) => p !== me);
    const share = Math.floor(deal.payout / (members.length + 1));
    const plan: Plan = { slots, shares: Object.fromEntries(members.map((p) => [p, share])) };
    if (checkPlan(space, table, plan, me, deal.payout) === null) return { type: 'PROPOSE', plan };
    return rng.next() < GIVE_UP_CHANCE ? { type: 'ABANDON' } : null;
  }

  const refused = Object.keys(deal.responses).filter((p) => deal.responses[p] === false);
  if (refused.length === 0) return null;
  // คนที่ไม่ตกลงได้เพิ่ม ถ้าเพิ่มจนเกินมูลค่าดีลก็ยอมแพ้
  const raise = Math.max(1, Math.ceil(deal.payout * RAISE));
  const shares: Record<PlayerId, number> = { ...current.shares };
  for (const p of refused) shares[p] = (shares[p] ?? 0) + raise;
  const plan: Plan = { slots: current.slots, shares };
  return checkPlan(space, table, plan, me, deal.payout) === null
    ? { type: 'PROPOSE', plan }
    : { type: 'ABANDON' };
}

/** ไพ่อิทธิพลที่ลงได้ตอนนี้ สุ่มมา 1 แบบ */
function influence(
  view: BossView,
  deal: DealView,
  table: Table,
  space: SpaceDef,
  rng: Rng,
): BossAction | null {
  const me = view.me;
  const of = (kind: string) => view.hand.filter((c) => cardKind(c) === kind);
  const plays: BossAction[] = [];

  const takeover = of('takeover')[0];
  if (takeover !== undefined && deal.boss !== me)
    plays.push({ type: 'PLAY_TAKEOVER', card: takeover });

  const recruits = of('recruit');
  if (recruits.length >= RECRUIT_SET) {
    const pool = FAMILIES.filter((f) => view.investors[f] === null);
    const family = pick(
      pool.length > 0 ? pool : FAMILIES.filter((f) => view.investors[f] !== me),
      rng,
    );
    if (family !== undefined) {
      plays.push({ type: 'PLAY_RECRUIT', cards: recruits.slice(0, RECRUIT_SET), family });
    }
  }

  // ส่งตระกูลของคนอื่นไปเที่ยว (ไม่ส่งของตัวเอง)
  for (const card of of('travel')) {
    const only = cardFamily(card);
    const targets = spaceFamilies(space)
      .filter((f) => only === null || f === only)
      .flatMap((family) =>
        sourcesOf(table, family)
          .filter((s) => s.owner !== me)
          .map((s) => ({ family, source: s.source })),
      );
    const target = pick(targets, rng);
    if (target !== undefined) plays.push({ type: 'PLAY_TRAVEL', card, target });
  }

  return pick(plays, rng) ?? null;
}
