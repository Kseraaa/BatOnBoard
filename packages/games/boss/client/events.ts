/**
 * เหตุการณ์ที่เกิดขึ้นระหว่าง view สองครั้งติดกัน (ใช้เล่นเสียง/สั่น) — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 * view แรกหลังเปิดหน้า (prev = null) ไม่นับเป็นเหตุการณ์ จะได้ไม่ดังตอนรีเฟรช
 */
import type { Cue } from '@batonboard/ui';
import type { BossView } from '../rules/types';
import { pendingPlay } from './logic';

export type GameEvent =
  | 'won'
  | 'lost'
  | 'pending'
  | 'stopped'
  | 'paid'
  | 'deal-closed'
  | 'deal-broken'
  | 'roll'
  | 'my-turn';

/** เรียงตามความสำคัญ — เล่นเสียงแค่เหตุการณ์แรก ๆ ไม่ให้ซ้อนกันจนฟังไม่รู้เรื่อง */
const ORDER: GameEvent[] = [
  'won',
  'lost',
  'pending',
  'stopped',
  'paid',
  'deal-closed',
  'deal-broken',
  'roll',
  'my-turn',
];

export const EVENT_CUE: Record<GameEvent, Cue> = {
  won: 'win',
  lost: 'lose',
  pending: 'alert',
  stopped: 'alert',
  paid: 'coins',
  'deal-closed': 'coins',
  'deal-broken': 'lose',
  roll: 'dice',
  'my-turn': 'turn',
};

export function eventsBetween(prev: BossView | null, next: BossView): GameEvent[] {
  if (prev === null) return [];
  const events = new Set<GameEvent>();
  const me = next.me;

  if (prev.phase !== 'ended' && next.phase === 'ended' && next.result) {
    events.add(next.result.winners.includes(me) ? 'won' : 'lost');
  }
  if ((next.lastRoll?.seq ?? 0) > (prev.lastRoll?.seq ?? 0)) events.add('roll');

  const deal = next.lastDeal;
  if (deal !== null && JSON.stringify(deal) !== JSON.stringify(prev.lastDeal)) {
    if (deal.kind === 'closed') {
      events.add((deal.paid[me] ?? 0) > 0 ? 'paid' : 'deal-closed');
    } else {
      events.add('deal-broken');
    }
  }

  if (pendingPlay(prev) === null && pendingPlay(next) !== null) events.add('pending');
  const play = next.lastPlay;
  if (play !== null && play.seq !== prev.lastPlay?.seq && play.outcome === 'stopped') {
    events.add('stopped');
  }

  const myTurnNow = next.phase === 'turn' && next.current === me;
  const myTurnBefore = prev.phase === 'turn' && prev.current === me;
  if (myTurnNow && !myTurnBefore) events.add('my-turn');

  return ORDER.filter((e) => events.has(e));
}
