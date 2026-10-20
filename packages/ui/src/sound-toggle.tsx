'use client';

import { Button } from './button';
import { useFeedback } from './feedback';

export interface SoundToggleProps {
  /** ข้อความของปุ่มตอนเปิดเสียงอยู่ (กดแล้วปิด) และตอนปิดอยู่ (กดแล้วเปิด) */
  labels: { mute: string; unmute: string };
  className?: string;
}

/** ปุ่มเปิด/ปิดเสียงและการสั่น (ค่าเดียวทั้งแพลตฟอร์ม) */
export function SoundToggle({ labels, className }: SoundToggleProps) {
  const { muted, toggle } = useFeedback();
  return (
    <Button
      size="sm"
      variant="ghost"
      className={className}
      aria-pressed={!muted}
      aria-label={muted ? labels.unmute : labels.mute}
      onClick={toggle}
    >
      <span aria-hidden>{muted ? '🔇' : '🔊'}</span>
    </Button>
  );
}
