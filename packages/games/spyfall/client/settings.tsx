'use client';

import { cn } from '@batonboard/ui';
import type { GameSettingsProps } from '@batonboard/ui';
import { DEFAULT_DURATION_MS } from '../rules/constants';
import { spyfallMessages } from './messages';

/** ตัวเลือกเวลาถามตอบ (นาที) — server ตรวจช่วงที่ถูกต้องอีกชั้น */
const DURATION_CHOICES = [5, 6, 8, 10, 12];

function durationOf(options: unknown): number {
  if (typeof options === 'object' && options !== null && 'durationMs' in options) {
    const value = options.durationMs;
    if (typeof value === 'number') return value;
  }
  return DEFAULT_DURATION_MS;
}

export function SpyfallSettings({ options, locale, editable, onChange }: GameSettingsProps) {
  const m = spyfallMessages[locale];
  const current = durationOf(options);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{m.settings.duration}</p>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={m.settings.duration}>
        {DURATION_CHOICES.map((min) => {
          const ms = min * 60_000;
          const selected = ms === current;
          return (
            <button
              key={min}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!editable}
              onClick={() => onChange({ durationMs: ms })}
              className={cn(
                'h-11 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default',
                selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                !editable && !selected && 'opacity-50',
              )}
            >
              {m.settings.minutes(min)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
