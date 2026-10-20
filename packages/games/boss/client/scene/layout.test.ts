import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';
import {
  coinStacks,
  DIE_FACES,
  dieRotation,
  markerPath,
  SEAT_RADIUS,
  seatPos,
  STEP,
  TABLE_RADIUS,
  TILE,
  tilePos,
} from './layout';

/** ทิศของหน้าตาม material ของ BoxGeometry: +x, -x, +y, -y, +z, -z */
const NORMALS = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];

describe('ลูกเต๋า 3D', () => {
  it('หน้าตรงข้ามรวมได้ 7 และมีครบ 1–6', () => {
    expect([...DIE_FACES].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (let k = 0; k < 6; k += 2) expect((DIE_FACES[k] ?? 0) + (DIE_FACES[k + 1] ?? 0)).toBe(7);
  });

  it.each([1, 2, 3, 4, 5, 6])('หมุนแล้วหน้า %i หงายขึ้น (ทุกมุมหมุนรอบแกนตั้ง)', (value) => {
    const [x, , z] = dieRotation(value);
    for (const yaw of [0, 1.1, 2.5, 4]) {
      const euler = new Euler(x, yaw, z, 'YXZ');
      const up = NORMALS.map((n) => n.clone().applyEuler(euler).y);
      const top = up.indexOf(Math.max(...up));
      expect(DIE_FACES[top]).toBe(value);
      expect(Math.max(...up)).toBeCloseTo(1);
    }
  });
});

describe('ตำแหน่งบนโต๊ะ', () => {
  it('ช่องกระดานไม่ซ้อนกันและอยู่ในโต๊ะ', () => {
    const positions = Array.from({ length: 16 }, (_, i) => tilePos(i));
    for (let a = 0; a < 16; a++) {
      for (let b = a + 1; b < 16; b++) {
        const [ax, , az] = positions[a] ?? [0, 0, 0];
        const [bx, , bz] = positions[b] ?? [0, 0, 0];
        expect(Math.max(Math.abs(ax - bx), Math.abs(az - bz))).toBeGreaterThanOrEqual(STEP - 1e-9);
      }
    }
    const corner = 2 * STEP + TILE / 2;
    expect(Math.hypot(corner, corner)).toBeLessThan(SEAT_RADIUS);
    expect(SEAT_RADIUS + 0.95).toBeLessThan(TABLE_RADIUS);
  });

  it('ตัวเองนั่งด้านหน้า (ใกล้กล้อง) ทุกจำนวนผู้เล่น', () => {
    for (const n of [3, 4, 5, 6]) {
      for (let me = 0; me < n; me++) {
        const [x, , z] = seatPos(me, n, me);
        expect(x).toBeCloseTo(0);
        expect(z).toBeCloseTo(SEAT_RADIUS);
      }
    }
  });

  it('ตัวเงินเดินข้ามช่องที่ปิดแล้ว แต่หยุดที่ช่องปลายทางเสมอ', () => {
    expect(markerPath(14, 2, [])).toEqual([15, 0, 1, 2]);
    expect(markerPath(0, 5, [2, 3])).toEqual([1, 4, 5]);
    expect(markerPath(3, 3, [])).toEqual([]);
    // หลังปิดดีล ช่องเดิมปิดแล้ว ตัวเงินเดินไปช่องถัดไปที่เปิด
    expect(markerPath(4, 6, [4, 5])).toEqual([6]);
  });

  it('เหรียญแยกกองละไม่เกิน 12 สูงสุด 4 กอง', () => {
    expect(coinStacks(0)).toEqual([]);
    expect(coinStacks(5)).toEqual([1]);
    expect(coinStacks(120)).toEqual([12]);
    expect(coinStacks(130)).toEqual([12, 1]);
    expect(coinStacks(10_000)).toEqual([12, 12, 12, 12]);
  });
});
