import { describe, expect, it } from 'vitest';
import { createBoss, DIE_FACES, FAMILIES, FULL_GAME_DEALS, spaceFamilies } from '../rules';
import { boards, DEFAULT_BOARD_ID, getBoard, toBossConfig } from '.';

const all = Object.values(boards);

describe.each(all)('กระดาน $id', (board) => {
  it('สร้างเกมได้ (ผ่านการตรวจ config ของกติกา)', () => {
    expect(() => createBoss(toBossConfig(board))).not.toThrow();
  });

  it('มี 6 ตระกูลครบ ชื่อ สี และสัญลักษณ์ไม่ซ้ำ', () => {
    expect(board.families.map((f) => f.id).sort()).toEqual([...FAMILIES].sort());
    for (const key of ['color', 'symbol'] as const) {
      expect(new Set(board.families.map((f) => f[key])).size).toBe(6);
    }
    for (const lang of ['th', 'en'] as const) {
      const names = board.families.map((f) => f.name[lang].trim());
      expect(names.every((n) => n.length > 0)).toBe(true);
      expect(new Set(names).size).toBe(6);
      expect(board.families.every((f) => f.trade[lang].trim().length > 0)).toBe(true);
    }
    for (const f of board.families) expect(f.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('ช่องดีล: id เป็น slug ชื่อไทย/อังกฤษครบและไม่ซ้ำ', () => {
    for (const s of board.spaces) expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const lang of ['th', 'en'] as const) {
      const names = board.spaces.map((s) => s.name[lang].trim());
      expect(names.every((n) => n.length > 0)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('ดีลที่ต้องใช้หลายตระกูลได้หุ้นมากกว่าหรือเท่ากับดีลที่ใช้น้อยกว่า', () => {
    const needed = (s: (typeof board.spaces)[number]) =>
      s.required.length + (s.optional?.count ?? 0);
    for (const a of board.spaces) {
      for (const b of board.spaces) {
        if (needed(a) > needed(b)) expect(a.shares, `${a.id} vs ${b.id}`).toBeGreaterThan(b.shares);
      }
    }
  });

  it('ทุกตระกูลมีบทบาทพอ ๆ กัน: อยู่ในอย่างน้อย 6 ดีล และเป็นตระกูลที่ต้องมีอย่างน้อย 4 ดีล', () => {
    for (const f of FAMILIES) {
      const inDeal = board.spaces.filter((s) => spaceFamilies(s).includes(f)).length;
      const required = board.spaces.filter((s) => s.required.includes(f)).length;
      expect(inDeal, f).toBeGreaterThanOrEqual(6);
      expect(required, f).toBeGreaterThanOrEqual(4);
    }
  });

  it('ราคาหุ้น 15 ดีลเพิ่มขึ้นเรื่อย ๆ และโอกาสจบเกมเพิ่มขึ้นทุกดีล', () => {
    expect(board.dealValues).toHaveLength(FULL_GAME_DEALS);
    board.dealValues.forEach((v, i) => {
      if (i > 0) expect(v).toBeGreaterThan(board.dealValues[i - 1] as number);
    });
    const chances = board.endFaces.map((faces) => faces.length / DIE_FACES);
    chances.forEach((c, i) => {
      if (i > 0) expect(c).toBeGreaterThan(chances[i - 1] as number);
    });
    expect(chances.at(-1)).toBeLessThan(1);
  });

  it('ไม่ใช้ชื่อเกมต้นฉบับ', () => {
    const json = JSON.stringify(board).toLowerCase();
    expect(json).not.toContain('the boss');
    expect(json).not.toContain('sackson');
  });
});

it('กระดานเริ่มต้นมีอยู่จริง', () => {
  expect(getBoard(DEFAULT_BOARD_ID)).toBeDefined();
});
