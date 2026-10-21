/**
 * ตรรกะของหน้าจอที่ไม่ใช่ React (เทสต์ได้) — ใช้แค่ view ที่ server ส่งมา
 * ตัดสินผลจริงที่ server เสมอ ฟังก์ชันพวกนี้แค่ตัดสินว่าจะแสดงปุ่มอะไร
 */
import type { PlayerId } from '@batonboard/engine';
import { cardFamily, cardKind } from '../rules/cards';
import { FAMILIES, HAND_LIMIT, RECRUIT_SET } from '../rules/constants';
import { autoSlots, checkPlan, participants, sourcesOf, spaceFamilies } from '../rules/plan';
import type { Table } from '../rules/plan';
import type {
  BossView,
  CardId,
  DealView,
  Family,
  PendingPlay,
  Plan,
  SlotSource,
  SpaceDef,
  TravelTarget,
} from '../rules/types';

export function tableOf(deal: DealView, view: BossView): Table {
  return { investors: view.investors, offered: deal.offered, away: deal.away };
}

const myTurn = (view: BossView) => view.current === view.me && view.players.includes(view.me);

export const canRoll = (view: BossView) => view.phase === 'turn' && myTurn(view);
export const canDeclare = (view: BossView) =>
  (view.phase === 'turn' || view.phase === 'moved') && myTurn(view);
export const canDraw = (view: BossView) => view.phase === 'moved' && myTurn(view);

/** ต้องทิ้งกี่ใบ (0 = ไม่ต้องทิ้ง) */
export function discardCount(view: BossView): number {
  return view.phase === 'discard' && myTurn(view) ? Math.max(0, view.hand.length - HAND_LIMIT) : 0;
}

export const isBoss = (view: BossView) => view.deal?.boss === view.me;

/** ใครใส่ตระกูลนี้ได้บ้าง: นักลงทุน (ถ้าไม่ไปเที่ยว) และไพ่ตระกูลบนโต๊ะ */
export function sourcesFor(
  view: BossView,
  family: Family,
): { source: SlotSource; owner: PlayerId }[] {
  return view.deal === null ? [] : sourcesOf(tableOf(view.deal, view), family);
}

/** แผนเริ่มต้นให้บอส: เลือกแหล่งแรกที่มีของทุกตระกูล ตัวเลือกใช้ตระกูลที่มีคนถือก่อน */
export function autoPlan(view: BossView, space: SpaceDef): Plan['slots'] {
  return view.deal === null ? [] : autoSlots(space, tableOf(view.deal, view));
}

/** ผู้ร่วมดีลตามแผน ไม่รวมบอส */
export function planMembers(view: BossView, slots: Plan['slots']): PlayerId[] {
  const deal = view.deal;
  if (deal === null) return [];
  return participants(tableOf(deal, view), { slots, shares: {} }).filter((p) => p !== deal.boss);
}

export function planError(view: BossView, space: SpaceDef, plan: Plan): string | null {
  const deal = view.deal;
  if (deal === null) return null;
  return checkPlan(space, tableOf(deal, view), plan, deal.boss, budget(view, deal));
}

/** บอสจ่ายส่วนแบ่งได้ถึงเงินดีล + เงินในกระเป๋าบอส */
export function budget(view: BossView, deal: DealView): number {
  return deal.payout + (view.money[deal.boss] ?? 0);
}

/** ไพ่ที่รอผลตอนนี้ (ในดีล หรือซื้อตัวตอนไพ่เกินมือ) */
export function pendingPlay(view: BossView): PendingPlay | null {
  return view.deal?.pending ?? view.pending ?? null;
}

/** ไพ่เกิน 12 ใบ: ลงชุดซื้อตัวแทนการทิ้งได้ไหม */
export function canRecruitInstead(view: BossView): boolean {
  return (
    discardCount(view) > 0 && pendingPlay(view) === null && recruitCards(view).length >= RECRUIT_SET
  );
}

export function bossKeeps(deal: DealView, plan: Plan): number {
  return deal.payout - Object.values(plan.shares).reduce((sum, v) => sum + v, 0);
}

export function canRespond(view: BossView): boolean {
  const deal = view.deal;
  if (deal === null || deal.plan === null || deal.pending !== null) return false;
  return planMembers(view, deal.plan.slots).includes(view.me);
}

