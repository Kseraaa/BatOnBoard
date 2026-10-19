import { MAX_CUSTOM_LOCATIONS, MAX_CUSTOM_ROLES, MAX_CUSTOM_TEXT } from '../rules/constants';
import type { CustomLocation } from '../rules/types';

/**
 * ตรวจฟอร์มสถานที่ที่สร้างเองก่อนส่ง — แค่เพื่อ UX
 * server ตรวจจริงด้วย optionsSchema อีกชั้น
 */

export type CustomLocationError = 'name' | 'duplicateName' | 'roles' | 'maxCustom';

/** แยกบทบาทบรรทัดละ 1 ตัดช่องว่างและบรรทัดว่าง */
export function parseRoles(text: string): string[] {
  return text
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '');
}

/** id ใหม่ = เลขมากสุด + 1 จึงไม่ชนกับที่มีอยู่ */
export function nextCustomId(custom: readonly CustomLocation[]): string {
  const max = Math.max(0, ...custom.map((c) => Number(c.id.replace('custom-', '')) || 0));
  return `custom-${max + 1}`;
}

export function checkCustomLocation(
  draft: { name: string; roles: string[] },
  existing: readonly CustomLocation[],
  editingId: string | null,
): CustomLocationError | null {
  const name = draft.name.trim();
  if (name === '' || name.length > MAX_CUSTOM_TEXT) return 'name';
  const others = existing.filter((c) => c.id !== editingId);
  if (others.some((c) => c.name.toLowerCase() === name.toLowerCase())) return 'duplicateName';
  const roles = draft.roles;
  if (
    roles.length < 1 ||
    roles.length > MAX_CUSTOM_ROLES ||
    roles.some((r) => r.length > MAX_CUSTOM_TEXT) ||
    new Set(roles.map((r) => r.toLowerCase())).size !== roles.length
  ) {
    return 'roles';
  }
  if (editingId === null && existing.length >= MAX_CUSTOM_LOCATIONS) return 'maxCustom';
  return null;
}
