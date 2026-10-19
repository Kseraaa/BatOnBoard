/**
 * อวตาร pixel art ที่สร้างจากชื่อแบบตายตัว: ชื่อเดิมได้หน้าเดิมเสมอทุกเครื่อง
 * ไม่ต้องเก็บอะไรเพิ่มใน server ประกอบจากชิ้นส่วน (ทรงผม/หมวก, ตา, ปาก) + สี
 * ใบหน้าเป็นช่องทึบ ตาและปากเป็นช่องว่างให้เห็นพื้นหลัง
 */

/** 2 แถวบนสุด */
const TOPS: readonly (readonly [string, string])[] = [
  ['..####..', '.######.'], // ผมสั้น
  ['..####..', '########'], // หมวกปีก
  ['.#####..', '#######.'], // หมวกแก๊ป
  ['.#.##.#.', '.######.'], // ผมตั้ง
  ['........', '..####..'], // หัวโล้น
  ['...##...', '.######.'], // หมวกไหมพรม
];

/** แถวตา */
const EYES: readonly string[] = [
  '.#.##.#.', // ปกติ
  '.#....#.', // แว่นดำ
  '.####.#.', // ขยิบตา
  '.##..##.', // ตาเหล่
];

/** แถวปาก */
const MOUTHS: readonly string[] = [
  '.##..##.', // ยิ้ม
  '.#....#.', // อ้าปาก
  '.###.##.', // มุมปาก
  '.######.', // ไม่มีปาก (ปิดปากเงียบ)
];

/** FNV-1a 32 บิต */
export function hashName(name: string): number {
  let h = 0x811c9dc5;
  for (const ch of name.trim().toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export interface Avatar {
  rows: string[];
  /** มุมสี (0–359) สำหรับ oklch */
  hue: number;
}

export function avatarFor(name: string): Avatar {
  const h = hashName(name);
  const top = TOPS[h % TOPS.length] as readonly [string, string];
  const eyes = EYES[(h >>> 4) % EYES.length] as string;
  const mouth = MOUTHS[(h >>> 8) % MOUTHS.length] as string;
  return {
    rows: [top[0], top[1], '.######.', eyes, '.######.', mouth, '..####..', '...##...'],
    hue: ((h >>> 12) % 12) * 30,
  };
}
