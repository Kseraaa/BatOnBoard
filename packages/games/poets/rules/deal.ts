import type { PlayerId, Rng } from '@batonboard/engine';
import type { FigureDef, PoetsConfig, SentenceDef } from './types';

/** ประโยคพร้อมโวหารทั้งหมดที่เข้าได้ (ตัวแรกคือโวหารหลักที่อยู่ในชุด) */
export interface IndexedSentence extends SentenceDef {
  figures: string[];
}

export function indexSentences(figures: readonly FigureDef[]): Map<string, IndexedSentence> {
  return new Map(
    figures.flatMap((f) =>
      f.sentences.map((s) => [s.id, { ...s, figures: [f.id, ...(s.also ?? [])] }] as const),
    ),
  );
}

/** คู่โวหาร (หมู่บ้าน, สายลับ) ที่แจกได้ พร้อมประโยคที่ใช้ได้แต่ละฝั่ง */
export interface Pairing {
  figure: string;
  spyFigure: string;
  village: IndexedSentence[];
  spy: IndexedSentence[];
}

/**
 * คู่โวหารที่แจกให้ n คนได้: ประโยคหมู่บ้านต้องเป็นโวหารหมู่บ้านและไม่เข้ากับโวหารสายลับ
 * ส่วนประโยคสายลับต้องไม่เข้ากับโวหารหมู่บ้าน ไม่งั้นมีประโยคที่ตีความได้ทั้งสองฝั่ง
 */
export function pairings(
  figures: readonly FigureDef[],
  n: number,
  skip: ReadonlySet<string> = new Set(),
): Pairing[] {
  const all = [...indexSentences(figures).values()].filter((s) => !skip.has(s.id));
  const result: Pairing[] = [];
  for (const { id: figure } of figures) {
    for (const { id: spyFigure } of figures) {
      if (figure === spyFigure) continue;
      const village = all.filter(
        (s) => s.figures.includes(figure) && !s.figures.includes(spyFigure),
      );
      const spy = all.filter((s) => s.figures.includes(spyFigure) && !s.figures.includes(figure));
      if (village.length >= n - 1 && spy.length > 0) {
        result.push({ figure, spyFigure, village, spy });
      }
    }
  }
  return result;
}

export interface Deal {
  spy: PlayerId;
  figure: string;
  spyFigure: string;
  lines: Record<PlayerId, string>;
  order: PlayerId[];
  /** ประโยคที่ใช้ไปแล้วในแมตช์ รวมรอบนี้ */
  used: string[];
}

/**
 * แจกประโยค: เลี่ยงประโยคที่ใช้ไปแล้วในแมตช์ และเลี่ยงโวหารหมู่บ้านซ้ำกับรอบก่อน
 * ถ้าประโยคที่เหลือไม่พอ เริ่มนับใหม่ (ใช้ซ้ำได้)
 */
export function deal(
  config: PoetsConfig,
  players: PlayerId[],
  rng: Rng,
  used: readonly string[],
  previousFigure: string | null,
): Deal {
  let skip = new Set(used);
  let options = pairings(config.figures, players.length, skip);
  if (options.length === 0) {
    skip = new Set();
    options = pairings(config.figures, players.length);
  }
  const fresh = options.filter((p) => p.figure !== previousFigure);
  const pool = fresh.length > 0 ? fresh : options;
  const pairing = pool[rng.int(pool.length)];
  if (!pairing) throw new Error(`no figure pairing for ${players.length} players`);

  const spy = players[rng.int(players.length)] as PlayerId;
  const village = rng.shuffle(pairing.village);
  const spyLine = pairing.spy[rng.int(pairing.spy.length)] as IndexedSentence;
  const lines: Record<PlayerId, string> = {};
  let next = 0;
  for (const p of players) {
    lines[p] = p === spy ? spyLine.id : (village[next++] as IndexedSentence).id;
  }
  return {
    spy,
    figure: pairing.figure,
    spyFigure: pairing.spyFigure,
    lines,
    order: rng.shuffle(players),
    used: [...skip, ...Object.values(lines)],
  };
}
