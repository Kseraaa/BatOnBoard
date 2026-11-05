'use client';

import { cn } from '@batonboard/ui';
import type { LobbyPickProps } from '@batonboard/ui';
import { DEFAULT_BOARD_ID, getBoard } from '../data';
import { FAMILIES } from '../rules/constants';
import type { Family } from '../rules/types';
import { SYMBOLS } from './ctx';
import { bossMessages } from './messages';

/**
 * เลือกสีตระกูลของตัวเองในล็อบบี้ (ข้างชื่อผู้เล่น) ห้ามซ้ำกับคนอื่น ไม่เลือก = สุ่มตอนเริ่มเกม
 * server ตรวจซ้ำเสมอ (`lobbyPick` ของเกม)
 */
export function FamilyPick({ value, taken, locale, editable, onChange }: LobbyPickProps) {
  const m = bossMessages[locale].settings;
  const board = getBoard(DEFAULT_BOARD_ID);
  if (!board) return null;
  const chosen = FAMILIES.find((f) => f === value) ?? null;
  const info = (f: Family) => {
    const base = board.families.find((x) => x.id === f);
    return {
      color: base?.color ?? '#888',
      symbol: base?.symbol ?? '',
      name: base?.name[locale] ?? f,
    };
  };

  if (!editable) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {chosen === null ? (
          <>🎲 {m.pickRandom}</>
        ) : (
          <>
            <span
              aria-hidden
              className="size-3.5 rounded-full"
              style={{ backgroundColor: info(chosen).color }}
            />
            <span className="font-semibold" style={{ color: info(chosen).color }}>
              {info(chosen).name}
            </span>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={m.pickTitle}>
        <button
          type="button"
          role="radio"
          aria-checked={chosen === null}
          onClick={() => onChange(null)}
          className={cn(
            'grid h-8 min-w-8 place-items-center rounded-full border-2 px-2 text-xs font-semibold',
            chosen === null ? 'border-primary bg-primary/10' : 'border-border',
          )}
        >
          🎲 {m.pickRandom}
        </button>
        {FAMILIES.map((f) => {
          const i = info(f);
          const isTaken = taken.includes(f);
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={chosen === f}
              aria-label={isTaken ? `${i.name} (${m.pickTaken})` : i.name}
              title={i.name}
              disabled={isTaken}
              onClick={() => onChange(f)}
              className={cn(
                'relative grid size-8 place-items-center rounded-full text-sm text-white transition-transform',
                chosen === f && 'ring-[3px] ring-primary ring-offset-2 ring-offset-card',
                isTaken && 'opacity-25',
              )}
              style={{ backgroundColor: i.color }}
            >
              <span aria-hidden>{SYMBOLS[i.symbol] ?? ''}</span>
              {isTaken && (
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center text-lg font-black"
                >
                  ✕
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {chosen === null ? (
          m.pickHelp
        ) : (
          <span className="font-semibold" style={{ color: info(chosen).color }}>
            {info(chosen).name}
          </span>
        )}
      </p>
    </div>
  );
}
