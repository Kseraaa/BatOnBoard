import type { CardKind } from '../rules/types';

/**
 * ภาพพื้นหลังของไพ่แต่ละชนิด (URL) ไม่ใส่ = ใช้สีและสัญลักษณ์ตามชนิด
 * ไฟล์อยู่ที่ `apps/web/public/games/boss/cards/` ภาพแนวตั้ง 3:4 (เช่น 300×400 หรือ 600×800)
 * ข้อความบนไพ่วางทับภาพ จึงควรเว้นพื้นที่ด้านบนและล่างของภาพไว้
 * ชุดปัจจุบันเป็น low poly SVG ที่สร้างด้วยสคริปต์ (สามเหลี่ยมแรเงาตามทิศแสง) เปลี่ยนเป็นภาพวาดเองได้โดยแก้ path
 * ไพ่ตระกูลไม่มีภาพ ใช้สีของตระกูล (ชื่อตระกูลตั้งเองได้ ภาพจึงไม่ควรผูกกับตระกูล)
 */
export const CARD_ART: Partial<Record<CardKind, string>> = {
  travel: '/games/boss/cards/travel.svg',
  takeover: '/games/boss/cards/takeover.svg',
  recruit: '/games/boss/cards/recruit.svg',
  stop: '/games/boss/cards/stop.svg',
};

/** สีและสัญลักษณ์ของไพ่แต่ละชนิด (ไพ่ตระกูลใช้สีของตระกูลแทน) */
export const CARD_STYLE: Record<CardKind, { icon: string; from: string; to: string }> = {
  clan: { icon: '🏛️', from: '#64748b', to: '#334155' },
  travel: { icon: '✈️', from: '#38bdf8', to: '#0369a1' },
  takeover: { icon: '👑', from: '#fbbf24', to: '#b45309' },
  recruit: { icon: '🤝', from: '#a78bfa', to: '#6d28d9' },
  stop: { icon: '✋', from: '#f87171', to: '#b91c1c' },
};
