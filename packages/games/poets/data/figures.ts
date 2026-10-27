/**
 * ชื่อและคำอธิบายโวหาร — client import ไฟล์นี้ได้ (ไม่มีประโยค)
 * ห้าม import `./sentences` จาก client ไม่งั้นรู้ได้จาก bundle ว่าประโยคไหนเป็นโวหารอะไร
 */
import type { LocalizedText } from '@batonboard/ui';

export interface FigureData {
  /** slug ไม่ซ้ำทั้งชุด */
  id: string;
  name: LocalizedText;
  /** คำอธิบายสั้น ๆ แสดงบนการ์ดและตอนเฉลย */
  hint: LocalizedText;
}

export const FIGURE_SET_ID = 'batonboard-thai-figures-v1';

export const FIGURES: readonly FigureData[] = [
  {
    id: 'simile',
    name: { th: 'อุปมาโวหาร', en: 'Simile' },
    hint: {
      th: 'เปรียบเหมือน (เหมือน ดุจ ดั่ง ราวกับ เฉกเช่น)',
      en: 'Compares using “like” or “as”',
    },
  },
  {
    id: 'metaphor',
    name: { th: 'อุปลักษณ์', en: 'Metaphor' },
    hint: { th: 'เปรียบเป็น (เป็น คือ)', en: 'Says one thing is another' },
  },
  {
    id: 'onomatopoeia',
    name: { th: 'สัทพจน์', en: 'Onomatopoeia' },
    hint: { th: 'เลียนเสียงธรรมชาติ', en: 'Imitates natural sounds' },
  },
  {
    id: 'personification',
    name: { th: 'บุคคลวัต', en: 'Personification' },
    hint: {
      th: 'บุคลาธิษฐาน: สิ่งที่ไม่ใช่มนุษย์แสดงกิริยาอาการแบบมนุษย์',
      en: 'Non-human things act like people',
    },
  },
  {
    id: 'hyperbole',
    name: { th: 'อติพจน์', en: 'Hyperbole' },
    hint: { th: 'อธิพจน์: กล่าวเกินจริง', en: 'Exaggerates beyond reality' },
  },
  {
    id: 'understatement',
    name: { th: 'อวพจน์', en: 'Understatement' },
    hint: { th: 'กล่าวน้อยกว่าความเป็นจริง', en: 'Says less than the truth' },
  },
  {
    id: 'symbol',
    name: { th: 'สัญลักษณ์', en: 'Symbol' },
    hint: { th: 'ใช้สิ่งหนึ่งแทนอีกสิ่งหนึ่ง ไม่กล่าวตรง ๆ', en: 'One thing stands for another' },
  },
  {
    id: 'metonymy',
    name: { th: 'นามนัย', en: 'Metonymy' },
    hint: { th: 'ดึงจุดเด่นมากล่าวแทนสิ่งทั้งหมด', en: 'A notable feature stands for the whole' },
  },
  {
    id: 'paradox',
    name: { th: 'ปฏิพากย์', en: 'Paradox' },
    hint: { th: 'ใช้คำที่มีความหมายตรงกันข้ามมาไว้ด้วยกัน', en: 'Puts opposite words together' },
  },
];

export function getFigure(id: string): FigureData | undefined {
  return FIGURES.find((f) => f.id === id);
}
