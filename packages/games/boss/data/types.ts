import type { Family, SpaceDef } from '../rules';

export interface LocalizedText {
  th: string;
  en: string;
}

export interface FamilyInfo {
  id: Family;
  /** ชื่อตระกูล */
  name: LocalizedText;
  /** ธุรกิจของตระกูล (ช่วยจำ) */
  trade: LocalizedText;
  /** สีหลัก (#rrggbb) */
  color: string;
  /** สัญลักษณ์ประจำตระกูล แยกตระกูลได้โดยไม่ต้องดูสี (client วาดเป็น pixel art) */
  symbol: string;
}

export interface SpaceData extends SpaceDef {
  /** ชื่อดีลที่แสดงบนช่อง */
  name: LocalizedText;
}

export interface BoardData {
  id: string;
  name: LocalizedText;
  families: FamilyInfo[];
  /** 16 ช่อง ตามเข็มนาฬิกา */
  spaces: SpaceData[];
  /** ราคาหุ้นของดีลที่ 1–15 หน่วยเป็น `moneyUnit` บาท */
  dealValues: number[];
  /** หน้าลูกเต๋าที่ทำให้เกมจบ หลังดีลที่ 10–14 (เกมสั้น: 5–9) */
  endFaces: number[][];
  /** เงิน 1 หน่วยในกติกา = กี่บาท (client ใช้แสดงผล) */
  moneyUnit: number;
}
