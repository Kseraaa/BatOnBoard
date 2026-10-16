import { EngineError } from '@batonboard/engine';
import { RoomError } from '@batonboard/protocol';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { th } from './th';

/** โครง key ทั้งหมด (ฟังก์ชันนับเป็นใบไม้) */
function shape(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
}

describe('ข้อความ UI', () => {
  it('ไทยและอังกฤษมี key ตรงกัน', () => {
    expect(shape(en).sort()).toEqual(shape(th).sort());
  });

  it('มีข้อความสำหรับรหัส error ทุกตัวของห้องและ engine', () => {
    for (const code of [...Object.values(RoomError), ...Object.values(EngineError)]) {
      expect(th.errors[code], code).toBeTruthy();
      expect(en.errors[code], code).toBeTruthy();
    }
  });

  it('ไม่ใช้ชื่อเกมต้นฉบับใน UI', () => {
    const all = JSON.stringify([th, en]).toLowerCase();
    expect(all).not.toContain('spyfall');
  });
});
