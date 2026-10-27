import type { PlayerId, Rng } from '@batonboard/engine';
import type { PoetsConfig, SentenceDef, VillageDef } from './types';

/** ประโยคพร้อมโวหารทั้งหมดที่เข้าได้ (ตัวแรกคือโวหารหลัก) */
export interface IndexedSentence extends SentenceDef {
  figures: string[];
}

export function indexSentences(villages: readonly VillageDef[]): Map<string, IndexedSentence> {
  const entry = (s: SentenceDef, figure: string): [string, IndexedSentence] => [
    s.id,
    { ...s, figures: [figure, ...(s.also ?? [])] },
  ];
  return new Map(
    villages.flatMap((v) => [
      ...v.sentences.map((s) => entry(s, v.figure)),
      ...v.decoys.map((d) => entry(d, d.figure)),
    ]),
  );
}

export interface Deal {
  village: string;
  spy: PlayerId;
  figure: string;
  spyFigure: string;
  lines: Record<PlayerId, string>;
  order: PlayerId[];
  /** หมู่บ้านที่เล่นไปแล้วในแมตช์ รวมรอบนี้ */
  used: string[];
}

/**
 * แจกหนึ่งรอบ: เลือกหมู่บ้านที่ยังไม่ได้เล่นในแมตช์ (ครบแล้วเริ่มนับใหม่ แต่ไม่ซ้ำรอบก่อน)
 * กวีในหมู่บ้านได้ประโยคของหมู่บ้านคนละประโยค กวีฆาตกรได้ข้อหลอก
 */
export function deal(
  config: PoetsConfig,
  players: PlayerId[],
  rng: Rng,
  used: readonly string[],
  previousVillage: string | null,
): Deal {
  let played = new Set(used);
  let pool = config.villages.filter((v) => !played.has(v.id));
  if (pool.length === 0) {
    played = new Set();
    const fresh = config.villages.filter((v) => v.id !== previousVillage);
    pool = fresh.length > 0 ? fresh : config.villages;
  }
  const village = pool[rng.int(pool.length)];
  if (!village) throw new Error('poets has no villages');

  const spy = players[rng.int(players.length)] as PlayerId;
  const lines = rng.shuffle(village.sentences);
  const decoy = village.decoys[rng.int(village.decoys.length)] as SentenceDef & { figure: string };
  const dealt: Record<PlayerId, string> = {};
  let next = 0;
  for (const p of players) {
    dealt[p] = p === spy ? decoy.id : (lines[next++] as SentenceDef).id;
  }
  return {
    village: village.id,
    spy,
    figure: village.figure,
    spyFigure: decoy.figure,
    lines: dealt,
    order: rng.shuffle(players),
    used: [...played, village.id],
  };
}
