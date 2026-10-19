import type { Locale } from '@batonboard/ui';
import type { LocationData } from '../data';
import { MAX_CUSTOM_LOCATIONS } from '../rules/constants';
import type { CustomLocation } from '../rules/types';
import { checkCustomLocation } from './custom-location';
import type { CustomLocationError } from './custom-location';
import { GAME_DISPLAY_NAME, spyfallMessages } from './messages';

/**
 * ชุดสถานที่ในรูปข้อความที่คนอ่านออก — ส่งต่อใน LINE แล้ววางกลับได้ หรือพิมพ์เองก็ได้
 *
 *   ชุดสถานที่ «ใครคือสายลับ» · BatOnBoard
 *   ไม่ใช้: ตลาดน้ำ, ร้านหมูกระทะ
 *   # คาเฟ่แมว
 *   - บาริสต้า
 *   - ทาสแมว
 *
 * สถานที่ในชุดมาตรฐานอ้างด้วยชื่อ (ไทยหรืออังกฤษก็ได้) ไม่ใช่ id จึงอ่านง่าย
 */

export interface DeckChoice {
  /** id ในชุดมาตรฐานที่ไม่ใช้ */
  disabled: string[];
  custom: CustomLocation[];
}

export type ImportResult =
  | { ok: true; deck: DeckChoice }
  | { ok: false; error: 'empty' }
  | { ok: false; error: 'tooMany' }
  | { ok: false; error: 'unknown'; names: string[] }
  | { ok: false; error: 'location'; name: string; problem: CustomLocationError };

const OFF_LABELS = Object.values(spyfallMessages).map((m) => m.share.off);
const ROLE_BULLET = /^[-•*]\s*/;

export function exportDeck(
  deck: DeckChoice,
  builtin: readonly LocationData[],
  locale: Locale,
): string {
  const m = spyfallMessages[locale].share;
  const off = builtin.filter((l) => deck.disabled.includes(l.id)).map((l) => l.name[locale]);
  return [
    m.header(GAME_DISPLAY_NAME[locale]),
    ...(off.length > 0 ? [`${m.off} ${off.join(', ')}`] : []),
    ...deck.custom.flatMap((c) => [`# ${c.name}`, ...c.roles.map((r) => `- ${r}`)]),
  ].join('\n');
}

export function importDeck(text: string, builtin: readonly LocationData[]): ImportResult {
  const disabled = new Set<string>();
  const unknown: string[] = [];
  const drafts: { name: string; roles: string[] }[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const offLabel = OFF_LABELS.find((label) => line.startsWith(label));
    if (offLabel !== undefined) {
      for (const name of line.slice(offLabel.length).split(',')) {
        const wanted = name.trim().toLowerCase();
        if (wanted === '') continue;
        const loc = builtin.find((l) =>
          Object.values(l.name).some((n) => n.toLowerCase() === wanted),
        );
        if (loc) disabled.add(loc.id);
        else unknown.push(name.trim());
      }
    } else if (line.startsWith('#')) {
      drafts.push({ name: line.replace(/^#+\s*/, ''), roles: [] });
    } else {
      // บรรทัดอื่นใต้สถานที่ = บทบาท (มีขีดนำหน้าหรือไม่ก็ได้) ก่อนสถานที่แรก = หัวข้อ ข้ามไป
      drafts.at(-1)?.roles.push(line.replace(ROLE_BULLET, ''));
    }
  }

  if (unknown.length > 0) return { ok: false, error: 'unknown', names: unknown };
  if (disabled.size === 0 && drafts.length === 0) return { ok: false, error: 'empty' };
  if (drafts.length > MAX_CUSTOM_LOCATIONS) return { ok: false, error: 'tooMany' };

  const custom: CustomLocation[] = [];
  for (const draft of drafts) {
    const roles = draft.roles.map((r) => r.trim()).filter((r) => r !== '');
    const problem = checkCustomLocation({ name: draft.name, roles }, custom, null);
    if (problem) return { ok: false, error: 'location', name: draft.name, problem };
    custom.push({ id: `custom-${custom.length + 1}`, name: draft.name.trim(), roles });
  }
  return { ok: true, deck: { disabled: [...disabled], custom } };
}
