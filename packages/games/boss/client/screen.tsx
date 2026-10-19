'use client';

import { Badge, Button, Card, CardTitle, cn, PixelAvatar } from '@batonboard/ui';
import type { GameScreenProps } from '@batonboard/ui';
import { useState } from 'react';
import { DEFAULT_BOARD_ID, getBoard } from '../data';
import type { FamilyInfo } from '../data/types';
import { FAMILIES } from '../rules/constants';
import type { BossAction, BossView, Family } from '../rules/types';
import { Board } from './board';
import type { Ctx } from './ctx';
import { DealPanel } from './deal';
import { FamilyDot } from './family';
import { Hand } from './hand';
import { canDeclare, canDraw, canRoll, discardCount, millions, ranking } from './logic';
import { bossMessages } from './messages';

export function BossScreen(props: GameScreenProps) {
  const view = props.view as BossView;
  const m = bossMessages[props.locale];
  const board = getBoard(view.boardId) ?? getBoard(DEFAULT_BOARD_ID);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!board) return null;

  const families = new Map<Family, FamilyInfo>(board.families.map((f) => [f.id, f]));
  const ctx: Ctx = {
    view,
    m,
    locale: props.locale,
    board,
    nameOf: (id) => props.players.find((p) => p.id === id)?.name ?? '?',
    family: (id) => families.get(id) as FamilyInfo,
    money: (units) => m.money.million(millions(units, board.moneyUnit)),
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
      <News ctx={ctx} />
      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="gap-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:space-y-0">
        <Board ctx={ctx} />
        <div className="space-y-4">
          {view.phase === 'ended' ? (
            <Result ctx={ctx} />
          ) : view.deal !== null ? (
            <DealPanel ctx={ctx} deal={view.deal} />
          ) : (
            <TurnPanel ctx={ctx} />
          )}
          <Hand
            ctx={ctx}
            discard={discard}
            onDiscard={(cards) => void ctx.send({ type: 'DISCARD', cards })}
          />
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
      <Card>
        <p className="text-center font-semibold">
          {mine ? m.turn.yours : m.turn.discarding(ctx.nameOf(view.current))}
        </p>
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

function Result({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const result = view.result;
  return (
    <Card className="space-y-3" data-testid="result">
      <CardTitle>{m.result.title}</CardTitle>
      {result && (
        <>
          <p className="text-xl font-black" data-testid="winner">
            {m.result.winner(result.winners.map((p) => ctx.nameOf(p)).join(', '))}
          </p>
          <p className="text-sm text-muted-foreground">{m.result.reason[result.reason]}</p>
        </>
      )}
      <p className="text-sm font-semibold">{m.result.rank}</p>
      <ol className="space-y-1">
        {ranking(view).map((p, i) => (
          <li key={p} className="flex items-center justify-between text-sm">
            <span>
              {i + 1}. {ctx.nameOf(p)}
            </span>
            <span className="font-mono font-bold">{ctx.money(view.money[p] ?? 0)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
