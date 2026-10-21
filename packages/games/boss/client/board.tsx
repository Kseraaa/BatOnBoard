'use client';

import { Button, cn, PixelIcon, prefersReducedMotion } from '@batonboard/ui';
import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SpaceData } from '../data/types';
import { cardFamily, cardKind } from '../rules/cards';
import type { Family } from '../rules/types';
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
      <div className="flex items-start justify-between gap-2">
        <p className="pt-1.5 text-xs text-muted-foreground">👆 {m.board.tapHint}</p>
        {mode.can3d && (
          <Button size="sm" variant="ghost" className="shrink-0" onClick={mode.toggle}>
            {mode.use3d ? m.board.view2d : m.board.view3d}
          </Button>
        )}
      </div>
      {detail && selected !== null && (
        <SpaceDetail ctx={ctx} index={selected} space={detail} onClose={() => setSelected(null)} />
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
      <div className="grid w-full grid-cols-5 grid-rows-[repeat(5,minmax(6.5rem,auto))] gap-1 rounded-2xl bg-muted/60 p-1.5 sm:grid-rows-[repeat(5,minmax(8rem,auto))]">
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
              <span className="line-clamp-2 pr-4 text-[10px] font-semibold leading-tight sm:text-xs">
                {space.name[ctx.locale]}
              </span>
              <span className="flex flex-wrap items-center gap-0.5 py-0.5">
                {space.required.map((f) => (
                  <FamilyDot key={f} ctx={ctx} id={f} size="sm" className="size-4 sm:size-5" />
                ))}
                {space.optional && (
                  <span className="inline-flex flex-wrap items-center gap-0.5 rounded-full border border-dashed border-muted-foreground/50 px-0.5">
                    <span className="text-[9px] font-bold text-muted-foreground">
                      {m.board.pick(space.optional.count)}
                    </span>
                    {space.optional.from.map((f) => (
                      <FamilyDot key={f} ctx={ctx} id={f} size="xs" className="sm:size-4" outline />
                    ))}
                  </span>
                )}
              </span>
              <span className="font-mono text-xs font-black leading-none sm:text-sm">
                {view.price !== null ? ctx.money(view.price * space.shares) : `×${space.shares}`}
              </span>
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

/** รายละเอียดดีลของช่อง — popup แตะช่องไหนก็ได้ (ไม่ต้องรอให้ตัวเงินเดินไปถึง) */
function SpaceDetail({
  ctx,
  index,
  space,
  onClose,
}: {
  ctx: Ctx;
  index: number;
  space: SpaceData;
  onClose(): void;
}) {
  const { m, view } = ctx;
  const closed = view.closed.includes(index);
  const status = closed
    ? m.board.closed
    : view.deal?.space === index
      ? m.board.inDeal
      : view.marker === index && view.phase !== 'ended'
        ? m.board.here
        : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={space.name[ctx.locale]}
        data-testid="space-detail"
        className="max-h-[85dvh] w-full max-w-sm animate-rise space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm shadow-xl motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{space.name[ctx.locale]}</p>
            {status && (
              <p className="mt-1 inline-block rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold">
                {status}
              </p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {m.board.close}
          </Button>
        </div>

        <div className="rounded-xl bg-muted/60 p-3 text-center">
          <p className="text-xs text-muted-foreground">{m.board.total}</p>
          {view.price !== null ? (
            <>
              <p className="font-mono text-3xl font-black" data-testid="space-total">
                {ctx.money(view.price * space.shares)}
              </p>
              <p className="font-mono text-xs">
                {m.board.formula(space.shares, ctx.money(view.price))}
              </p>
              {!closed && (
                <p className="mt-1 text-[11px] text-muted-foreground">{m.board.priceNow}</p>
              )}
            </>
          ) : (
            <p className="font-mono text-xl font-black">{m.board.shares(space.shares)}</p>
          )}
        </div>

        <FamilyList ctx={ctx} title={m.board.requiredAll} families={space.required} />
        {space.optional && (
          <FamilyList
            ctx={ctx}
            title={`${m.board.optional(space.optional.count)} ${space.optional.from.length}`}
            families={space.optional.from}
          />
        )}
      </div>
    </div>,
    // ย้ายไปไว้ที่ body: หน้าห้องมี transform ครอบเกมอยู่ ทำให้ fixed อิงกรอบนั้นแทนจอ
    document.body,
  );
}

/** ตระกูลในดีล: ใครถือนักลงทุน และเรามีไพ่ตระกูลนี้กี่ใบ */
function FamilyList({ ctx, title, families }: { ctx: Ctx; title: string; families: Family[] }) {
  const { m, view } = ctx;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {families.map((f) => {
          const holder = view.investors[f];
          const mine = view.hand.filter((c) => cardKind(c) === 'clan' && cardFamily(c) === f);
          return (
            <li key={f} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
              <FamilyName ctx={ctx} id={f} />
              <span className="text-xs text-muted-foreground">
                {holder === null ? m.board.pool : m.board.holder(ctx.nameOf(holder))}
                {mine.length > 0 && (
                  <span className="ml-1.5 font-semibold text-foreground">
                    · {m.board.youHold(mine.length)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
