'use client';

import { cn } from '@batonboard/ui';
import type { GameSettingsProps } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import { DEFAULT_NEGOTIATION_MS } from '../rules/constants';
import type { BossOptions, GameLength } from '../rules/types';
import { bossMessages } from './messages';

/** ตัวเลือกเวลาเจรจา (นาที, null = ไม่จำกัด) — server ตรวจช่วงอีกชั้น */
const NEGOTIATION_CHOICES: (number | null)[] = [3, 5, 10, null];
const LENGTHS: GameLength[] = ['full', 'short'];

export function readOptions(raw: unknown): BossOptions {
  const o = (raw ?? {}) as Partial<BossOptions>;
  return {
    negotiationMs: o.negotiationMs === undefined ? DEFAULT_NEGOTIATION_MS : o.negotiationMs,
    length: o.length === 'short' ? 'short' : 'full',
  };
}

export function BossSettings({ options, locale, editable, onChange }: GameSettingsProps) {
  const m = bossMessages[locale].settings;
  // สำเนาในเครื่อง: กดหลายครั้งติดกันก่อน server ตอบ จะได้ไม่ส่งค่าเก่าทับ
  const incoming = JSON.stringify(readOptions(options));
  const [current, setCurrent] = useState<BossOptions>(() => readOptions(options));
  useEffect(() => setCurrent(JSON.parse(incoming) as BossOptions), [incoming]);

  function update(patch: Partial<BossOptions>) {
    const next = { ...current, ...patch };
    setCurrent(next);
    onChange(next);
  }

  return (
    <div className="space-y-5">
      <Choices
        label={m.negotiation}
        editable={editable}
        items={NEGOTIATION_CHOICES.map((min) => ({
          key: String(min),
          label: min === null ? m.noLimit : m.minutes(min),
          selected: (min === null ? null : min * 60_000) === current.negotiationMs,
          pick: () => update({ negotiationMs: min === null ? null : min * 60_000 }),
        }))}
      />
      <Choices
        label={m.length}
        editable={editable}
        items={LENGTHS.map((length) => ({
          key: length,
          label: m[length],
          selected: length === current.length,
          pick: () => update({ length }),
        }))}
      />
    </div>
  );
}

function Choices({
  label,
  editable,
  items,
}: {
  label: string;
  editable: boolean;
  items: { key: string; label: string; selected: boolean; pick(): void }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={label}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={item.selected}
            disabled={!editable}
            onClick={item.pick}
            className={cn(
              'min-h-11 rounded-lg px-1 text-sm font-semibold transition-colors disabled:cursor-default',
              item.selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
              !editable && !item.selected && 'opacity-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
