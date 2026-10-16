import { describe, expect, it } from 'vitest';
import { createRegistry } from './registry';
import { secretGame } from './test-game';

describe('createRegistry', () => {
  it('ลงทะเบียนแล้วหาเจอจาก id', () => {
    const registry = createRegistry();
    registry.register(secretGame);
    expect(registry.has('secret-number')).toBe(true);
    expect(registry.get('secret-number')).toBe(secretGame);
    expect(registry.get('nope')).toBeUndefined();
    expect(registry.list()).toEqual([secretGame]);
  });

  it('ห้ามลงทะเบียน id ซ้ำ', () => {
    const registry = createRegistry();
    registry.register(secretGame);
    expect(() => registry.register(secretGame)).toThrow(/already registered/);
  });

  it('ปฏิเสธช่วงจำนวนผู้เล่นที่ผิด', () => {
    const registry = createRegistry();
    expect(() =>
      registry.register({ ...secretGame, id: 'x', minPlayers: 5, maxPlayers: 2 }),
    ).toThrow(/invalid player range/);
  });

  it('registry แต่ละตัวแยกกัน', () => {
    const a = createRegistry();
    const b = createRegistry();
    a.register(secretGame);
    expect(b.has('secret-number')).toBe(false);
  });
});
