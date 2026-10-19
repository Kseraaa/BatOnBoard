import type { CustomLocation, LocationDef, SpyfallOptions } from './types';

/**
 * สร้างกองสถานที่จาก options ของห้อง — ไฟล์นี้ไม่ import zod
 * client จึงใช้ id ชุดเดียวกันหาชื่อที่แสดงได้
 */

/** id บทบาทของสถานที่ที่สร้างเอง: ตามลำดับที่พิมพ์ */
export function customRoleId(locationId: string, index: number): string {
  return `${locationId}/r${index}`;
}

export function customLocationDef(location: CustomLocation): LocationDef {
  return { id: location.id, roles: location.roles.map((_, i) => customRoleId(location.id, i)) };
}

export function buildDeck(
  builtin: readonly LocationDef[],
  options: Pick<SpyfallOptions, 'disabled' | 'custom'>,
): LocationDef[] {
  const disabled = new Set(options.disabled ?? []);
  return [
    ...builtin.filter((l) => !disabled.has(l.id)),
    ...(options.custom ?? []).map(customLocationDef),
  ];
}
