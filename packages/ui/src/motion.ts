/** ผู้ใช้ตั้งให้ลดการเคลื่อนไหวไว้หรือไม่ (ฝั่ง server ถือว่าไม่) */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
