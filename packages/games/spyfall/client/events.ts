/**
 * เหตุการณ์ที่เกิดขึ้นระหว่าง view สองครั้งติดกัน (ใช้เล่นเสียง/สั่น) — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 * view แรกหลังเปิดหน้า (prev = null) ไม่นับ จะได้ไม่ดังตอนรีเฟรช
 */
import type { Cue } from '@batonboard/ui';
import type { SpyfallView } from '../rules/types';

export type GameEvent =
  'won' | 'lost' | 'round-start' | 'vote-open' | 'revote' | 'spy-guess' | 'vote-closed';

export const EVENT_CUE: Record<GameEvent, Cue> = {
  won: 'win',
  lost: 'lose',
  'round-start': 'turn',
  'vote-open': 'alert',
  revote: 'alert',
  'spy-guess': 'turn',
  'vote-closed': 'tap',
};

/** เหตุการณ์ที่ควรรอให้ฉากเฉลยเปิดผลก่อน (ไม่งั้นเสียงบอกผลก่อนไพ่พลิก) */
export const RESULT_EVENTS: readonly GameEvent[] = ['won', 'lost'];

export function eventsBetween(prev: SpyfallView | null, next: SpyfallView): GameEvent[] {
  if (prev === null) return [];
  const me = next.me;
  const playing = next.players.includes(me);

  if (next.phase === 'reveal') {
    if (prev.phase === 'reveal' || next.result === null || !playing) return [];
    return [next.result.winners.includes(me) ? 'won' : 'lost'];
  }
  if (next.phase === 'questioning') {
    return prev.phase !== 'questioning' || prev.round !== next.round ? ['round-start'] : [];
  }
  if (next.phase === 'voting') {
    if (prev.phase !== 'voting') return ['vote-open'];
    return (next.vote?.round ?? 0) > (prev.vote?.round ?? 0) ? ['revote'] : [];
  }
  // guessing
  if (prev.phase === 'guessing') return [];
  return [next.you.role === 'spy' ? 'spy-guess' : 'vote-closed'];
}