/** เป้าที่ไพ่ไปเที่ยวใบนี้ส่งไปได้ */
export function travelTargets(view: BossView, space: SpaceDef, card: CardId): TravelTarget[] {
  const deal = view.deal;
  if (deal === null) return [];
  const only = cardFamily(card);
  return spaceFamilies(space)
    .filter((f) => only === null || f === only)
    .flatMap((family) => [
      ...(view.investors[family] !== null && !deal.away.includes(family)
        ? [{ family, source: 'investor' as const }]
        : []),
      ...deal.offered
        .filter((o) => cardFamily(o.card) === family)
        .map((o) => ({ family, source: o.card })),
    ]);
}

/** ตระกูลที่ซื้อตัวได้ตอนนี้: มีในกองกลางต้องซื้อจากกองกลาง ไม่งั้นของคนอื่น */
export function recruitFamilies(view: BossView): Family[] {
  const pool = FAMILIES.filter((f) => view.investors[f] === null);
  if (pool.length > 0) return pool;
  return FAMILIES.filter((f) => view.investors[f] !== view.me);
}

/** ลำดับชนิดไพ่ที่ใช้แสดงคำอธิบาย */
export const CARD_KINDS = ['clan', 'travel', 'takeover', 'recruit', 'stop'] as const;

export type CardUse = 'offer' | 'travel' | 'takeover' | 'recruit' | 'stop';

/** ไพ่ใบนี้ใช้ทำอะไรได้ตอนนี้ (null = ยังใช้ไม่ได้) */
export function cardUse(view: BossView, space: SpaceDef | null, card: CardId): CardUse | null {
  const deal = view.deal;
  if (view.phase !== 'deal' || deal === null || space === null) return null;
  if (!view.players.includes(view.me)) return null;
  const pending = deal.pending !== null;
  switch (cardKind(card)) {
    case 'clan': {
      const family = cardFamily(card);
      return family !== null && spaceFamilies(space).includes(family) ? 'offer' : null;
    }
    case 'travel':
      return !pending && travelTargets(view, space, card).length > 0 ? 'travel' : null;
    case 'takeover':
      return !pending && deal.boss !== view.me ? 'takeover' : null;
    case 'recruit':
      return !pending && recruitCards(view).length >= RECRUIT_SET ? 'recruit' : null;
    case 'stop':
      return pending ? 'stop' : null;
    default:
      return null;
  }
}

export function recruitCards(view: BossView): CardId[] {
  return view.hand.filter((c) => cardKind(c) === 'recruit');
}

/** เรียงไพ่บนมือ: ตระกูลก่อน แล้วตามชนิด */
export function sortHand(hand: CardId[]): CardId[] {
  const order = ['clan', 'travel', 'takeover', 'stop', 'recruit'];
  return [...hand].sort((a, b) => {
    const k = order.indexOf(cardKind(a) ?? '') - order.indexOf(cardKind(b) ?? '');
    return k !== 0 ? k : a.localeCompare(b, 'en', { numeric: true });
  });
}

/** อันดับตามเงิน (มากไปน้อย) */
export function ranking(view: BossView): PlayerId[] {
  return [...view.players].sort((a, b) => (view.money[b] ?? 0) - (view.money[a] ?? 0));
}

/** เงินในกติกา (หน่วย) → พันบาท (k) มีจุลภาคคั่นหลักพัน ทศนิยมไม่เกิน 1 ตำแหน่ง */
export function kilos(units: number, moneyUnit: number): string {
  const k = (units * moneyUnit) / 1_000;
  return k.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/**
 * ตำแหน่งช่องบนขอบตาราง 5×5 (ขอบมีพอดี 16 ช่อง) เดินตามเข็มนาฬิกาจากมุมซ้ายบน
 * กลางตาราง 3×3 เป็นข้อมูลรวม: ราคาหุ้น ลูกเต๋า และกองไพ่
 */
export function ringCell(i: number): { row: number; col: number } {
  if (i < 5) return { row: 1, col: i + 1 };
  if (i < 9) return { row: i - 3, col: 5 };
  if (i < 13) return { row: 5, col: 13 - i };
  return { row: 17 - i, col: 1 };
}
