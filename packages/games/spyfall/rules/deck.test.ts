import { describe, expect, it } from 'vitest';
import { MAX_CUSTOM_LOCATIONS, MIN_DURATION_MS, SpyfallError } from './constants';
import { buildDeck, customRoleId } from './deck';
import { act, agents, HOST, spyfall, start, testLocations, tryAct } from './fixtures';
import type { CustomLocation, SpyfallOptions } from './types';

const allIds = testLocations.map((l) => l.id);

const custom = (n: number, roles = 7): CustomLocation => ({
  id: `custom-${n}`,
  name: `สถานที่ ${n}`,
  roles: Array.from({ length: roles }, (_, i) => `บทบาท ${n}-${i}`),
});

const options = (o: Partial<SpyfallOptions>): SpyfallOptions => ({
  durationMs: MIN_DURATION_MS,
  ...o,
});

const parse = (o: unknown) => spyfall.optionsSchema.safeParse(o);

describe('buildDeck', () => {
  it('ตัดสถานที่ที่ปิดออก แล้วต่อท้ายด้วยที่สร้างเอง (id บทบาทตามลำดับ)', () => {
    const deck = buildDeck(testLocations, { disabled: ['loc-zeppelin'], custom: [custom(1, 2)] });
    expect(deck.map((l) => l.id)).toEqual([
      'loc-lighthouse',
      'loc-aquarium',
      'loc-bakery',
      'custom-1',
    ]);
    expect(deck.at(-1)?.roles).toEqual([customRoleId('custom-1', 0), 'custom-1/r1']);
  });

  it('ไม่มี options = ใช้ชุดมาตรฐานทั้งหมด', () => {
    expect(buildDeck(testLocations, {})).toEqual(testLocations);
  });
});

describe('ตรวจตั้งค่าสถานที่', () => {
  it('ตั้งค่าเดิม (มีแค่เวลา) ยังใช้ได้', () => {
    expect(parse({ durationMs: MIN_DURATION_MS }).success).toBe(true);
  });

  it('ตัดช่องว่างหัวท้ายชื่อที่พิมพ์', () => {
    const res = parse(
      options({ custom: [{ id: 'custom-1', name: '  ร้านป้า  ', roles: [' แม่ค้า '] }] }),
    );
    expect(res.success && res.data.custom?.[0]).toEqual({
      id: 'custom-1',
      name: 'ร้านป้า',
      roles: ['แม่ค้า'],
    });
  });

  it.each([
    ['ปิดสถานที่ที่ไม่มีจริง', options({ disabled: ['loc-nowhere'] })],
    ['ปิดซ้ำ', options({ disabled: ['loc-bakery', 'loc-bakery'] })],
    ['เหลือสถานที่ไม่ถึง 2', options({ disabled: allIds.slice(1) })],
    ['ปิดหมดและสร้างเองแค่ 1', options({ disabled: allIds, custom: [custom(1)] })],
    ['id ผิดรูปแบบ', options({ custom: [{ ...custom(1), id: 'loc-bakery' }] })],
    ['id ซ้ำ', options({ custom: [custom(1), { ...custom(2), id: 'custom-1' }] })],
    [
      'ชื่อซ้ำ (ไม่สนตัวพิมพ์)',
      options({
        custom: [
          { ...custom(1), name: 'Cafe' },
          { ...custom(2), name: 'cafe' },
        ],
      }),
    ],
    ['ชื่อว่าง', options({ custom: [{ ...custom(1), name: '   ' }] })],
    ['ชื่อยาวเกิน', options({ custom: [{ ...custom(1), name: 'ก'.repeat(31) }] })],
    ['ไม่มีบทบาท', options({ custom: [custom(1, 0)] })],
    ['บทบาทเกิน 7', options({ custom: [custom(1, 8)] })],
    ['บทบาทซ้ำ', options({ custom: [{ ...custom(1), roles: ['ครู', 'ครู'] }] })],
    [
      `สร้างเองเกิน ${MAX_CUSTOM_LOCATIONS}`,
      options({ custom: Array.from({ length: MAX_CUSTOM_LOCATIONS + 1 }, (_, i) => custom(i)) }),
    ],
  ])('ปฏิเสธ: %s', (_name, o) => {
    expect(parse(o).success).toBe(false);
  });

  it('ปิดชุดมาตรฐานหมดแล้วใช้ที่สร้างเอง 2 แห่งได้', () => {
    expect(parse(options({ disabled: allIds, custom: [custom(1), custom(2)] })).success).toBe(true);
  });
});

describe('เล่นด้วยกองสถานที่จากตั้งค่า', () => {
  const customOnly = options({ disabled: allIds, custom: [custom(1, 2), custom(2, 3)] });

  it('สุ่มเฉพาะสถานที่ที่เปิดอยู่ทุก seed', () => {
    const o = options({ disabled: ['loc-zeppelin', 'loc-lighthouse'] });
    for (let seed = 0; seed < 30; seed++) {
      expect(['loc-aquarium', 'loc-bakery']).toContain(start(4, seed, o).locationId);
    }
  });

  it('สถานที่ที่สร้างเองมีบทบาทน้อยกว่าคน = บทบาทวนซ้ำ ทุกคนยังได้บทบาท', () => {
    const s = start(8, 3, customOnly);
    expect(['custom-1', 'custom-2']).toContain(s.locationId);
    const roles = Object.values(s.roles);
    expect(roles).toHaveLength(7);
    for (const r of roles) expect(r.startsWith(`${s.locationId}/r`)).toBe(true);
  });

  it('สายลับเดาได้เฉพาะสถานที่ในกอง', () => {
    const s = start(4, 1, options({ disabled: ['loc-zeppelin'] }));
    const guess = (locationId: string) => tryAct(s, s.spy, { type: 'SPY_GUESS', locationId });
    expect(guess('loc-zeppelin')).toBe(SpyfallError.UnknownLocation);
    expect(guess('custom-1')).toBe(SpyfallError.UnknownLocation);
    expect(guess(s.locationId)).toBeNull();
  });

  it('รอบถัดไปใช้กองเดิม', () => {
    let s = start(4, 2, customOnly);
    s = act(s, s.spy, { type: 'SPY_GUESS', locationId: s.locationId });
    const next = act(s, HOST, { type: 'NEXT_ROUND' }, undefined, 7);
    expect(next.deck).toEqual(s.deck);
    expect(['custom-1', 'custom-2']).toContain(next.locationId);
    expect(next.locationId).not.toBe(s.locationId);
  });

  it('view ของสายลับไม่มี id สถานที่หรือบทบาทที่สร้างเอง และไม่มีกองสถานที่', () => {
    for (let seed = 0; seed < 10; seed++) {
      const s = start(5, seed, customOnly);
      const json = JSON.stringify(spyfall.playerView(s, s.spy));
      expect(json).not.toContain('custom-');
      expect(json).not.toContain('deck');
      for (const p of agents(s)) {
        expect(JSON.stringify(spyfall.playerView(s, p))).not.toContain('deck');
      }
    }
  });
});
