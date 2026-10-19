import type { DeckChoice } from './share';
import { readOptions } from './deck';

/**
 * ชุดสถานที่ล่าสุดของ host เก็บใน localStorage ของเบราว์เซอร์นั้น
 * (ยังไม่มีบัญชีผู้ใช้) — ห้องใหม่จะได้กดใช้ชุดเดิมได้ทันที
 */
const KEY = 'batonboard:spyfall:deck';

export function isEmptyDeck(deck: DeckChoice): boolean {
  return deck.disabled.length === 0 && deck.custom.length === 0;
}

/** อ่านชุดที่บันทึกไว้ ตัด id ที่ไม่มีในชุดมาตรฐานแล้ว (data อาจเปลี่ยนตามเวอร์ชัน) */
export function loadSavedDeck(builtinIds: readonly string[]): DeckChoice | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const { disabled, custom } = readOptions(JSON.parse(raw));
    const deck = { disabled: disabled.filter((id) => builtinIds.includes(id)), custom };
    return isEmptyDeck(deck) ? null : deck;
  } catch {
    return null;
  }
}

export function saveDeck(deck: DeckChoice): void {
  try {
    if (isEmptyDeck(deck)) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(deck));
  } catch {
    // โหมดส่วนตัวหรือพื้นที่เต็ม — แค่จำไม่ได้ ไม่กระทบเกม
  }
}
