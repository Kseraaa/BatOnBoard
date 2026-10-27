/**
 * บอททดสอบ — เล่นจาก view ของตัวเองเท่านั้น ไม่ได้เล่นเก่ง แค่ทำให้เกมเดินได้ครบ:
 * ถึงตาอ่านก็กดอ่านจบ และโหวตแบบสุ่ม ช่วงคุยไม่ทำอะไร (ไม่เป็น host จึงไม่กดเริ่มโหวตหรือรอบใหม่)
 */
import type { Rng } from '@batonboard/engine';
import type { PoetsAction, PoetsView } from './types';

export function createPoetsBot() {
  return function bot(view: PoetsView, rng: Rng): PoetsAction | null {
    const me = view.me;
    if (!view.players.includes(me)) return null;

    switch (view.phase) {
      case 'reading':
        return view.order[view.readCount] === me ? { type: 'READ_DONE' } : null;
      case 'voting': {
        const vote = view.vote;
        if (vote === null || vote.voted.includes(me)) return null;
        const targets = vote.candidates.filter((c) => c !== me && view.players.includes(c));
        const target = targets[rng.int(targets.length)];
        return target === undefined ? null : { type: 'VOTE', target };
      }
      default:
        return null;
    }
  };
}
