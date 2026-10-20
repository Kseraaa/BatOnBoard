'use client';

import { Button, cn, PixelIcon, prefersReducedMotion } from '@batonboard/ui';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { SpaceData } from '../data/types';
import type { Ctx } from './ctx';
import { FamilyDot, FamilyName } from './family';
import { BOSS_ICON } from './icon';
import { ringCell } from './logic';

// three.js หนัก ~200 KB โหลดเฉพาะตอนแสดงแบบ 3D
const Scene = lazy(() => import('./scene/scene'));

const VIEW_KEY = 'batonboard:boss:view';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

interface BoardMode {
  /** null = ยังไม่ mount (server render) */
  use3d: boolean | null;
  can3d: boolean;
  reduced: boolean;
  toggle(): void;
}

/** 3D เป็นค่าเริ่มต้นถ้าเครื่องรองรับ WebGL และไม่ได้ขอลดการเคลื่อนไหว ผู้เล่นสลับเองได้ (จำไว้ในเครื่อง) */
function useBoardMode(): BoardMode {
  const [state, setState] = useState<{ use3d: boolean | null; can3d: boolean; reduced: boolean }>({
    use3d: null,
    can3d: false,
    reduced: false,
  });
  useEffect(() => {
    const can3d = webglAvailable();
    const reduced = prefersReducedMotion();
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(VIEW_KEY);
    } catch {
      // private mode ฯลฯ — ใช้ค่าเริ่มต้น
    }
    const use3d = can3d && (stored === null ? !reduced : stored === '3d');
    setState({ use3d, can3d, reduced });
  }, []);
  return {
    ...state,
    toggle() {
      const use3d = !state.use3d;
      try {
        localStorage.setItem(VIEW_KEY, use3d ? '3d' : '2d');
      } catch {
        // จำไม่ได้ก็ไม่เป็นไร
      }
      setState({ ...state, use3d });
    },
  };
}

