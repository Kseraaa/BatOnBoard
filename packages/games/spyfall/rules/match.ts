import type { SpyfallState } from './types';

/** reveal ของรอบสุดท้ายในแมตช์ (ตั้งจำนวนรอบไว้และเล่นครบแล้ว) */
export function isMatchOver(state: Pick<SpyfallState, 'phase' | 'round' | 'rounds'>): boolean {
  const rounds = state.rounds ?? null;
  return state.phase === 'reveal' && rounds !== null && (state.round ?? 1) >= rounds;
}
