'use client';

import { Button, cn, Input } from '@batonboard/ui';
import type { GameSettingsProps } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import { DEFAULT_LOCATION_SET_ID, getLocationSet } from '../data';
import { MIN_DECK_SIZE } from '../rules/constants';
import type { SpyfallOptions } from '../rules/types';
import { checkCustomLocation, nextCustomId, parseRoles } from './custom-location';
import type { CustomLocationError } from './custom-location';
import { readOptions } from './deck';
import { spyfallMessages } from './messages';

/** ตัวเลือกเวลาถามตอบ (นาที) — server ตรวจช่วงที่ถูกต้องอีกชั้น */
const DURATION_CHOICES = [5, 6, 8, 10, 12];

type Options = Required<SpyfallOptions>;

export function SpyfallSettings({ options, locale, editable, onChange }: GameSettingsProps) {
  const m = spyfallMessages[locale].settings;
  // สำเนาในเครื่อง: กดหลายครั้งติดกันก่อน server ตอบ จะได้ไม่ส่งค่าเก่าทับ
  const incoming = JSON.stringify(readOptions(options));
  const [current, setCurrent] = useState<Options>(() => readOptions(options));
  useEffect(() => setCurrent(JSON.parse(incoming) as Options), [incoming]);

  const [error, setError] = useState<string | null>(null);
  const builtin = getLocationSet(DEFAULT_LOCATION_SET_ID)?.locations ?? [];
  const deckSize = builtin.length - current.disabled.length + current.custom.length;

  function update(patch: Partial<Options>): boolean {
    const next = { ...current, ...patch };
    if (builtin.length - next.disabled.length + next.custom.length < MIN_DECK_SIZE) {
      setError(m.errors.minDeck);
      return false;
    }
    setError(null);
    setCurrent(next);
    onChange(next);
    return true;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold">{m.duration}</p>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={m.duration}>
          {DURATION_CHOICES.map((min) => {
            const ms = min * 60_000;
            const selected = ms === current.durationMs;
            return (
              <button
                key={min}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!editable}
                onClick={() => update({ durationMs: ms })}
                className={cn(
                  'h-11 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                  !editable && !selected && 'opacity-50',
                )}
              >
                {m.minutes(min)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">{m.locations}</p>
          <p className="text-xs text-muted-foreground" data-testid="deck-count">
            {m.deckCount(deckSize)}
          </p>
        </div>

        <BuiltinPicker
          locale={locale}
          builtin={builtin}
          disabled={current.disabled}
          editable={editable}
          onChange={(disabled) => update({ disabled })}
        />

        <CustomLocations
          locale={locale}
          options={current}
          editable={editable}
          onChange={(custom) => update({ custom })}
        />

        {error && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function BuiltinPicker({
  locale,
  builtin,
  disabled,
  editable,
  onChange,
}: {
  locale: GameSettingsProps['locale'];
  builtin: { id: string; name: Record<GameSettingsProps['locale'], string> }[];
  disabled: string[];
  editable: boolean;
  onChange(disabled: string[]): boolean;
}) {
  const m = spyfallMessages[locale].settings;
  const [open, setOpen] = useState(false);
  const off = new Set(disabled);
  const on = builtin.length - disabled.length;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm"
      >
        <span className="font-semibold">{m.builtin(on, builtin.length)}</span>
        <span className="text-primary">{open ? m.hideBuiltin : m.showBuiltin}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {editable && (
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" onClick={() => onChange([])}>
                {m.selectAll}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onChange(builtin.map((l) => l.id))}
              >
                {m.selectNone}
              </Button>
            </div>
          )}
          <ul className="grid grid-cols-2 gap-1.5">
            {builtin.map((l) => {
              const checked = !off.has(l.id);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={!editable}
                    onClick={() =>
                      onChange(checked ? [...disabled, l.id] : disabled.filter((d) => d !== l.id))
                    }
                    className={cn(
                      'flex min-h-10 w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-default',
                      checked
                        ? 'bg-primary/10 text-foreground'
                        : 'bg-muted text-muted-foreground line-through',
                    )}
                  >
                    <span aria-hidden className="font-mono text-xs">
                      {checked ? '■' : '□'}
                    </span>
                    {l.name[locale]}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function CustomLocations({
  locale,
  options,
  editable,
  onChange,
}: {
  locale: GameSettingsProps['locale'];
  options: Options;
  editable: boolean;
  onChange(custom: Options['custom']): boolean;
}) {
  const m = spyfallMessages[locale].settings;
  const custom = options.custom;
  // null = ปิดฟอร์ม, 'new' = เพิ่มใหม่, อื่น ๆ = id ที่กำลังแก้
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [roles, setRoles] = useState('');
  const [error, setError] = useState<CustomLocationError | null>(null);

  function openForm(id: string | null) {
    const loc = custom.find((c) => c.id === id);
    setEditing(id ?? 'new');
    setName(loc?.name ?? '');
    setRoles(loc?.roles.join('\n') ?? '');
    setError(null);
  }

  function save() {
    const editingId = editing === 'new' ? null : editing;
    const draft = { name: name.trim(), roles: parseRoles(roles) };
    const problem = checkCustomLocation(draft, custom, editingId);
    if (problem) {
      setError(problem);
      return;
    }
    const next =
      editingId === null
        ? [...custom, { id: nextCustomId(custom), ...draft }]
        : custom.map((c) => (c.id === editingId ? { ...c, ...draft } : c));
    if (onChange(next)) setEditing(null);
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-sm font-semibold">{m.custom}</p>
      {custom.length === 0 ? (
        <p className="mb-2 text-xs text-muted-foreground">{m.customEmpty}</p>
      ) : (
        <ul className="mb-2 divide-y divide-border" data-testid="custom-locations">
          {custom.map((c) => (
            <li key={c.id} className="flex min-h-12 items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.roleCount(c.roles.length)} · {c.roles.join(', ')}
                </p>
              </div>
              {editable && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => openForm(c.id)}>
                    {m.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => onChange(custom.filter((x) => x.id !== c.id))}
                  >
                    {m.remove}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable &&
        (editing === null ? (
          <Button block variant="outline" onClick={() => openForm(null)}>
            {m.add}
          </Button>
        ) : (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">{m.name}</span>
              <Input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">{m.roles}</span>
              <textarea
                value={roles}
                rows={5}
                onChange={(e) => setRoles(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="block text-xs text-muted-foreground">{m.rolesHint}</span>
            </label>
            {error && (
              <p role="alert" className="text-sm font-semibold text-destructive">
                {m.errors[error]}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={save}>{m.save}</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                {m.cancel}
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
