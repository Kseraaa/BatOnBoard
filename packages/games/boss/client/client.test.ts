import { describe, expect, it } from 'vitest';
import { act, boss, give, owned, start, testSpaces } from '../rules/fixtures';
import type { BossState, SpaceDef } from '../rules/types';
import { boards } from '../data';
import {
  autoPlan,
  canDeclare,
  canDraw,
  canRespond,
  canRoll,
  cardUse,
  discardCount,
  millions,
  planError,
  planMembers,
  recruitFamilies,
  ringCell,
  travelTargets,
} from './logic';
import { bossMessages, GAME_DESCRIPTION, GAME_DISPLAY_NAME } from './messages';

const viewOf = (s: BossState, p: string) => boss.playerView(s, p);
const DAN = 'p-dan';
const space0 = testSpaces[0] as SpaceDef;

/** 4 คน ทุกตระกูลมีเจ้าของ ดันประกาศดีลช่อง 0 (red + เลือก blue/yellow) */
function dealing(cards: Record<string, string[]> = {}): BossState {
  let s: BossState = { ...owned(start(4, 9)), marker: 0, current: DAN };
  for (const [p, list] of Object.entries(cards)) s = give(s, p, list);
  return act(s, DAN, { type: 'DECLARE' });
}

describe('กระดาน 5×5', () => {
  it('16 ช่องอยู่บนขอบพอดี ไม่ซ้ำ และเดินตามเข็มนาฬิกาติดกัน', () => {
    const cells = Array.from({ length: 16 }, (_, i) => ringCell(i));
    expect(new Set(cells.map((c) => `${c.row},${c.col}`)).size).toBe(16);
    for (const c of cells) {
      expect([c.row, c.col].some((v) => v === 1 || v === 5)).toBe(true);
      expect(Math.min(c.row, c.col)).toBeGreaterThanOrEqual(1);
      expect(Math.max(c.row, c.col)).toBeLessThanOrEqual(5);
    }
    cells.forEach((c, i) => {
      const next = cells[(i + 1) % 16] as typeof c;
      expect(Math.abs(c.row - next.row) + Math.abs(c.col - next.col)).toBe(1);
    });
  });
});

describe('ปุ่มที่แสดง', () => {
  it('ทอย/ประกาศ/จั่ว เฉพาะเจ้าของเทิร์นและตาม phase', () => {
    const s = start(4, 1);
    const other = s.players.find((p) => p !== s.current) as string;
    expect(canRoll(viewOf(s, s.current))).toBe(true);
    expect(canDeclare(viewOf(s, s.current))).toBe(true);
    expect(canDraw(viewOf(s, s.current))).toBe(false);
    expect(canRoll(viewOf(s, other))).toBe(false);
    const moved = act(s, s.current, { type: 'ROLL' });
    expect(canRoll(viewOf(moved, s.current))).toBe(false);
    expect(canDraw(viewOf(moved, s.current))).toBe(true);
    expect(canRoll(viewOf(s, 'p-spectator'))).toBe(false);
  });

  it('ต้องทิ้งไพ่กี่ใบ', () => {
    let s = start(4, 1);
    const p = s.current;
    s = give(s, p, s.deck.slice(0, 6));
    s = act(act(s, p, { type: 'ROLL' }), p, { type: 'DRAW' });
    expect(discardCount(viewOf(s, p))).toBe(2);
    expect(discardCount(viewOf(s, s.players.find((q) => q !== p) as string))).toBe(0);
  });
});

describe('แผนดีล', () => {
  it('แผนเริ่มต้นครบตระกูลและผ่านการตรวจ', () => {
    const s = dealing();
    const view = viewOf(s, DAN);
    const slots = autoPlan(view, space0);
    expect(slots.map((x) => x.family).sort()).toEqual(['blue', 'red']);
    expect(planError(view, space0, { slots, shares: {} })).toBeNull();
    expect(planMembers(view, slots).sort()).toEqual(['p-ann', 'p-bob']);
  });

  it('เฉพาะผู้ร่วมดีลตอบได้ และตอบไม่ได้ระหว่างมีไพ่รอผล', () => {
    let s = dealing({ 'p-cat': ['takeover-1'] });
    const slots = autoPlan(viewOf(s, DAN), space0);
    s = act(s, DAN, { type: 'PROPOSE', plan: { slots, shares: {} } });
    expect(canRespond(viewOf(s, 'p-ann'))).toBe(true);
    expect(canRespond(viewOf(s, 'p-cat'))).toBe(false);
    expect(canRespond(viewOf(s, DAN))).toBe(false);
    s = act(s, 'p-cat', { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    expect(canRespond(viewOf(s, 'p-ann'))).toBe(false);
  });
});

describe('ไพ่บนมือใช้ทำอะไรได้', () => {
  it('ตามชนิดและสถานการณ์', () => {
    const cards = ['clan-blue-1', 'clan-green-1', 'travel-any-1', 'takeover-1', 'stop-1'];
    let s = dealing({ 'p-cat': [...cards, 'recruit-1', 'recruit-2', 'recruit-3'] });
    const view = viewOf(s, 'p-cat');
    expect(cardUse(view, space0, 'clan-blue-1')).toBe('offer');
    expect(cardUse(view, space0, 'clan-green-1')).toBeNull();
    expect(cardUse(view, space0, 'travel-any-1')).toBe('travel');
    expect(cardUse(view, space0, 'takeover-1')).toBe('takeover');
    expect(cardUse(view, space0, 'recruit-1')).toBe('recruit');
    expect(cardUse(view, space0, 'stop-1')).toBeNull();
    // ดีลช่อง 0 ใช้ red/blue/yellow ทุกตระกูลมีนักลงทุน
    expect(
      travelTargets(view, space0, 'travel-any-1')
        .map((t) => t.family)
        .sort(),
    ).toEqual(['blue', 'red', 'yellow']);
    expect(recruitFamilies(view)).not.toContain('yellow'); // ของ cat เอง

    s = act(s, 'p-cat', { type: 'PLAY_TAKEOVER', card: 'takeover-1' });
    const pending = viewOf(s, 'p-cat');
    expect(cardUse(pending, space0, 'stop-1')).toBe('stop');
    expect(cardUse(pending, space0, 'travel-any-1')).toBeNull();
  });

  it('นอกดีลใช้ไพ่ไม่ได้', () => {
    const s = start(4, 1);
    const p = s.current;
    for (const card of s.hands[p] ?? []) expect(cardUse(viewOf(s, p), space0, card)).toBeNull();
  });
});

describe('ข้อความ', () => {
  it('เงินเป็นล้านบาท', () => {
    expect(millions(10, 100_000)).toBe('1');
    expect(millions(12, 100_000)).toBe('1.2');
    expect(millions(0, 100_000)).toBe('0');
  });

  it('ภาษาไทยและอังกฤษมี key ตรงกัน', () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? keys(v).map((x) => `${k}.${x}`) : [k],
      );
    expect(keys(bossMessages.en).sort()).toEqual(keys(bossMessages.th).sort());
    expect(GAME_DISPLAY_NAME.th.length).toBeGreaterThan(0);
    expect(GAME_DESCRIPTION.en.length).toBeGreaterThan(0);
  });

  it('ไม่ใช้ชื่อเกมต้นฉบับใน UI', () => {
    const json = JSON.stringify([bossMessages, GAME_DISPLAY_NAME, GAME_DESCRIPTION, boards]);
    expect(json.toLowerCase()).not.toMatch(/i.?m the boss/);
  });
});
