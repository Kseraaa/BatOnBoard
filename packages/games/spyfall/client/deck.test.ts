import { describe, expect, it } from 'vitest';
import { getLocationSet, DEFAULT_LOCATION_SET_ID } from '../data';
import { spyfall } from '../index';
import { createRng, startGame } from '@batonboard/engine';
import { checkCustomLocation, nextCustomId, parseRoles } from './custom-location';
import { deckFor, readOptions } from './deck';

const set = getLocationSet(DEFAULT_LOCATION_SET_ID);
const cafe = { id: 'custom-1', name: 'คาเฟ่แมว', roles: ['บาริสต้า', 'ทาสแมว'] };

describe('deckFor', () => {
  it('ตัดที่ปิดออก ต่อด้วยที่สร้างเอง และ id บทบาทตรงกับที่กติกาแจก', () => {
    const first = set?.locations[0]?.id as string;
    const options = { durationMs: 60_000, disabled: [first], custom: [cafe] };
    const deck = deckFor(set, options, 'th');
    expect(deck.some((l) => l.id === first)).toBe(false);
    expect(deck.at(-1)).toMatchObject({ id: 'custom-1', name: 'คาเฟ่แมว', custom: true });

    // ปิดชุดมาตรฐานทั้งหมดให้เหลือแต่ที่สร้างเอง แล้วเทียบกับ state จริง
    const all = set?.locations.map((l) => l.id) ?? [];
    const own = {
      durationMs: 60_000,
      disabled: all,
      custom: [cafe, { ...cafe, id: 'custom-2', name: 'ออฟฟิศ' }],
    };
    const res = startGame(spyfall, ['a', 'b', 'c', 'd'], own, createRng(5), 0);
    if (!res.ok) throw new Error(res.error);
    const state = res.value;
    const loc = deckFor(set, own, 'en').find((l) => l.id === state.locationId);
    for (const roleId of Object.values(state.roles)) {
      expect(loc?.roles.some((r) => r.id === roleId)).toBe(true);
    }
  });

  it('options เดิมที่มีแค่เวลา = ชุดมาตรฐานทั้งหมด', () => {
    expect(deckFor(set, { durationMs: 60_000 }, 'en')).toHaveLength(set?.locations.length ?? -1);
    expect(readOptions(null)).toMatchObject({ disabled: [], custom: [] });
  });
});

describe('ฟอร์มสถานที่ที่สร้างเอง', () => {
  it('แยกบทบาทบรรทัดละ 1 และตัดบรรทัดว่าง', () => {
    expect(parseRoles(' ครู \n\nนักเรียน\n  ')).toEqual(['ครู', 'นักเรียน']);
  });

  it('id ใหม่ไม่ชนกับที่มี', () => {
    expect(nextCustomId([])).toBe('custom-1');
    expect(nextCustomId([cafe, { ...cafe, id: 'custom-7' }])).toBe('custom-8');
  });

  it('ตรวจชื่อ ชื่อซ้ำ และบทบาท', () => {
    const ok = { name: 'ออฟฟิศ', roles: ['หัวหน้า'] };
    expect(checkCustomLocation(ok, [cafe], null)).toBeNull();
    expect(checkCustomLocation({ ...ok, name: ' ' }, [cafe], null)).toBe('name');
    expect(checkCustomLocation({ ...ok, name: 'คาเฟ่แมว' }, [cafe], null)).toBe('duplicateName');
    expect(checkCustomLocation({ ...ok, name: 'คาเฟ่แมว' }, [cafe], 'custom-1')).toBeNull();
    expect(checkCustomLocation({ ...ok, roles: [] }, [cafe], null)).toBe('roles');
    expect(checkCustomLocation({ ...ok, roles: ['a', 'A'] }, [cafe], null)).toBe('roles');
    expect(
      checkCustomLocation({ ...ok, roles: Array.from({ length: 8 }, (_, i) => `r${i}`) }, [], null),
    ).toBe('roles');
    const full = Array.from({ length: 20 }, (_, i) => ({
      ...cafe,
      id: `custom-${i}`,
      name: `p${i}`,
    }));
    expect(checkCustomLocation(ok, full, null)).toBe('maxCustom');
  });
});
