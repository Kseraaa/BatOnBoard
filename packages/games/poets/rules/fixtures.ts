import { createRng, dispatchAction, fireDeadline, startGame } from '@batonboard/engine';
import type { PlayerId } from '@batonboard/engine';
import { createPoets } from './game';
import type { FigureDef, PoetsAction, PoetsState } from './types';

/** ชุดโวหารสำหรับเทสต์ — id และข้อความไม่ซ้อนกัน เพื่อตรวจข้อมูลรั่วด้วยการค้นข้อความได้ */
export const testFigures: FigureDef[] = ['alpha', 'beta', 'gamma', 'delta'].map((name) => ({
  id: `fig-${name}`,
  sentences: Array.from({ length: 5 }, (_, i) => ({
    id: `line-${name}-${i}`,
    text: `text of ${name} number ${i}`,
  })),
}));

export const poets = createPoets({ setId: 'test-set', figures: testFigures });

export const T0 = 1_700_000_000_000;
export const HOST = 'p-ann';
export const PLAYER_POOL = ['p-ann', 'p-bob', 'p-cat', 'p-dan', 'p-eve', 'p-fay'];

export function players(n: number): PlayerId[] {
  return PLAYER_POOL.slice(0, n);
}

export function start(n = 4, seed = 1, options?: unknown): PoetsState {
  const res = startGame(poets, players(n), options, createRng(seed), T0);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

/** ส่ง action ผ่าน pipeline จริง (schema → validate → apply) และ throw ถ้าถูกปฏิเสธ */
export function act(
  state: PoetsState,
  by: PlayerId,
  action: PoetsAction,
  now = T0,
  seed = 1,
): PoetsState {
  const res = dispatchAction(poets, state, action, by, { hostId: HOST }, now, createRng(seed));
  if (!res.ok) throw new Error(`${by} ${action.type}: ${res.error}`);
  return res.value;
}

export function tryAct(state: PoetsState, by: PlayerId, action: unknown, hostId = HOST) {
  const res = dispatchAction(poets, state, action, by, { hostId }, T0, createRng(1));
  return res.ok ? null : res.error;
}

export function villagers(state: PoetsState): PlayerId[] {
  return state.players.filter((p) => p !== state.spy);
}

export function timeUp(state: PoetsState): PoetsState {
  const deadline = poets.nextDeadline?.(state);
  if (deadline == null) throw new Error('no deadline');
  return fireDeadline(poets, state, deadline);
}

/** ทุกคนอ่านตามลำดับ → ช่วงคุย */
export function readAll(state: PoetsState): PoetsState {
  let s = state;
  while (s.phase === 'reading') s = act(s, s.order[s.readCount] as PlayerId, { type: 'READ_DONE' });
  return s;
}

/** ทุกคนที่ยังไม่โหวตโหวตตาม pick (หยุดเมื่อรอบปิด) */
export function voteAll(state: PoetsState, pick: (voter: PlayerId) => PlayerId): PoetsState {
  let s = state;
  for (const p of state.players) {
    if (s.phase !== 'voting' || s.voting === null || p in s.voting.ballots) continue;
    s = act(s, p, { type: 'VOTE', target: pick(p) });
  }
  return s;
}

/** อ่านครบ → host เริ่มโหวต → ทุกคนเลือก target (target เองเลือกคนอื่น) */
export function voteOut(state: PoetsState, target: PlayerId): PoetsState {
  const voting = act(readAll(state), HOST, { type: 'START_VOTE' });
  const other = state.players.find((p) => p !== target) as PlayerId;
  return voteAll(voting, (p) => (p === target ? other : target));
}
