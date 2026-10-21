'use client';

import { cn } from '@batonboard/ui';
import type { GameSettingsProps } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import { DEFAULT_BOARD_ID, getBoard } from '../data';
import { DEFAULT_NEGOTIATION_MS, MAX_FAMILY_NAME } from '../rules/constants';
import type { BossOptions, Family, GameLength } from '../rules/types';
import { HowToPlay } from './how-to-play';
import { bossMessages } from './messages';

/** ตัวเลือกเวลาเจรจา (นาที, null = ไม่จำกัด) — server ตรวจช่วงอีกชั้น */
const NEGOTIATION_CHOICES: (number | null)[] = [3, 5, 10, null];
const LENGTHS: GameLength[] = ['full', 'short'];

export function readOptions(raw: unknown): BossOptions {
  const o = (raw ?? {}) as Partial<BossOptions>;
  return {
    negotiationMs: o.negotiationMs === undefined ? DEFAULT_NEGOTIATION_MS : o.negotiationMs,
    length: o.length === 'short' ? 'short' : 'full',
    ...(o.familyNames ? { familyNames: o.familyNames } : {}),
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
      <HowToPlay m={bossMessages[locale]} />
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
      <FamilyNames
        locale={locale}
        editable={editable}
        names={current.familyNames ?? {}}
        onChange={(familyNames) => update({ familyNames })}
      />
    </div>
  );
}

/** host ตั้งชื่อตระกูลเอง — ส่งตอนออกจากช่อง (ไม่ส่งทุกตัวอักษร) ชื่อว่างหรือเหมือนเดิม = ใช้ชื่อเดิม */
function FamilyNames({
  locale,
  editable,
  names,
  onChange,
}: {
  locale: GameSettingsProps['locale'];
  editable: boolean;
  names: Partial<Record<Family, string>>;
  onChange(names: Partial<Record<Family, string>>): void;
}) {
  const m = bossMessages[locale].settings;
  const board = getBoard(DEFAULT_BOARD_ID);
  const [draft, setDraft] = useState(names);
  const [error, setError] = useState<string | null>(null);
  const incoming = JSON.stringify(names);
  useEffect(() => setDraft(JSON.parse(incoming) as Partial<Record<Family, string>>), [incoming]);
  if (!board) return null;

  function commit(next: Partial<Record<Family, string>>) {
    const cleaned: Partial<Record<Family, string>> = {};
    for (const f of board?.families ?? []) {
      const name = next[f.id]?.trim().replace(/\s+/g, ' ') ?? '';
      if (name !== '' && name !== f.name[locale]) cleaned[f.id] = name;
    }
    const all = (board?.families ?? []).map((f) =>
      (cleaned[f.id] ?? f.name[locale]).toLocaleLowerCase(),
    );
    if (new Set(all).size !== all.length) return setError(m.duplicateName);
    setError(null);
    if (JSON.stringify(cleaned) !== incoming) onChange(cleaned);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{m.familyNames}</p>
      {editable && <p className="text-xs text-muted-foreground">{m.familyNamesHelp}</p>}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {board.families.map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full"
              style={{ backgroundColor: f.color }}
            />
            <input
              value={draft[f.id] ?? ''}
              placeholder={f.name[locale]}
              maxLength={MAX_FAMILY_NAME}
              disabled={!editable}
              aria-label={m.familyNameLabel(f.name[locale])}
              onChange={(e) => setDraft({ ...draft, [f.id]: e.target.value })}
              onBlur={() => commit(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm font-semibold disabled:border-transparent disabled:bg-muted/50 disabled:placeholder:text-foreground"
              style={{ color: f.color }}
            />
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
      {editable && Object.keys(names).length > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => {
            setDraft({});
            setError(null);
            onChange({});
          }}
        >
          {m.resetNames}
        </button>
      )}
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