export function Board({ ctx }: { ctx: Ctx }) {
  const { board, m } = ctx;
  const [selected, setSelected] = useState<number | null>(null);
  const mode = useBoardMode();
  const detail = selected === null ? null : board.spaces[selected];

  return (
    <section aria-label={board.name[ctx.locale]} className="space-y-2">
      {mode.use3d === null ? (
        <div className="aspect-square w-full rounded-2xl bg-muted/60" />
      ) : mode.use3d ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted/40">
          <Suspense
            fallback={
              <p className="grid h-full place-items-center text-sm text-muted-foreground">
                {m.board.loading3d}
              </p>
            }
          >
            <Scene ctx={ctx} selected={selected} onSelect={setSelected} reduced={mode.reduced} />
          </Suspense>
          <Hud ctx={ctx} />
        </div>
      ) : (
        <Grid ctx={ctx} selected={selected} onSelect={setSelected} />
      )}
      {mode.can3d && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={mode.toggle}>
            {mode.use3d ? m.board.view2d : m.board.view3d}
          </Button>
        </div>
      )}
      {detail && selected !== null && (
        <SpaceDetail ctx={ctx} space={detail} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

/** ข้อมูลรวมบนฉาก 3D (ราคาหุ้น ดีลที่ปิด ลูกเต๋า) — ตัวเลขอ่านง่ายกว่าใน 3D */
function Hud({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const roll = view.lastRoll;
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 rounded-xl bg-background/85 px-2.5 py-1.5 shadow-sm">
        {view.price !== null && (
          <p className="text-[10px] text-muted-foreground">
            {m.board.price}{' '}
            <span data-testid="price" className="font-mono text-sm font-black text-foreground">
              {ctx.money(view.price)}
            </span>
          </p>
        )}
        <p className="text-[10px] font-semibold">{m.board.deals(view.dealsDone, view.maxDeals)}</p>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-2 rounded-xl bg-background/85 px-2.5 py-1.5 shadow-sm">
        {roll && (
          <span className="flex items-center gap-1" data-testid="last-roll">
            <Die value={roll.value} className="size-6" />
            <span className="sr-only">
              {roll.kind === 'end' ? m.board.endRolled(roll.value) : m.board.rolled(roll.value)}
            </span>
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">{m.board.deck(view.deckCount)}</span>
      </div>
    </>
  );
}

function Grid({
  ctx,
  selected,
  onSelect,
}: {
  ctx: Ctx;
  selected: number | null;
  onSelect(space: number | null): void;
}) {
  const { view, board, m } = ctx;
  const dealSpace = view.deal?.space ?? null;
  const setSelected = onSelect;

  return (
    <>
      <div className="grid aspect-square w-full grid-cols-5 grid-rows-5 gap-1 rounded-2xl bg-muted/60 p-1.5">
        {board.spaces.map((space, i) => {
          const { row, col } = ringCell(i);
          const closed = view.closed.includes(i);
          const here = view.marker === i && view.phase !== 'ended';
          return (
            <button
              key={space.id}
              type="button"
              data-testid={`space-${i}`}
              data-marker={here || undefined}
              data-closed={closed || undefined}
              aria-pressed={selected === i}
              onClick={() => setSelected(selected === i ? null : i)}
              style={{ gridRow: row, gridColumn: col }}
              className={cn(
                'relative flex min-w-0 flex-col justify-between overflow-hidden rounded-lg border bg-card p-1 text-left transition-colors',
                closed && 'bg-muted opacity-50',
                here && 'border-amber-500 ring-2 ring-amber-400',
                dealSpace === i && 'ring-4',
                selected === i && 'border-primary',
              )}
            >
              <span className="line-clamp-1 text-[9px] font-semibold leading-tight sm:line-clamp-2 sm:text-[11px]">
                {space.name[ctx.locale]}
              </span>
              <span className="flex flex-wrap items-center gap-0.5">
                {space.required.map((f) => (
                  <FamilyDot key={f} ctx={ctx} id={f} size="xs" />
                ))}
                {space.optional?.from.map((f) => (
                  <FamilyDot key={f} ctx={ctx} id={f} size="xs" outline />
                ))}
              </span>
              <span className="font-mono text-[9px] font-bold sm:text-[11px]">×{space.shares}</span>
              {closed && (
                <span className="absolute inset-0 grid place-items-center text-[10px] font-bold uppercase -rotate-12 text-muted-foreground">
                  {m.board.closed}
                </span>
              )}
              {here && (
                <span
                  aria-hidden
                  className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-amber-400 text-xs font-black text-amber-950 shadow"
                >
                  $
                </span>
              )}
            </button>
          );
        })}
        <Center ctx={ctx} />
      </div>
    </>
  );
}

function Center({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const roll = view.lastRoll;
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 rounded-xl bg-card/80 p-2 text-center"
      style={{ gridRow: '2 / 5', gridColumn: '2 / 5' }}
    >
      <PixelIcon rows={BOSS_ICON} className="size-6 text-amber-500" />
      {view.price !== null && (
        <>
          <p className="text-[10px] text-muted-foreground sm:text-xs">{m.board.price}</p>
          <p data-testid="price" className="font-mono text-lg font-black leading-none sm:text-2xl">
            {ctx.money(view.price)}
          </p>
          <p className="text-[10px] text-muted-foreground">{m.board.perShare}</p>
        </>
      )}
      <p className="text-[10px] font-semibold sm:text-xs">
        {m.board.deals(view.dealsDone, view.maxDeals)}
      </p>
      <div className="flex items-center gap-2">
        {roll && (
          <span className="flex items-center gap-1" data-testid="last-roll">
            <Die value={roll.value} />
            <span className="sr-only">
              {roll.kind === 'end' ? m.board.endRolled(roll.value) : m.board.rolled(roll.value)}
            </span>
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">{m.board.deck(view.deckCount)}</span>
      </div>
    </div>
  );
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({ value, className }: { value: number; className?: string }) {
  const pips = PIPS[value] ?? [];
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 grid-cols-3 grid-rows-3 gap-px rounded-md border border-border bg-white p-1 shadow-sm',
        className,
      )}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cn('rounded-full', pips.includes(i) && 'bg-neutral-900')} />
      ))}
    </span>
  );
}

function SpaceDetail({ ctx, space, onClose }: { ctx: Ctx; space: SpaceData; onClose(): void }) {
  const { m, view } = ctx;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">{space.name[ctx.locale]}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          {m.board.close}
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{m.board.required}</span>
        {space.required.map((f) => (
          <FamilyName key={f} ctx={ctx} id={f} />
        ))}
      </p>
      {space.optional && (
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{m.board.optional(space.optional.count)}</span>
          {space.optional.from.map((f) => (
            <FamilyName key={f} ctx={ctx} id={f} />
          ))}
        </p>
      )}
      <p className="font-mono">
        {m.board.shares(space.shares)}
        {view.price !== null && ` · ${m.board.payout(ctx.money(view.price * space.shares))}`}
      </p>
    </div>
  );
}
