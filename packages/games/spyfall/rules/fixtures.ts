import { createRng, dispatchAction, fireDeadline, startGame } from '@batonboard/engine';
import type { PlayerId } from '@batonboard/engine';
import { createSpyfall } from './game';
import type { LocationDef, SpyfallAction, SpyfallState } from './types';

/** ชุดสถานที่สำหรับเทสต์ — id ต้องไม่ซ้อนกันเพื่อให้ตรวจข้อมูลรั่วด้วยการค้นข้อความได้ */
export const testLocations: LocationDef[] = ['zeppelin', 'lighthouse', 'aquarium', 'bakery'].map(
  (place) => ({
    id: `loc-${place}`,
    roles: Array.from({ length: 7 }, (_, i) => `role-${place}-${i}`),
  }),
);

export const spyfall = createSpyfall({ locationSetId: 'test-set', locations: testLocations });

export const T0 = 1_700_000_000_000;
export const HOST = 'p-ann';
export const PLAYER_POOL = ['p-ann', 'p-bob', 'p-cat', 'p-dan', 'p-eve', 'p-fay', 'p-gus', 'p-hal'];

export function players(n: number): PlayerId[] {
  return PLAYER_POOL.slice(0, n);
}

export function start(n = 4, seed = 1, options?: unknown): SpyfallState {
  const res = startGame(spyfall, players(n), options, createRng(seed), T0);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

/** ส่ง action ผ่าน pipeline จริง (schema → validate → apply) และ throw ถ้าถูกปฏิเสธ */
export function act(
  state: SpyfallState,
  by: PlayerId,
  action: SpyfallAction,
  now = T0,
  seed = 1,
): SpyfallState {
  const res = dispatchAction(spyfall, state, action, by, { hostId: HOST }, now, createRng(seed));
  if (!res.ok) throw new Error(`${by} ${action.type}: ${res.error}`);
  return res.value;
}

/** ส่ง action แล้วคืนรหัส error (หรือ null ถ้าผ่าน) */
export function tryAct(
  state: SpyfallState,
  by: PlayerId,
  action: unknown,
  now = T0,
  hostId = HOST,
): string | null {
  const res = dispatchAction(spyfall, state, action, by, { hostId }, now, createRng(1));
  return res.ok ? null : res.error;
}

export function agents(state: SpyfallState): PlayerId[] {
  return state.players.filter((p) => p !== state.spy);
}

export function timeUp(state: SpyfallState): SpyfallState {
  const deadline = spyfall.nextDeadline?.(state);
  if (deadline == null) throw new Error('no deadline');
  return fireDeadline(spyfall, state, deadline);
}
