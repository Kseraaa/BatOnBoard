'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface HoldToRevealProps {
  /** ข้อความบนการ์ดตอนปิดอยู่ */
  hint: ReactNode;
  /** ปุ่มเปิดค้าง / ซ่อน สำหรับคนที่กดค้างไม่สะดวก */
  showLabel: string;
  hideLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * การ์ดลับ: กดค้างเพื่อดู ปล่อยแล้วซ่อน หรือกดปุ่มเพื่อเปิดค้างไว้
 * กันคนข้าง ๆ เห็นจอ
 */
export function HoldToReveal({
  hint,
  showLabel,
  hideLabel,
  children,
  className,
}: HoldToRevealProps) {
  const [holding, setHolding] = useState(false);
  const [pinned, setPinned] = useState(false);
  const visible = holding || pinned;

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={visible}
        data-testid="secret-card"
        className={cn(
          'flex min-h-40 touch-none select-none items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors [-webkit-touch-callout:none]',
          visible ? 'border-primary bg-primary/5' : 'border-border bg-muted',
        )}
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') setHolding(true);
        }}
        onKeyUp={() => setHolding(false)}
      >
        {visible ? (
          <div className="w-full">{children}</div>
        ) : (
          <div className="text-muted-foreground">{hint}</div>
        )}
      </div>
      <button
        type="button"
        className="w-full py-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => setPinned((p) => !p)}
      >
        {pinned ? hideLabel : showLabel}
      </button>
    </div>
  );
}
