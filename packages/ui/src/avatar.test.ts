import { describe, expect, it } from 'vitest';
import { avatarFor } from './avatar';

describe('avatarFor', () => {
  it('ชื่อเดิมได้อวตารเดิม ไม่สนตัวพิมพ์และช่องว่างหัวท้าย', () => {
    expect(avatarFor('Bob')).toEqual(avatarFor('  bob '));
  });

  it('เป็นตาราง 8x8 และสีอยู่ในช่วง', () => {
    for (const name of ['แบต', 'Ann', 'Cat', 'Dan', 'มะม่วง', 'Eve', 'x']) {
      const { rows, hue } = avatarFor(name);
      expect(rows).toHaveLength(8);
      for (const row of rows) expect(row).toMatch(/^[.#]{8}$/);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('ชื่อต่างกันส่วนใหญ่ได้หน้าต่างกัน', () => {
    const names = Array.from({ length: 40 }, (_, i) => `player-${i}`);
    const keys = new Set(names.map((n) => JSON.stringify(avatarFor(n))));
    expect(keys.size).toBeGreaterThan(30);
  });
});
