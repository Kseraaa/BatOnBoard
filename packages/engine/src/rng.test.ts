import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('seed เดิมให้ลำดับเดิม', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('seed ต่างกันให้ลำดับต่างกัน', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('next อยู่ใน [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int อยู่ใน [0, max) และออกครบทุกค่า', () => {
    const rng = createRng(123);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) {
      const x = rng.int(6);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(6);
      seen.add(x);
    }
    expect(seen.size).toBe(6);
  });

  it('int ปฏิเสธค่าที่ไม่ใช่จำนวนเต็มบวก', () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(-3)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
  });

  it('shuffle คืน permutation ใหม่ ไม่แก้ array เดิม และซ้ำได้ด้วย seed เดิม', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const copy = items.slice();
    const out = createRng(99).shuffle(items);
    expect(items).toEqual(copy);
    expect(out).not.toBe(items);
    expect([...out].sort()).toEqual(copy);
    expect(createRng(99).shuffle(items)).toEqual(out);
  });

  it('shuffle กระจายตำแหน่งพอสมควร', () => {
    const rng = createRng(2024);
    const firstCounts = [0, 0, 0, 0];
    for (let i = 0; i < 4_000; i++) {
      const first = rng.shuffle([0, 1, 2, 3])[0] as number;
      firstCounts[first] = (firstCounts[first] ?? 0) + 1;
    }
    for (const c of firstCounts) {
      expect(c).toBeGreaterThan(800);
      expect(c).toBeLessThan(1200);
    }
  });

  it('ปฏิเสธ seed ที่ไม่ใช่ตัวเลขจำกัด', () => {
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
  });
});
