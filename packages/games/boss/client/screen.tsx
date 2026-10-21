'use client';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  cn,
  PixelAvatar,
  prefersReducedMotion,
  SoundToggle,
} from '@batonboard/ui';
import type { GameScreenProps } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import { DEFAULT_BOARD_ID, getBoard } from '../data';
import type { FamilyInfo } from '../data/types';
import { FAMILIES } from '../rules/constants';
import type { BossAction, BossView, Family } from '../rules/types';
import { Board } from './board';
import type { Ctx } from './ctx';
import { DealPanel, Pending } from './deal';
import { FamilyDot } from './family';
import { Hand } from './hand';
import { HowToPlay } from './how-to-play';
import { canDeclare, canDraw, canRoll, discardCount, kilos, ranking } from './logic';
import { bossMessages } from './messages';
import { readOptions } from './settings';
import { useGameSounds } from './use-sounds';

export function BossScreen(props: GameScreenProps) {
  const view = props.view as BossView;
  const m = bossMessages[props.locale];
  const board = getBoard(view.boardId) ?? getBoard(DEFAULT_BOARD_ID);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useGameSounds(view);
  if (!board) return null;

  const names = readOptions(props.options).familyNames ?? {};
  const families = new Map<Family, FamilyInfo>(
    board.families.map((f) => {
      const custom = names[f.id];
      return [f.id, custom ? { ...f, name: { th: custom, en: custom } } : f];
    }),
  );
  const ctx: Ctx = {
    view,
    m,
    locale: props.locale,
    board,
    nameOf: (id) => props.players.find((p) => p.id === id)?.name ?? '?',
    family: (id) => families.get(id) as FamilyInfo,
    money: (units) => m.money.k(kilos(units, board.moneyUnit)),
    async send(action: BossAction) {
      setBusy(true);
      setError(null);
      const code = await props.sendAction(action);
      setBusy(false);
      if (code === null) return true;
      setError((m.errors as Record<string, string>)[code] ?? props.platformError(code));
      return false;
    },
    busy,
    serverOffset: props.serverOffset,
  };

  const discard = discardCount(view);

  return (
    <div data-phase={view.phase} className="space-y-4">
      <PlayersBar
        ctx={ctx}
        online={(id) => props.players.find((p) => p.id === id)?.online ?? false}
      />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <HowToPlay m={m} />
        </div>
        <SoundToggle labels={m.sound} className="h-11 shrink-0" />
      </div>
      <News ctx={ctx} />
      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="gap-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:space-y-0">
        <Board ctx={ctx} />
        <div className="space-y-4">
          {view.phase === 'ended' ? (
            <Result ctx={ctx} />
          ) : view.deal !== null ? (
            <DealPanel ctx={ctx} deal={view.deal} />
          ) : (
            <TurnPanel ctx={ctx} />
          )}
          {view.phase !== 'ended' && (
            <Hand
              ctx={ctx}
              discard={discard}
              onDiscard={(cards) => void ctx.send({ type: 'DISCARD', cards })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PlayersBar({ ctx, online }: { ctx: Ctx; online(id: string): boolean }) {
  const { view, m } = ctx;
  const boss = view.deal?.boss ?? null;
  return (
    <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="players">
      {view.players.map((p) => {
        const name = ctx.nameOf(p);
        const turn = view.current === p && view.phase !== 'ended';
        const held = FAMILIES.filter((f) => view.investors[f] === p);
        return (
          <li
            key={p}
            data-testid="player-chip"
            data-player={name}
            className={cn(
              'flex min-w-28 shrink-0 flex-col gap-1 rounded-xl border bg-card px-2.5 py-2',
              turn ? 'border-primary ring-2 ring-primary/40' : 'border-border',
              !online(p) && 'opacity-60',
            )}
          >
            <span className="flex items-center gap-1.5">
              <PixelAvatar name={name} className="size-6" />
              <span className="min-w-0 truncate text-sm font-semibold">
                {name}
                {p === view.me && <span className="text-muted-foreground"> ({m.you})</span>}
              </span>
              {boss === p && <span aria-label="boss">👑</span>}
            </span>
            <span className="font-mono text-sm font-black" data-testid="money">
              {ctx.money(view.money[p] ?? 0)}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {held.map((f) => (
                <FamilyDot key={f} ctx={ctx} id={f} size="sm" />
              ))}
              <span className="ml-auto">🂠 {view.handCounts[p] ?? 0}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** ข่าวล่าสุด: ผลดีลที่แล้ว */
function News({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const last = view.lastDeal;
  if (last === null || view.phase === 'ended') return null;
  const boss = ctx.nameOf(last.boss);
  const space = ctx.board.spaces[last.space]?.name[ctx.locale] ?? '';
  const text =
    last.kind === 'closed'
      ? m.news.closed(boss, space, ctx.money(last.payout))
      : m.news.broken[last.reason](boss);
  return (
    <p
      role="status"
      data-testid="news"
      className={cn(
        'rounded-xl px-3 py-2 text-center text-sm font-semibold',
        last.kind === 'closed' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      {text}
    </p>
  );
}

function TurnPanel({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const mine = view.current === view.me;
  const space = ctx.board.spaces[view.marker];

  if (view.phase === 'discard') {
    return (
      <Card className="space-y-3">
        <p className="text-center font-semibold">
          {mine ? m.turn.yours : m.turn.discarding(ctx.nameOf(view.current))}
        </p>
        <Pending ctx={ctx} pending={view.pending} />
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>{mine ? m.turn.yours : m.turn.waiting(ctx.nameOf(view.current))}</CardTitle>
        <Badge variant="outline">{m.phase[view.phase]}</Badge>
      </div>
      {space && (
        <p className="text-sm">
          <span className="font-semibold">$ {space.name[ctx.locale]}</span>
          {view.price !== null && (
            <span className="text-muted-foreground">
              {' '}
              · {m.board.payout(ctx.money(view.price * space.shares))}
            </span>
          )}
        </p>
      )}
      {mine && (
        <>
          <p className="text-xs text-muted-foreground">
            {view.phase === 'moved' ? m.turn.movedHelp : m.turn.help}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {canRoll(view) && (
              <Button disabled={ctx.busy} onClick={() => void ctx.send({ type: 'ROLL' })}>
                {m.turn.roll}
              </Button>
            )}
            {canDraw(view) && (
              <Button
                variant="outline"
                disabled={ctx.busy}
                onClick={() => void ctx.send({ type: 'DRAW' })}
              >
                {m.turn.draw}
              </Button>
            )}
            {canDeclare(view) && (
              <Button
                variant={view.phase === 'moved' ? 'default' : 'outline'}
                disabled={ctx.busy}
                onClick={() => void ctx.send({ type: 'DECLARE' })}
              >
                {m.turn.declare}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/** เปิดอันดับจากท้ายขึ้นไปทีละคน แล้วประทับชื่อผู้ชนะพร้อมฝนเหรียญ */
const RANK_STEP_MS = 450;

function Result({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const result = view.result;
  const order = ranking(view);
  const winners = result?.winners ?? [];
  const reveal = order.length * RANK_STEP_MS;

  return (
    <Card className="relative space-y-3 overflow-hidden" data-testid="result">
      <CoinRain delayMs={reveal} />
      <CardTitle>{m.result.title}</CardTitle>
      {result && (
        <>
          <p
            className="animate-stamp text-2xl font-black motion-reduce:animate-none"
            style={{ animationDelay: `${reveal}ms` }}
            data-testid="winner"
          >
            👑 {m.result.winner(winners.map((p) => ctx.nameOf(p)).join(', '))}
          </p>
          <p className="text-sm text-muted-foreground">{m.result.reason[result.reason]}</p>
        </>
      )}
      <p className="text-sm font-semibold">{m.result.rank}</p>
      <ol className="space-y-1.5">
        {order.map((p, i) => {
          const won = winners.includes(p);
          return (
            <li
              key={p}
              className={cn(
                'flex animate-rise items-center justify-between rounded-lg px-2 py-1.5 text-sm motion-reduce:animate-none',
                won && 'bg-amber-400/20 font-bold',
              )}
              // คนท้ายตารางขึ้นก่อน ผู้ชนะขึ้นท้ายสุด
              style={{ animationDelay: `${(order.length - 1 - i) * RANK_STEP_MS}ms` }}
            >
              <span className="flex items-center gap-2">
                <span className="w-5 text-right font-mono">{i + 1}</span>
                <PixelAvatar name={ctx.nameOf(p)} className="size-6" />
                {ctx.nameOf(p)}
                {p === view.me && <span className="text-muted-foreground">({m.you})</span>}
                {won && <span aria-hidden>👑</span>}
              </span>
              <span className="font-mono font-bold">{ctx.money(view.money[p] ?? 0)}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

interface Coin {
  left: number;
  delay: number;
  duration: number;
  spin: number;
}

/** เหรียญร่วงทั่วการ์ดผลจบเกม (Web Animations API ข้ามเมื่อลดการเคลื่อนไหว) */
function CoinRain({ delayMs }: { delayMs: number }) {
  const [coins, setCoins] = useState<Coin[]>([]);
  // สุ่มหลัง mount เท่านั้น ไม่งั้นค่าจาก server กับเบราว์เซอร์ไม่ตรงกัน
  useEffect(() => {
    if (prefersReducedMotion()) return;
    setCoins(
      Array.from({ length: 18 }, () => ({
        left: Math.random() * 92,
        delay: delayMs + Math.random() * 1200,
        duration: 1400 + Math.random() * 1200,
        spin: (Math.random() - 0.5) * 720,
      })),
    );
  }, [delayMs]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {coins.map((c, i) => (
        <span
          key={i}
          className="absolute -top-8 text-xl"
          style={{ left: `${c.left}%` }}
          ref={(el) => {
            if (!el || el.dataset.fell) return;
            el.dataset.fell = '1';
            el.animate(
              [
                { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
                { transform: `translateY(32rem) rotate(${c.spin}deg)`, opacity: 0 },
              ],
              {
                duration: c.duration,
                delay: c.delay,
                easing: 'cubic-bezier(.3,.6,.6,1)',
                fill: 'both',
              },
            );
          }}
        >
          🪙
        </span>
      ))}
    </div>
  );
}
