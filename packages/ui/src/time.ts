/**
 * เวลาที่เหลือ (ms) โดยชดเชยนาฬิกาเครื่อง
 * serverOffset = serverNow - เวลาเครื่องตอนได้รับข้อความ
 */
export function remainingMs(deadline: number, serverOffset: number, clientNow: number): number {
  return Math.max(0, deadline - (clientNow + serverOffset));
}

/** 125000 → "2:05" */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
