import type { Locale } from '@batonboard/ui';
import type { LocationSet } from '../data';
import { DEFAULT_DURATION_MS } from '../rules/constants';
import { customRoleId } from '../rules/deck';
import type { CustomLocation, SpyfallOptions } from '../rules/types';

export interface DeckRole {
  id: string;
  name: string;
}

export interface DeckLocation {
  id: string;
  name: string;
  roles: DeckRole[];
  custom: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** options ของห้องที่เติมค่าเริ่มต้นแล้ว — rounds ไม่มี = ไม่จำกัดรอบ */
export type RoomOptions = Required<Omit<SpyfallOptions, 'rounds'>> & Pick<SpyfallOptions, 'rounds'>;

/**
 * อ่าน options ของห้อง — server ตรวจด้วย optionsSchema แล้ว แต่ใน client เป็น unknown
 * ตรวจแบบเบา ๆ (ไม่ใช้ zod เพื่อไม่ให้ติดไปใน bundle) และเติมค่าเริ่มต้น
 */
export function readOptions(options: unknown): RoomOptions {
  const o = isObject(options) ? options : {};
  const custom: CustomLocation[] = Array.isArray(o.custom)
    ? o.custom.filter(isObject).map((c) => ({
        id: typeof c.id === 'string' ? c.id : '',
        name: typeof c.name === 'string' ? c.name : '',
        roles: strings(c.roles),
      }))
    : [];
  const base = {
    durationMs: typeof o.durationMs === 'number' ? o.durationMs : DEFAULT_DURATION_MS,
    disabled: strings(o.disabled),
    custom,
  };
  return typeof o.rounds === 'number' ? { ...base, rounds: o.rounds } : base;
}

/** สถานที่ที่ใช้ในห้องนี้พร้อมชื่อที่แสดง — id ตรงกับ buildDeck ของกติกา */
export function deckFor(
  set: LocationSet | undefined,
  options: unknown,
  locale: Locale,
): DeckLocation[] {
  const { disabled, custom } = readOptions(options);
  const off = new Set(disabled);
  return [
    ...(set?.locations ?? [])
      .filter((l) => !off.has(l.id))
      .map((l) => ({
        id: l.id,
        name: l.name[locale],
        roles: l.roles.map((r) => ({ id: r.id, name: r.name[locale] })),
        custom: false,
      })),
    ...custom.map((c) => ({
      id: c.id,
      name: c.name,
      roles: c.roles.map((name, i) => ({ id: customRoleId(c.id, i), name })),
      custom: true,
    })),
  ];
}
