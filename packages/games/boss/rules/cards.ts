import {
  CLAN_PER_FAMILY,
  FAMILIES,
  RECRUIT_CARDS,
  STOP_CARDS,
  TAKEOVER_CARDS,
  TRAVEL_ANY,
  TRAVEL_PER_FAMILY,
} from './constants';
import type { CardId, CardKind, Family } from './types';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** ไพ่อิทธิพลทั้งกอง 98 ใบ เรียงตามชนิด (setup สับเอง) */
export function fullDeck(): CardId[] {
  return [
    ...FAMILIES.flatMap((f) => range(CLAN_PER_FAMILY).map((i) => `clan-${f}-${i}`)),
    ...FAMILIES.flatMap((f) => range(TRAVEL_PER_FAMILY).map((i) => `travel-${f}-${i}`)),
    ...range(TRAVEL_ANY).map((i) => `travel-any-${i}`),
    ...range(RECRUIT_CARDS).map((i) => `recruit-${i}`),
    ...range(TAKEOVER_CARDS).map((i) => `takeover-${i}`),
    ...range(STOP_CARDS).map((i) => `stop-${i}`),
  ];
}

export function cardKind(card: CardId): CardKind | null {
  const kind = card.split('-')[0];
  switch (kind) {
    case 'clan':
    case 'travel':
    case 'recruit':
    case 'takeover':
    case 'stop':
      return kind;
    default:
      return null;
  }
}

/** ตระกูลของไพ่ตระกูลหรือไพ่ไปเที่ยว (`null` = ไม่มีตระกูล หรือไปเที่ยวแบบใช้กับใครก็ได้) */
export function cardFamily(card: CardId): Family | null {
  const family = card.split('-')[1];
  return (FAMILIES as readonly string[]).includes(family ?? '') ? (family as Family) : null;
}
