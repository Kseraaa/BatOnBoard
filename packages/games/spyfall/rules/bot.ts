/**
 * บอททดสอบ — เล่นจาก view ของตัวเองเท่านั้น (เห็นเท่าผู้เล่นคนหนึ่ง) ไม่ได้เล่นเก่ง
 * แค่ทำให้เกมเดินได้ครบ: โหวตแบบสุ่ม และถ้าเป็นสายลับก็ทายสถานที่แบบสุ่ม
 * ช่วงถามตอบไม่ทำอะไร (คุยกันนอกระบบ) และไม่เคยเป็น host จึงไม่กดเริ่มโหวตหรือรอบใหม่
 */
import type { Rng } from '@batonboard/engine';
import { MAX_CUSTOM_LOCATIONS } from './constants';
import type { LocationDef, SpyfallAction, SpyfallView } from './types';

const pick = <T>(items: readonly T[], rng: Rng): T | undefined =>
  items.length === 0 ? undefined : items[rng.int(items.length)];

export function createSpyfallBot(builtin: readonly LocationDef[]) {
  // view ไม่มีรายชื่อสถานที่ของห้อง (กันรั่ว) บอทจึงเดาจากชุดมาตรฐาน + id ที่สร้างเองที่เป็นไปได้
  // ถ้าเดา id ที่ห้องปิดไว้ validate จะปฏิเสธ แล้วห้องให้ลองใหม่ด้วย rng ใหม่ใน tick ถัดไป
  const guesses = [
    ...builtin.map((l) => l.id),
    ...Array.from({ length: MAX_CUSTOM_LOCATIONS }, (_, i) => `custom-${i + 1}`),
  ];

  return function bot(view: SpyfallView, rng: Rng): SpyfallAction | null {
    const me = view.me;
    if (!view.players.includes(me)) return null;

    switch (view.phase) {
      case 'voting': {
        const vote = view.vote;
        if (vote === null || vote.voted.includes(me)) return null;
        const target = pick(
          vote.candidates.filter((c) => c !== me && view.players.includes(c)),
          rng,
        );
        return target === undefined ? null : { type: 'VOTE', target };
      }
      case 'guessing': {
        if (view.you.role !== 'spy') return null;
        const locationId = pick(guesses, rng);
        return locationId === undefined ? null : { type: 'SPY_GUESS', locationId };
      }
      default:
        return null;
    }
  };
}
