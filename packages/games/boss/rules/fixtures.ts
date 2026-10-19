import { createRng, dispatchAction, fireDeadline, startGame } from '@batonboard/engine';
import type { PlayerId } from '@batonboard/engine';
import { BOARD_SIZE, FAMILIES } from './constants';
import { createBoss } from './game';
import type { BossAction, BossState, Family, Plan, SpaceDef } from './types';

const family = (i: number) => FAMILIES[i % FAMILIES.length] as Family;

/**
 * กระดานสำหรับเทสต์: ช่อง i ต้องมีตระกูล i และเลือกอีก 1 จาก 2 ตระกูลถัดไป
 * ยกเว้นช่องเลขคี่ที่ไม่มีตัวเลือก (ต้องมีตระกูล i กับ i+1)
 */
export const testSpaces: SpaceDef[] = Array.from({ length: BOARD_SIZE }, (_, i) => ({
  id: `space-${i}`,
  shares: (i % 4) + 2,
  required: i % 2 === 0 ? [family(i)] : [family(i), family(i + 1)],
  optional: i % 2 === 0 ? { from: [family(i + 1), family(i + 2)], count: 1 } : null,
}));

export const testValues = Array.from({ length: 15 }, (_, i) => (i + 1) * 10);
export const testEndFaces = [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5]];

export const boss = createBoss({
  boardId: 'test-board',
  spaces: testSpaces,
  dealValues: testValues,
  endFaces: testEndFaces,
});

export const T0 = 1_700_000_000_000;
export const HOST = 'p-ann';
export const PLAYER_POOL = ['p-ann', 'p-bob', 'p-cat', 'p-dan', 'p-eve', 'p-fay'];

export function players(n: number): PlayerId[] {
  return PLAYER_POOL.slice(0, n);
}

export function start(n = 4, seed = 1, options?: unknown): BossState {
  const res = startGame(boss, players(n), options, createRng(seed), T0);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

/** ส่ง action ผ่าน pipeline จริง (schema → validate → apply) และ throw ถ้าถูกปฏิเสธ */
export function act(
  state: BossState,
  by: PlayerId,
  action: BossAction,
  now = T0,
  seed = 1,
): BossState {
  const res = dispatchAction(boss, state, action, by, { hostId: HOST }, now, createRng(seed));
  if (!res.ok) throw new Error(`${by} ${action.type}: ${res.error}`);
  return res.value;
}

/** ส่ง action แล้วคืนรหัส error (หรือ null ถ้าผ่าน) */
export function tryAct(state: BossState, by: PlayerId, action: unknown, now = T0): string | null {
  const res = dispatchAction(boss, state, action, by, { hostId: HOST }, now, createRng(1));
  return res.ok ? null : res.error;
}

/** ปลุกเกมที่ deadline ถัดไป */
export function fire(state: BossState): BossState {
  const deadline = boss.nextDeadline?.(state);
  if (deadline == null) throw new Error('no deadline');
  return fireDeadline(boss, state, deadline);
}

/** ให้ทุกตระกูลมีเจ้าของ: ตระกูล i เป็นของผู้เล่น i % n (เทสต์จะได้รู้ว่าใครถืออะไร) */
export function owned(state: BossState): BossState {
  const investors = Object.fromEntries(
    FAMILIES.map((f, i) => [f, state.players[i % state.players.length] as PlayerId]),
  ) as Record<Family, PlayerId>;
  return { ...state, investors };
}

/** แผนที่ใช้นักลงทุนถาวรทั้งหมด (ตัวเลือกใช้ตระกูลแรก) */
export function investorPlan(space: number, shares: Plan['shares'] = {}): Plan {
  const def = testSpaces[space] as SpaceDef;
  const families = [...def.required, ...(def.optional ? def.optional.from.slice(0, 1) : [])];
  return { slots: families.map((f) => ({ family: f, source: 'investor' })), shares };
}

/** ประกาศดีลที่ช่องปัจจุบันโดยเจ้าของเทิร์น */
export function declared(state: BossState): BossState {
  return act(state, state.current, { type: 'DECLARE' });
}

export function allCards(state: BossState): string[] {
  return [
    ...state.deck,
    ...state.discard,
    ...Object.values(state.hands).flat(),
    ...(state.deal?.offered.map((o) => o.card) ?? []),
  ];
}
