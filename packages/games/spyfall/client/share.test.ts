import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCATION_SET_ID, getLocationSet } from '../data';
import { loadSavedDeck, saveDeck } from './saved-deck';
import { exportDeck, importDeck } from './share';
import type { DeckChoice } from './share';

const builtin = getLocationSet(DEFAULT_LOCATION_SET_ID)?.locations ?? [];
const [first, second] = builtin as [(typeof builtin)[0], (typeof builtin)[0]];

const deck: DeckChoice = {
  disabled: [first.id, second.id],
  custom: [
    { id: 'custom-1', name: 'คาเฟ่แมว', roles: ['บาริสต้า', 'ทาสแมว'] },
    { id: 'custom-4', name: 'ออฟฟิศ', roles: ['หัวหน้า'] },
  ],
};

describe('ส่งออก/นำเข้าชุดสถานที่เป็นข้อความ', () => {
  it.each(['th', 'en'] as const)('ส่งออกแล้วนำเข้ากลับได้ชุดเดิม (%s)', (locale) => {
    const text = exportDeck(deck, builtin, locale);
    expect(text).toContain(first.name[locale]);
    const res = importDeck(text, builtin);
    // id ของที่สร้างเองเรียงใหม่ตั้งแต่ 1
    expect(res).toEqual({
      ok: true,
      deck: {
        disabled: [first.id, second.id],
        custom: [deck.custom[0], { ...deck.custom[1], id: 'custom-2' }],
      },
    });
  });

  it('รับข้อความที่พิมพ์เองแบบหลวม ๆ: ไม่มีหัวข้อ บทบาทไม่มีขีด มีบรรทัดว่างและ CRLF', () => {
    const text = `#ร้านป้า\r\nแม่ค้า\r\n\r\n•  ลูกค้าประจำ\r\n# บ้านเพื่อน\r\n* เจ้าของบ้าน`;
    expect(importDeck(text, builtin)).toEqual({
      ok: true,
      deck: {
        disabled: [],
        custom: [
          { id: 'custom-1', name: 'ร้านป้า', roles: ['แม่ค้า', 'ลูกค้าประจำ'] },
          { id: 'custom-2', name: 'บ้านเพื่อน', roles: ['เจ้าของบ้าน'] },
        ],
      },
    });
  });

  it('สถานที่มาตรฐานอ้างด้วยชื่อภาษาไหนก็ได้ ไม่สนตัวพิมพ์', () => {
    const res = importDeck(
      `ไม่ใช้: ${first.name.th}\nNot used: ${second.name.en.toUpperCase()}`,
      builtin,
    );
    expect(res).toEqual({ ok: true, deck: { disabled: [first.id, second.id], custom: [] } });
  });

  it.each([
    ['ข้อความว่าง', 'สวัสดี', { ok: false, error: 'empty' }],
    [
      'ชื่อสถานที่มาตรฐานที่ไม่มี',
      'ไม่ใช้: ดาวอังคาร',
      { ok: false, error: 'unknown', names: ['ดาวอังคาร'] },
    ],
    [
      'สถานที่ไม่มีบทบาท',
      '# ว่างเปล่า',
      { ok: false, error: 'location', name: 'ว่างเปล่า', problem: 'roles' },
    ],
    [
      'ชื่อซ้ำ',
      '# A\n- x\n# a\n- y',
      { ok: false, error: 'location', name: 'a', problem: 'duplicateName' },
    ],
    [
      'เกิน 20 แห่ง',
      Array.from({ length: 21 }, (_, i) => `# p${i}\n- r`).join('\n'),
      { ok: false, error: 'tooMany' },
    ],
  ])('ปฏิเสธ: %s', (_name, text, expected) => {
    expect(importDeck(text, builtin)).toEqual(expected);
  });
});

describe('จำชุดล่าสุดในเครื่อง', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage() {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    return store;
  }

  it('บันทึกแล้วอ่านกลับ และตัด id ที่ไม่มีในชุดมาตรฐานแล้ว', () => {
    stubStorage();
    saveDeck({ ...deck, disabled: [...deck.disabled, 'removed-place'] });
    expect(loadSavedDeck(builtin.map((l) => l.id))).toEqual(deck);
  });

  it('ชุดว่างลบที่บันทึกไว้ และข้อมูลเสียคืน null', () => {
    const store = stubStorage();
    saveDeck(deck);
    saveDeck({ disabled: [], custom: [] });
    expect(store.size).toBe(0);
    store.set('batonboard:spyfall:deck', '{not json');
    expect(loadSavedDeck([])).toBeNull();
  });

  it('ไม่มี localStorage (โหมดส่วนตัว) ก็ไม่พัง', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(() => saveDeck(deck)).not.toThrow();
    expect(loadSavedDeck([])).toBeNull();
  });
});
