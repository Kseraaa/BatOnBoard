'use client';

import { Button, cn, copyText, Input } from '@batonboard/ui';
import type { GameSettingsProps } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import { DEFAULT_LOCATION_SET_ID, getLocationSet } from '../data';
import type { LocationData } from '../data';
import { MIN_DECK_SIZE } from '../rules/constants';
import { checkCustomLocation, nextCustomId, parseRoles } from './custom-location';
import type { CustomLocationError } from './custom-location';
import { readOptions } from './deck';
import type { RoomOptions } from './deck';
import { spyfallMessages } from './messages';
import { loadSavedDeck, saveDeck } from './saved-deck';
import { exportDeck, importDeck } from './share';
import type { DeckChoice } from './share';

/** ตัวเลือกเวลาถามตอบ (นาที) — server ตรวจช่วงที่ถูกต้องอีกชั้น */
const DURATION_CHOICES = [5, 6, 8, 10, 12];
/** จำนวนรอบต่อแมตช์ — null = ไม่จำกัด */
const ROUND_CHOICES = [null, 3, 5, 8, 10];

type Options = RoomOptions;

export function SpyfallSettings({ options, locale, editable, onChange }: GameSettingsProps) {
  const m = spyfallMessages[locale].settings;
  // สำเนาในเครื่อง: กดหลายครั้งติดกันก่อน server ตอบ จะได้ไม่ส่งค่าเก่าทับ
  const incoming = JSON.stringify(readOptions(options));
  const [current, setCurrent] = useState<Options>(() => readOptions(options));
  useEffect(() => setCurrent(JSON.parse(incoming) as Options), [incoming]);

  const [error, setError] = useState<string | null>(null);
  const builtin = getLocationSet(DEFAULT_LOCATION_SET_ID)?.locations ?? [];
  const deckSize = builtin.length - current.disabled.length + current.custom.length;

  // ชุดล่าสุดที่ host คนนี้เคยใช้ (localStorage อ่านได้หลัง mount เท่านั้น)
  const [saved, setSaved] = useState<DeckChoice | null>(null);
  useEffect(() => {
    if (editable) setSaved(loadSavedDeck(builtin.map((l) => l.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- อ่านครั้งเดียวตอนเปิดหน้า
  }, [editable]);

  function update(patch: Partial<Options>): boolean {
    const next = { ...current, ...patch };
    if (builtin.length - next.disabled.length + next.custom.length < MIN_DECK_SIZE) {
      setError(m.errors.minDeck);
      return false;
    }
    setError(null);
    setCurrent(next);
    onChange(next);
    // จำเฉพาะชุดที่มีสถานที่สร้างเอง ปิด/เปิดชุดมาตรฐานอย่างเดียวจะได้ไม่ทับชุดที่ตั้งใจทำไว้
    if (next.custom.length > 0) saveDeck({ disabled: next.disabled, custom: next.custom });
    return true;
  }

  const applyDeck = (deck: DeckChoice) => update({ disabled: deck.disabled, custom: deck.custom });

  return (
    <div className="space-y-5">
      <Choices
        label={m.duration}
        editable={editable}
        choices={DURATION_CHOICES.map((min) => ({
          key: String(min),
          label: m.minutes(min),
          selected: min * 60_000 === current.durationMs,
          pick: () => update({ durationMs: min * 60_000 }),
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
          pick: () => {
            // ไม่จำกัด = ไม่ส่ง rounds (ห้องเก่าก็ไม่มี field นี้)
            const next: Options = { ...current };
            if (n === null) delete next.rounds;
            else next.rounds = n;
            setCurrent(next);
            onChange(next);
          },
        }))}
      />

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">{m.locations}</p>
          <p className="text-xs text-muted-foreground" data-testid="deck-count">
            {m.deckCount(deckSize)}
          </p>
        </div>

        {editable && saved && current.custom.length === 0 && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
            <Button block variant="secondary" onClick={() => applyDeck(saved)}>
              {m.useLast}
            </Button>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              {m.lastSummary(saved.custom.length, saved.disabled.length)}
            </p>
          </div>
        )}

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

        <ShareBox
          locale={locale}
          deck={current}
          builtin={builtin}
          editable={editable}
          onImport={applyDeck}
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

/** แถวปุ่มเลือกค่าเดียว (เวลาถามตอบ, จำนวนรอบ) */
function Choices({
  label,
  hint,
  editable,
  testId,
  choices,
}: {
  label: string;
  hint?: string;
  editable: boolean;
  testId?: string;
  choices: { key: string; label: string; selected: boolean; pick(): void }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
      <div
        className="grid grid-cols-5 gap-1.5"
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

function ShareBox({
  locale,
  deck,
  builtin,
  editable,
  onImport,
}: {
  locale: GameSettingsProps['locale'];
  deck: DeckChoice;
  builtin: LocationData[];
  editable: boolean;
  onImport(deck: DeckChoice): boolean;
}) {
  const m = spyfallMessages[locale].settings;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // คัดลอกอัตโนมัติไม่ได้ = แสดงข้อความให้กดค้างคัดลอกเอง
  const [manual, setManual] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const hasDeck = deck.custom.length > 0 || deck.disabled.length > 0;
  const exported = () => exportDeck(deck, builtin, locale);

  async function copy() {
    const text = exported();
    if (await copyText(text)) {
      setManual(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setManual(text);
    }
  }

  function apply() {
    const res = importDeck(text, builtin);
    if (!res.ok) {
      const e = m.importErrors;
      setMessage({
        ok: false,
        text:
          res.error === 'unknown'
            ? e.unknown(res.names.join(', '))
            : res.error === 'location'
              ? e.location(res.name, m.errors[res.problem])
              : e[res.error],
      });
      return;
    }
    if (onImport(res.deck)) {
      setMessage({ ok: true, text: m.importDone });
      setImporting(false);
      setText('');
    } else {
      setMessage(null);
    }
  }

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm font-semibold"
      >
        {m.shareTitle}
        <span aria-hidden className="text-primary">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {hasDeck && (
            <>
              <p className="text-xs text-muted-foreground">{m.shareHint}</p>
              <div className={cn('grid gap-2', canShare ? 'grid-cols-2' : 'grid-cols-1')}>
                <Button variant="secondary" onClick={() => void copy()}>
                  {copied ? m.copied : m.copy}
                </Button>
                {canShare && (
                  <Button
                    variant="secondary"
                    onClick={() => void navigator.share({ text: exported() }).catch(() => {})}
                  >
                    {m.share}
                  </Button>
                )}
              </div>
              {manual !== null && (
                <div className="space-y-1">
                  <p role="alert" className="text-sm font-semibold text-destructive">
                    {m.copyFailed}
                  </p>
                  <textarea
                    readOnly
                    value={manual}
                    rows={6}
                    data-testid="share-text"
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm"
                  />
                </div>
              )}
            </>
          )}
          {editable &&
            (importing ? (
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {m.importLabel}
                  </span>
                  <textarea
                    value={text}
                    rows={6}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={apply}>{m.importApply}</Button>
                  <Button variant="outline" onClick={() => setImporting(false)}>
                    {m.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                block
                variant="outline"
                onClick={() => {
                  setImporting(true);
                  setMessage(null);
                }}
              >
                {m.importOpen}
              </Button>
            ))}
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={cn(
                'text-sm font-semibold',
                message.ok ? 'text-success' : 'text-destructive',
              )}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
