'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { cn } from './cn';
import { prefersReducedMotion } from './motion';
import { CardBack, CardFace, FlipCard } from './playing-card';

export interface HoldToRevealProps {
  /** ข้อความบนหลังไพ่ (ทุกคนต้องเห็นเหมือนกัน) */
  hint: ReactNode;
  /** ปุ่มเปิดค้าง / ซ่อน สำหรับคนที่กดค้างไม่สะดวก */
  showLabel: string;
  hideLabel: string;
  /** ลายตรงกลางหลังไพ่ เช่น icon ของเกม */
  emblem?: ReactNode;
  /** ข้อความเล็กบนหลังไพ่ */
  backLabel?: string;
  /** หน้าไพ่ — render เฉพาะตอนเปิดอยู่ (และระหว่างพลิกกลับ) */
  children: ReactNode;
  className?: string;
}

/** ระยะเวลาพลิกไพ่ (ต้องตรงกับ duration-500 ของ FlipCard) */
const FLIP_MS = 500;
/** เอียงได้มากสุดกี่องศา */
const MAX_TILT = 14;
/** gyroscope: เอียงเครื่องกี่องศาถึงจะเท่ากับ MAX_TILT */
const GYRO_RANGE = 30;

const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));

/**
 * ไพ่ลับแบบ 3D: กดค้างเพื่อพลิกดูหน้าไพ่ ปล่อยแล้วพลิกกลับ หรือกดปุ่มเพื่อเปิดค้างไว้
 * กันคนข้าง ๆ เห็นจอ หลังไพ่เหมือนกันทุกคน
 *
 * - เอียงตามนิ้ว/เมาส์ และตาม gyroscope บนเครื่องที่ไม่ต้องขอ permission (Android)
 * - แจกไพ่ (บินเข้ามา) ตอน mount
 * - เคารพ prefers-reduced-motion: ไม่เอียง ไม่แจก และพลิกทันที
 * - ค่าเอียงเขียนลง CSS variable ตรง ๆ ไม่ผ่าน React state จึงไม่ re-render ทุกครั้งที่ขยับ
 */
export function HoldToReveal({
  hint,
  showLabel,
  hideLabel,
  emblem,
  backLabel,
  children,
  className,
}: HoldToRevealProps) {
  const [holding, setHolding] = useState(false);
  const [pinned, setPinned] = useState(false);
  const visible = holding || pinned;
  // หน้าไพ่อยู่ใน DOM ระหว่างเปิดและระหว่างพลิกกลับเท่านั้น
  const [faceMounted, setFaceMounted] = useState(false);

  const dealRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const pointerActive = useRef(false);
  const frame = useRef(0);

  useEffect(() => {
    if (visible) {
      setFaceMounted(true);
      return;
    }
    const t = window.setTimeout(() => setFaceMounted(false), prefersReducedMotion() ? 0 : FLIP_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  function setTilt(x: number, y: number) {
    // x, y อยู่ในช่วง [-1, 1]
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = tiltRef.current;
      if (!el) return;
      el.style.setProperty('--rx', `${(-y * MAX_TILT).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * MAX_TILT).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${((x + 1) * 50).toFixed(1)}%`);
      el.style.setProperty('--gy', `${((y + 1) * 50).toFixed(1)}%`);
    });
  }

  // แจกไพ่
  useEffect(() => {
    const el = dealRef.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
    const anim = el.animate(
      [
        { transform: 'translate(-30%, -70vh) rotate(-28deg) scale(0.7)', opacity: 0 },
        { transform: 'translate(2%, 10px) rotate(3deg) scale(1.02)', opacity: 1, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    return () => anim.cancel();
  }, []);

  // gyroscope: ใช้เฉพาะเครื่องที่ไม่ต้องขอ permission (iOS ต้องกดอนุญาต จึงข้าม)
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    if (prefersReducedMotion()) return;
    const needsPermission =
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown })
        .requestPermission === 'function';
    if (needsPermission) return;

    let base: { beta: number; gamma: number } | null = null;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null || pointerActive.current) return;
      // ท่าถือเครื่องตอนแรกคือ "ตรง" แล้วค่อย ๆ ตามท่าใหม่ช้า ๆ
      base ??= { beta: e.beta, gamma: e.gamma };
      base = { beta: base.beta * 0.98 + e.beta * 0.02, gamma: base.gamma * 0.98 + e.gamma * 0.02 };
      setTilt(
        clamp((e.gamma - base.gamma) / GYRO_RANGE, 1),
        clamp((e.beta - base.beta) / GYRO_RANGE, 1),
      );
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    // นิ้วต้องแตะอยู่ เมาส์แค่ชี้ก็เอียงได้
    if (e.pointerType !== 'mouse' && !pointerActive.current) return;
    if (prefersReducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt(
      clamp(((e.clientX - r.left) / r.width) * 2 - 1, 1),
      clamp(((e.clientY - r.top) / r.height) * 2 - 1, 1),
    );
  }

  function release() {
    pointerActive.current = false;
    setHolding(false);
    setTilt(0, 0);
  }

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div ref={dealRef} className="relative w-[min(64vw,15rem)]">
        {/* เงาบนโต๊ะ: ยกไพ่ขึ้นตอนเปิด เงาก็ห่างและจางลง */}
        <div
          aria-hidden
          className={cn(
            'absolute inset-x-2 bottom-0 top-8 rounded-3xl bg-black/45 blur-xl transition-transform duration-500 motion-reduce:transition-none dark:bg-black/70',
            visible ? 'translate-y-5 scale-95 opacity-80' : 'translate-y-2',
          )}
        />
        <div
          ref={tiltRef}
          role="button"
          tabIndex={0}
          aria-pressed={visible}
          data-testid="secret-card"
          className="relative cursor-grab touch-none select-none outline-none transition-transform duration-150 ease-out [-webkit-touch-callout:none] transform-3d active:cursor-grabbing motion-reduce:transition-none focus-visible:[&>div]:ring-4 focus-visible:[&>div]:ring-ring/50"
          style={
            {
              '--rx': '0deg',
              '--ry': '0deg',
              '--gx': '50%',
              '--gy': '50%',
              transform: 'perspective(900px) rotateX(var(--rx)) rotateY(var(--ry))',
            } as CSSProperties
          }
          onPointerDown={(e) => {
            pointerActive.current = true;
            setHolding(true);
            onPointerMove(e);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              setHolding(true);
            }
          }}
          onKeyUp={() => setHolding(false)}
        >
          <FlipCard
            flipped={visible}
            lift
            perspective={false}
            className="aspect-[5/7]"
            back={<CardBack emblem={emblem} label={backLabel} hint={hint} />}
            front={
              <CardFace emblem={emblem}>
                {faceMounted && <div className="w-full">{children}</div>}
              </CardFace>
            }
          />
        </div>
      </div>
      <button
        type="button"
        className="min-h-12 w-full py-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => setPinned((p) => !p)}
      >
        {pinned ? hideLabel : showLabel}
      </button>
    </div>
  );
}
