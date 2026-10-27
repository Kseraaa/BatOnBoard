'use client';

import { cn } from '@batonboard/ui';
import type { GameSettingsProps } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import { FIGURES } from '../data/figures';
import { DEFAULT_DISCUSSION_MS } from '../rules/constants';
import type { PoetsOptions } from '../rules/types';
import { poetsMessages } from './messages';

/** เวลาตามหากวีสายลับ (วินาที) — server ตรวจช่วงที่ถูกต้องอีกชั้น */
const DISCUSSION_CHOICES = [30, 60, 120, 180, 300];
/** จำนวนรอบต่อแมตช์ — null = ไม่จำกัด (ต้นฉบับเล่น 6 รอบ) */
const ROUND_CHOICES = [null, 3, 6, 9, 12];

function readOptions(raw: unknown): PoetsOptions {
  const o = (raw ?? {}) as Partial<PoetsOptions>;
  return {
    discussionMs: o.discussionMs ?? DEFAULT_DISCUSSION_MS,
    ...(o.rounds !== undefined && { rounds: o.rounds }),
    ...(o.hideFigure !== undefined && { hideFigure: o.hideFigure }),
    ...(o.hostPlays !== undefined && { hostPlays: o.hostPlays }),
  };
}

export function PoetsSettings({ options, locale, editable, onChange }: GameSettingsProps) {
  const m = poetsMessages[locale].settings;
  // สำเนาในเครื่อง: กดหลายครั้งติดกันก่อน server ตอบ จะได้ไม่ส่งค่าเก่าทับ
  const incoming = JSON.stringify(readOptions(options));
  const [current, setCurrent] = useState<PoetsOptions>(() => readOptions(options));
  useEffect(() => setCurrent(JSON.parse(incoming) as PoetsOptions), [incoming]);

  function update(patch: Partial<PoetsOptions>) {
    const next = { ...current, ...patch };
    if (next.rounds === undefined) delete next.rounds;
    setCurrent(next);
    onChange(next);
  }

  return (
    <div className="space-y-5">
      <Choices
        label={m.host}
        hint={m.hostHint}
        editable={editable}
        columns={2}
        testId="host-plays"
        choices={[false, true].map((plays) => ({
          key: String(plays),
          label: plays ? m.hostPlays : m.hostModerates,
          selected: plays === (current.hostPlays ?? false),
          pick: () => update({ hostPlays: plays }),
        }))}
      />
      <Choices
        label={m.discussion}
        editable={editable}
        choices={DISCUSSION_CHOICES.map((s) => ({
          key: String(s),
          label: s < 60 ? m.seconds(s) : m.minutes(s / 60),
          selected: s * 1000 === current.discussionMs,
          pick: () => update({ discussionMs: s * 1000 }),
        }))}
      />
      <Choices
        label={m.rounds}
        hint={m.roundsHint}
        editable={editable}
        testId="rounds"
        choices={ROUND_CHOICES.map((n) => ({
          key: String(n),
          label: n === null ? m.unlimited : m.roundCount(n),
          selected: n === (current.rounds ?? null),
          pick: () => update({ rounds: n ?? undefined }),
        }))}
      />
      <Choices
        label={m.figure}
        hint={m.figureHint}
        editable={editable}
        columns={2}
        choices={[false, true].map((hide) => ({
          key: String(hide),
          label: hide ? m.hideFigure : m.showFigure,
          selected: hide === (current.hideFigure ?? false),
          pick: () => update({ hideFigure: hide }),
        }))}
      />
      <div className="space-y-2">
        <p className="text-sm font-semibold">{m.figures}</p>
        <ul className="flex flex-wrap gap-1.5">
          {FIGURES.map((f) => (
            <li key={f.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">
              {f.name[locale]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Choices({
  label,
  hint,
  editable,
  testId,
  columns = 5,
  choices,
}: {
  label: string;
  hint?: string;
  editable: boolean;
  testId?: string;
  columns?: 2 | 5;
  choices: { key: string; label: string; selected: boolean; pick(): void }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
      <div
        className={cn('grid gap-1.5', columns === 2 ? 'grid-cols-2' : 'grid-cols-5')}
        role="radiogroup"
        aria-label={label}
        data-testid={testId}
      >
        {choices.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={c.selected}
            disabled={!editable}
            onClick={c.pick}
            className={cn(
              'h-11 rounded-lg px-1 text-sm font-semibold transition-colors disabled:cursor-default',
              c.selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              !editable && !c.selected && 'opacity-50',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
