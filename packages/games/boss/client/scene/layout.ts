/**
 * ตำแหน่งของสิ่งต่าง ๆ บนโต๊ะ 3D (หน่วย three.js) — ไม่ import three จะได้เทสต์ได้เบา ๆ
 * กระดานใช้ตาราง 5×5 แบบเดียวกับ 2D (`ringCell`) แกน x = คอลัมน์ แกน z = แถว (ไกลกล้อง = แถวบน)
 */
import { BOARD_SIZE } from '../../rules/constants';
import { ringCell } from '../logic';

export const TILE = 1;
export const GAP = 0.12;
export const STEP = TILE + GAP;
export const TILE_H = 0.14;
/** รัศมีวงที่นั่งผู้เล่นรอบกระดาน */
export const SEAT_RADIUS = 3.95;
export const TABLE_RADIUS = 5;

export type Vec3 = [number, number, number];

export function tilePos(i: number): Vec3 {
  const { row, col } = ringCell(i);
  return [(col - 3) * STEP, 0, (row - 3) * STEP];
}

/** ทางเดินของตัวเงินจาก `from` ไป `to` ตามเข็มนาฬิกา ข้ามช่องที่ปิดแล้ว (ไม่รวมช่องเริ่ม) */
export function markerPath(from: number, to: number, closed: number[]): number[] {
  const path: number[] = [];
  let at = from;
  for (let guard = 0; at !== to && guard < BOARD_SIZE; guard++) {
    at = (at + 1) % BOARD_SIZE;
    if (!closed.includes(at) || at === to) path.push(at);
  }
  return path;
}

/**
 * ที่นั่งรอบโต๊ะ: ตัวเองอยู่ด้านหน้า (ใกล้กล้อง) คนอื่นวนตามลำดับที่นั่ง
 * มุม 0 = ด้านหน้า (z บวก)
 */
export function seatPos(index: number, count: number, meIndex: number): Vec3 {
  const offset = meIndex >= 0 ? meIndex : 0;
  const angle = ((index - offset) / count) * Math.PI * 2;
  return [Math.sin(angle) * SEAT_RADIUS, 0, Math.cos(angle) * SEAT_RADIUS];
}

/** หน้าลูกเต๋าตามลำดับ material ของ BoxGeometry: +x, -x, +y, -y, +z, -z (ด้านตรงข้ามรวมได้ 7) */
export const DIE_FACES: readonly number[] = [3, 4, 1, 6, 2, 5];

/** มุมหมุน (x, z) ที่ทำให้หน้า `value` หงายขึ้น (+y) */
export function dieRotation(value: number): [number, number, number] {
  switch (value) {
    case 1:
      return [0, 0, 0];
    case 6:
      return [Math.PI, 0, 0];
    case 2:
      return [-Math.PI / 2, 0, 0];
    case 5:
      return [Math.PI / 2, 0, 0];
    case 3:
      return [0, 0, Math.PI / 2];
    case 4:
      return [0, 0, -Math.PI / 2];
    default:
      return [0, 0, 0];
  }
}

/** เงิน → จำนวนเหรียญในกอง (กองหนึ่งไม่เกิน 12 เหรียญ เกินแล้วแยกกองใหม่ สูงสุด 4 กอง) */
export function coinStacks(units: number, perCoin = 10): number[] {
  const coins = Math.min(48, Math.ceil(units / perCoin));
  const stacks: number[] = [];
  for (let left = coins; left > 0; left -= 12) stacks.push(Math.min(12, left));
  return stacks;
}
