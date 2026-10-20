import { redirect } from 'next/navigation';

/**
 * หน้าเลือกเกมเดิม — เลือกเกมที่หน้าหลักแล้ว จึงเหลือแค่พาลิงก์เก่าไปที่ใหม่
 * `/games?game=<id>` → `/play/<id>`, `/games` → ตารางเกมบนหน้าหลัก
 */
export default async function GamesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ game?: string | string[] }>;
}) {
  const { game } = await searchParams;
  const id = Array.isArray(game) ? game[0] : game;
  redirect(id ? `/play/${encodeURIComponent(id)}` : '/#games');
}
