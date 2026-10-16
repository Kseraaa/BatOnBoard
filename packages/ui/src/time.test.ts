import { describe, expect, it } from 'vitest';
import { formatClock, remainingMs } from './time';

describe('remainingMs', () => {
  it('ชดเชยนาฬิกาเครื่องที่เดินช้า/เร็วกว่า server', () => {
    // เครื่องช้ากว่า server 5 วินาที
    expect(remainingMs(100_000, 5_000, 80_000)).toBe(15_000);
    // เครื่องเร็วกว่า server 5 วินาที
    expect(remainingMs(100_000, -5_000, 80_000)).toBe(25_000);
  });

  it('ไม่ติดลบ', () => {
    expect(remainingMs(100, 0, 1_000)).toBe(0);
  });
});

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [999, '0:01'],
    [60_000, '1:00'],
    [125_000, '2:05'],
    [480_000, '8:00'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});
