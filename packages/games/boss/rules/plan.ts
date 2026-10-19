/**
 * ตรวจแผนดีล — ไม่ import zod เพื่อให้ client ใช้แสดงว่าแผนครบหรือยังได้
 * (server ตรวจซ้ำใน validate เสมอ)
 */
import type { PlayerId } from '@batonboard/engine';
import { BossError } from './constants';
import type { BossErrorCode } from './constants';
import { cardFamily } from './cards';
import type { CardId, Family, Plan, SpaceDef } from './types';

export interface Table {
  investors: Record<Family, PlayerId | null>;
  offered: { card: CardId; by: PlayerId }[];
  /** ตระกูลที่นักลงทุนถาวรไปเที่ยว */
  away: Family[];
}

/** ตระกูลที่ช่องนี้ใช้ได้ (ต้องมี + ให้เลือก) */
export function spaceFamilies(space: SpaceDef): Family[] {
  return [...space.required, ...(space.optional?.from ?? [])];
}

/** เจ้าของตระกูลใน slot: คนถือนักลงทุน หรือคนวางไพ่ตระกูล (`null` = ใช้ไม่ได้) */
export function slotOwner(
  table: Table,
  family: Family,
  source: Plan['slots'][number]['source'],
): PlayerId | null {
  if (source === 'investor') return table.away.includes(family) ? null : table.investors[family];
  if (cardFamily(source) !== family) return null;
  return table.offered.find((o) => o.card === source)?.by ?? null;
}

/** ผู้ร่วมดีลตามแผน (ไม่ซ้ำ เรียงตามลำดับ slot) */
export function participants(table: Table, plan: Plan): PlayerId[] {
  const owners = plan.slots.map((s) => slotOwner(table, s.family, s.source));
  return [...new Set(owners.filter((o): o is PlayerId => o !== null))];
}

export function checkPlan(
  space: SpaceDef,
  table: Table,
  plan: Plan,
  boss: PlayerId,
  payout: number,
): BossErrorCode | null {
  const families = plan.slots.map((s) => s.family);
  if (new Set(families).size !== families.length) return BossError.InvalidPlan;
  if (space.required.some((f) => !families.includes(f))) return BossError.InvalidPlan;
  const extra = families.filter((f) => !space.required.includes(f));
  const optional = space.optional;
  if (optional === null ? extra.length > 0 : extra.length !== optional.count) {
    return BossError.InvalidPlan;
  }
  if (optional !== null && extra.some((f) => !optional.from.includes(f))) {
    return BossError.InvalidPlan;
  }
  if (plan.slots.some((s) => slotOwner(table, s.family, s.source) === null)) {
    return BossError.SourceUnavailable;
  }

  const members = participants(table, plan);
  const paid = Object.entries(plan.shares);
  if (paid.some(([p, amount]) => p === boss || !members.includes(p) || amount < 0)) {
    return BossError.InvalidPlan;
  }
  if (paid.reduce((sum, [, amount]) => sum + amount, 0) > payout) return BossError.SharesTooHigh;
  return null;
}
