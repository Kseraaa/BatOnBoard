import type { BoardData, FamilyInfo, SpaceData } from './types';

/**
 * กระดานชุดแรก: ดีลธุรกิจในเมืองไทย เขียนเองทั้งหมด (ไม่ได้มาจากเกมต้นฉบับ)
 * ยิ่งต้องใช้หลายตระกูล ยิ่งได้หุ้นมาก (2 ตระกูล ≈ 2–3 หุ้น … 6 ตระกูล = 10 หุ้น)
 */
const families: FamilyInfo[] = [
  {
    id: 'red',
    name: { th: 'ตระกูลรัตนชัย', en: 'Rattanachai' },
    trade: { th: 'ร้านอาหาร', en: 'Restaurants' },
    color: '#d1343b',
    symbol: 'bowl',
  },
  {
    id: 'blue',
    name: { th: 'ตระกูลวารีวงศ์', en: 'Wareewong' },
    trade: { th: 'เดินเรือ', en: 'Shipping' },
    color: '#2563c9',
    symbol: 'anchor',
  },
  {
    id: 'yellow',
    name: { th: 'ตระกูลสุวรรณกิจ', en: 'Suwannakit' },
    trade: { th: 'ค้าทอง', en: 'Gold' },
    color: '#e0a800',
    symbol: 'coin',
  },
  {
    id: 'purple',
    name: { th: 'ตระกูลไหมทอง', en: 'Maithong' },
    trade: { th: 'ผ้าไหม', en: 'Silk' },
    color: '#7e3fb8',
    symbol: 'spool',
  },
  {
    id: 'orange',
    name: { th: 'ตระกูลอรุณยนต์', en: 'Arunyon' },
    trade: { th: 'ขนส่ง', en: 'Transport' },
    color: '#ea6c1e',
    symbol: 'truck',
  },
  {
    id: 'green',
    name: { th: 'ตระกูลไพรสณฑ์', en: 'Praison' },
    trade: { th: 'เกษตร', en: 'Farming' },
    color: '#2f9e44',
    symbol: 'leaf',
  },
];

const spaces: SpaceData[] = [
  {
    id: 'boat-noodles',
    name: { th: 'ก๋วยเตี๋ยวเรือแฟรนไชส์', en: 'Boat Noodle Franchise' },
    shares: 2,
    required: ['red'],
    optional: { from: ['blue', 'orange'], count: 1 },
  },
  {
    id: 'rice-pier',
    name: { th: 'ท่าเรือข้าวสาร', en: 'Rice Pier' },
    shares: 3,
    required: ['blue', 'green'],
    optional: null,
  },
  {
    id: 'gold-shop',
    name: { th: 'ร้านทองเยาวราช', en: 'Chinatown Gold Shop' },
    shares: 2,
    required: ['yellow'],
    optional: { from: ['red', 'purple', 'orange'], count: 1 },
  },
  {
    id: 'silk-mill',
    name: { th: 'โรงทอผ้าไหม', en: 'Silk Mill' },
    shares: 4,
    required: ['purple', 'orange'],
    optional: { from: ['yellow', 'green'], count: 1 },
  },
  {
    id: 'night-bus',
    name: { th: 'รถทัวร์สายเหนือ', en: 'Northern Night Bus' },
    shares: 3,
    required: ['orange', 'green'],
    optional: null,
  },
  {
    id: 'night-market',
    name: { th: 'ตลาดนัดกลางคืน', en: 'Night Market' },
    shares: 6,
    required: ['red', 'yellow'],
    optional: { from: ['blue', 'purple', 'green'], count: 2 },
  },
  {
    id: 'durian-orchard',
    name: { th: 'สวนทุเรียน', en: 'Durian Orchard' },
    shares: 2,
    required: ['green'],
    optional: { from: ['orange', 'purple'], count: 1 },
  },
  {
    id: 'beach-resort',
    name: { th: 'รีสอร์ตริมหาด', en: 'Beach Resort' },
    shares: 4,
    required: ['blue', 'purple'],
    optional: { from: ['red', 'yellow'], count: 1 },
  },
  {
    id: 'department-store',
    name: { th: 'ห้างสรรพสินค้า', en: 'Department Store' },
    shares: 8,
    required: ['red', 'blue', 'yellow'],
    optional: { from: ['purple', 'orange', 'green'], count: 2 },
  },
  {
    id: 'rice-mill',
    name: { th: 'โรงสีข้าว', en: 'Rice Mill' },
    shares: 3,
    required: ['green', 'yellow'],
    optional: null,
  },
  {
    id: 'airline',
    name: { th: 'สายการบินราคาประหยัด', en: 'Budget Airline' },
    shares: 6,
    required: ['blue', 'orange'],
    optional: { from: ['red', 'purple', 'green'], count: 2 },
  },
  {
    id: 'coffee-chain',
    name: { th: 'ร้านกาแฟสด', en: 'Coffee Chain' },
    shares: 2,
    required: ['purple'],
    optional: { from: ['red', 'green'], count: 1 },
  },
  {
    id: 'condo',
    name: { th: 'คอนโดกลางเมือง', en: 'City Condo' },
    shares: 4,
    required: ['yellow', 'purple'],
    optional: { from: ['blue', 'orange'], count: 1 },
  },
  {
    id: 'shrimp-farm',
    name: { th: 'ฟาร์มกุ้ง', en: 'Shrimp Farm' },
    shares: 2,
    required: ['blue'],
    optional: { from: ['green', 'yellow'], count: 1 },
  },
  {
    id: 'sky-train',
    name: { th: 'รถไฟฟ้าสายใหม่', en: 'New Sky Train Line' },
    shares: 6,
    required: ['orange', 'red', 'green'],
    optional: { from: ['blue', 'yellow', 'purple'], count: 1 },
  },
  {
    id: 'theme-park',
    name: { th: 'สวนสนุกแห่งชาติ', en: 'National Theme Park' },
    shares: 10,
    required: ['red', 'blue', 'yellow', 'purple', 'orange', 'green'],
    optional: null,
  },
];

export const cityV1: BoardData = {
  id: 'batonboard-city-v1',
  name: { th: 'ดีลเมืองไทย', en: 'Thai City Deals' },
  families,
  spaces,
  // หน่วยละ 1,000 บาท (แสดงเป็น k อ่านง่ายกว่าหลักล้าน): ดีลแรก 10k/หุ้น ดีลที่ 15 = 50k/หุ้น
  dealValues: [10, 12, 14, 16, 18, 20, 22, 25, 28, 31, 34, 38, 42, 46, 50],
  // หลังดีลที่ 10 จบ 1/6 → ดีลที่ 14 จบ 5/6 (ถึงดีลที่ 15 ราว 1.5%)
  endFaces: [[6], [5, 6], [4, 5, 6], [3, 4, 5, 6], [2, 3, 4, 5, 6]],
  moneyUnit: 1_000,
};
