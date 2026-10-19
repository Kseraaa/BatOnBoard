import type { CSSProperties } from 'react';
import { avatarFor } from './avatar';
import { cn } from './cn';
import { PixelIcon } from './pixel-icon';

export interface PixelAvatarProps {
  name: string;
  className?: string;
}

/** อวตารจากชื่อ: หน้า pixel art สีตามชื่อบนพื้นสีเดียวกันแบบจาง */
export function PixelAvatar({ name, className }: PixelAvatarProps) {
  const { rows, hue } = avatarFor(name);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid size-9 shrink-0 place-items-center rounded-lg bg-[oklch(0.9_0.06_var(--hue))] p-1 text-[oklch(0.45_0.14_var(--hue))] dark:bg-[oklch(0.32_0.06_var(--hue))] dark:text-[oklch(0.8_0.13_var(--hue))]',
        className,
      )}
      style={{ '--hue': hue } as CSSProperties}
    >
      <PixelIcon rows={rows} className="size-full" />
    </span>
  );
}
