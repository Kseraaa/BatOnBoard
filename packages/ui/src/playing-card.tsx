import type { ReactNode } from 'react';
import { cn } from './cn';

export interface FlipCardProps {
  flipped: boolean;
  /** ด้านที่เห็นตอนยังไม่พลิก */
  back: ReactNode;
  /** ด้านที่เห็นหลังพลิก */
  front: ReactNode;
  /** ยกไพ่ขึ้นตอนพลิก (ใช้กับไพ่ที่มีเงาบนโต๊ะ) */
  lift?: boolean;
  /** ใส่ perspective ให้ตัวเอง — ปิดเมื่อ parent มี perspective อยู่แล้ว */
  perspective?: boolean;
  className?: string;
}

/**
 * ไพ่ 3D สองหน้า พลิกด้วย CSS transform ล้วน ขนาดมาจาก className (เช่น aspect-[5/7])
 * prefers-reduced-motion = พลิกทันที
 * ห้ามใส่ filter (เช่น drop-shadow) ที่ตัวนี้ เพราะจะทำให้ 3D แบนและเห็นหลังไพ่ตลอด ให้ใส่ที่ wrapper แทน
 */
export function FlipCard({
  flipped,
  back,
  front,
  lift = false,
  perspective = true,
  className,
}: FlipCardProps) {
  // ใช้ style แทน class เพราะ Tailwind สแกนเจอแค่ class ที่เขียนเต็ม ๆ
  const transform = [
    perspective ? 'perspective(800px)' : '',
    flipped && lift ? 'translateZ(24px)' : 'translateZ(0)',
    flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
  ].join(' ');
  return (
    <div
      className={cn(
        'relative rounded-2xl transition-transform duration-500 ease-[cubic-bezier(.3,1.4,.5,1)] transform-3d motion-reduce:transition-none',
        className,
      )}
      style={{ transform }}
    >
      <div className="absolute inset-0 backface-hidden">{back}</div>
      <div className="absolute inset-0 [transform:rotateY(180deg)] backface-hidden">{front}</div>
    </div>
  );
}

export interface CardBackProps {
  /** ลายตรงกลาง เช่น icon ของเกม */
  emblem?: ReactNode;
  /** ข้อความเล็กด้านบน */
  label?: ReactNode;
  /** ข้อความด้านล่าง */
  hint?: ReactNode;
  className?: string;
}

/** หลังไพ่: ลายตาราง + ลายกลาง เหมือนกันทุกใบ */
export function CardBack({ emblem, label, hint, className }: CardBackProps) {
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-2xl border border-black/20 bg-[oklch(0.32_0.07_275)] p-2.5 text-[oklch(0.9_0.05_275)] shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]',
        className,
      )}
    >
      <div className="flex h-full flex-col items-center justify-between rounded-xl border-2 border-current/40 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgb(255_255_255/0.06)_6px_12px),repeating-linear-gradient(-45deg,transparent_0_6px,rgb(255_255_255/0.06)_6px_12px)] p-3 text-center">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.3em] opacity-80">
          {label}
        </span>
        <div className="grid aspect-square w-2/5 place-items-center rounded-full border-2 border-current/40 bg-[oklch(0.32_0.07_275)] p-[8%]">
          {emblem}
        </div>
        <span className="text-sm leading-snug">{hint}</span>
      </div>
      <Glare />
    </div>
  );
}

export interface CardFaceProps {
  /** ลายเล็กที่มุมบนซ้ายและล่างขวา */
  emblem?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** หน้าไพ่: พื้นกระดาษ กรอบใน และลายที่มุม */
export function CardFace({ emblem, children, className }: CardFaceProps) {
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-2xl border border-border bg-[linear-gradient(160deg,var(--card),var(--muted))] p-2.5 text-card-foreground',
        className,
      )}
    >
      <div className="relative flex h-full items-center justify-center rounded-xl border-2 border-border p-3 text-center">
        {emblem && (
          <>
            <span className="absolute left-2 top-2 size-5 text-muted-foreground/60">{emblem}</span>
            <span className="absolute bottom-2 right-2 size-5 rotate-180 text-muted-foreground/60">
              {emblem}
            </span>
          </>
        )}
        {children}
      </div>
      <Glare />
    </div>
  );
}

/** แสงสะท้อน — เลื่อนตาม --gx/--gy ถ้ามีคนตั้ง (เช่นไพ่ที่เอียงได้) */
function Glare() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--gx,50%)_var(--gy,30%),rgb(255_255_255/0.28),transparent_55%)] mix-blend-soft-light motion-reduce:hidden"
    />
  );
}
