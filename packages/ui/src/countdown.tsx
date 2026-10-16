'use client';

import { useEffect, useState } from 'react';
import { cn } from './cn';
import { formatClock, remainingMs } from './time';

export interface CountdownProps {
  /** เวลาหมด (ms epoch ของ server) — null = หยุดเวลาอยู่ */
  deadline: number | null;
  /** เวลาที่เหลือตอนหยุด */
  pausedRemaining?: number | null;
  serverOffset: number;
  className?: string;
  /** เหลือน้อยกว่านี้ให้เปลี่ยนสีเตือน */
  warnBelowMs?: number;
}

export function Countdown({
  deadline,
  pausedRemaining = null,
  serverOffset,
  className,
  warnBelowMs = 60_000,
}: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  const paused = deadline === null;
  const ms = paused ? (pausedRemaining ?? 0) : remainingMs(deadline, serverOffset, now);

  return (
    <span
      role="timer"
      className={cn(
        'font-mono text-3xl font-bold tabular-nums',
        paused && 'opacity-60',
        !paused && ms < warnBelowMs && 'text-destructive',
        className,
      )}
    >
      {formatClock(ms)}
    </span>
  );
}
