import type { PoetsState } from './types';

/** reveal ของรอบสุดท้ายในแมตช์ (ตั้งจำนวนรอบไว้และเล่นครบแล้ว) */
export function isMatchOver(state: Pick<PoetsState, 'phase' | 'round' | 'rounds'>): boolean {
  return state.phase === 'reveal' && state.rounds !== null && state.round >= state.rounds;
}
