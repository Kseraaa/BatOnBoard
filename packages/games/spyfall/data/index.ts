import type { LocationDef } from '../rules';
import { originalV1 } from './original-v1';
import type { LocationSet } from './types';

export type { LocalizedText, LocationData, LocationSet, RoleData } from './types';
export { originalV1 };

/** ชุดสถานที่ทั้งหมด — client ใช้ locationSetId ใน view หาชุดที่ต้องแสดง */
export const locationSets: Record<string, LocationSet> = {
  [originalV1.id]: originalV1,
};

export const DEFAULT_LOCATION_SET_ID = originalV1.id;

export function getLocationSet(id: string): LocationSet | undefined {
  return locationSets[id];
}

/** ตัดชื่อที่แสดงออก เหลือแค่ id ที่กติกาใช้ */
export function toLocationDefs(set: LocationSet): LocationDef[] {
  return set.locations.map((l) => ({ id: l.id, roles: l.roles.map((r) => r.id) }));
}
