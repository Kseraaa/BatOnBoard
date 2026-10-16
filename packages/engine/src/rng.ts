import type { Rng } from './types';

/**
 * Rng แบบ seeded (mulberry32) — seed เดิมให้ลำดับเดิมเสมอ ใช้ในเทสต์และให้ผลซ้ำได้
 * server สุ่ม seed จาก crypto แล้วสร้าง rng หนึ่งตัวต่อห้อง
 */
export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`seed must be a finite number, got ${seed}`);
  }
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };

  return { next, int, shuffle };
}
