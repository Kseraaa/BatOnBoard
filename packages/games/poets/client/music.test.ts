import { describe, expect, it } from 'vitest';
import type { PoetsView } from '../rules/types';
import { trackFor } from './music';

const view = (phase: PoetsView['phase'], winner?: 'village' | 'spy' | null) =>
  ({
    phase,
    result: winner === undefined ? null : { winner, winners: [], points: 1, reason: 'caught' },
  }) as PoetsView;

describe('เพลงประกอบแต่ละช่วง', () => {
  it('อ่านกลอน / คุย / เฉลยถูก / เฉลยผิด และเงียบช่วงเลือกหมู่บ้านกับโหวต', () => {
    expect(trackFor(view('reading'))).toBe('reading');
    expect(trackFor(view('discussion'))).toBe('discussion');
    expect(trackFor(view('reveal', 'village'))).toBe('correct');
    expect(trackFor(view('reveal', 'spy'))).toBe('wrong');
    expect(trackFor(view('reveal', null))).toBeNull();
    expect(trackFor(view('choosing'))).toBeNull();
    expect(trackFor(view('voting'))).toBeNull();
  });
});
