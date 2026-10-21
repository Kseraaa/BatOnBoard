import type { Locale } from '@batonboard/ui';
import type { BoardData, FamilyInfo } from '../data/types';
import type { BossAction, BossView, Family } from '../rules/types';
import type { BossMessages } from './messages';

/** ของที่ทุกส่วนของหน้าจอใช้ร่วมกัน */
export interface Ctx {
  view: BossView;
  m: BossMessages;
  locale: Locale;
  board: BoardData;
  nameOf(id: string): string;
  /** ข้อมูลตระกูล ชื่อตามที่ host ตั้งไว้ในห้อง (ถ้ามี) */
  family(id: Family): FamilyInfo;
  /** เงินในกติกา (หน่วย) → ข้อความ เช่น "1,250k" */
  money(units: number): string;
  send(action: BossAction): Promise<boolean>;
  busy: boolean;
  serverOffset: number;
}

/** สัญลักษณ์ประจำตระกูล (แยกตระกูลได้โดยไม่ต้องดูสี) */
export const SYMBOLS: Record<string, string> = {
  bowl: '🍜',
  anchor: '⚓',
  coin: '🪙',
  spool: '🧵',
  truck: '🚚',
  leaf: '🌿',
};
