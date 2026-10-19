'use client';

import { Button, cn } from '@batonboard/ui';
import { useState } from 'react';
import { cardFamily, cardKind } from '../rules/cards';
import { RECRUIT_SET } from '../rules/constants';
import type { CardId } from '../rules/types';
import type { Ctx } from './ctx';
import { FamilyDot } from './family';
import { cardUse, recruitCards, recruitFamilies, sortHand, travelTargets } from './logic';

/** ไพ่บนมือ: แตะเลือกแล้วลงไพ่ หรือในช่วงทิ้งไพ่ แตะเพื่อเลือกใบที่จะทิ้ง */
export function Hand({
  ctx,
  discard,
  onDiscard,
}: {
  ctx: Ctx;
  /** จำนวนใบที่ต้องทิ้ง (0 = เล่นปกติ) */
  discard: number;
  onDiscard(cards: CardId[]): void;
}) {
  const { m, view } = ctx;
  const [selected, setSelected] = useState<CardId[]>([]);
  const hand = sortHand(view.hand);
  if (!view.players.includes(view.me)) return null;

  function toggle(card: CardId) {
    if (discard > 0) {
      setSelected((s) => (s.includes(card) ? s.filter((c) => c !== card) : [...s, card]));
    } else {
      setSelected((s) => (s[0] === card ? [] : [card]));
    }
  }

  const focus = discard === 0 ? selected.find((c) => view.hand.includes(c)) : undefined;

  return (
    <section className="space-y-2" aria-label={m.cards.hand}>
      <p className="text-sm font-semibold">
        {m.cards.hand} <span className="font-normal text-muted-foreground">({hand.length})</span>
      </p>
      {discard > 0 && (
        <p className="text-sm font-semibold text-destructive">{m.turn.discard(discard)}</p>
      )}
      {hand.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.cards.empty}</p>
      ) : (
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2" data-testid="hand">
          {hand.map((card) => (
            <li key={card} className="snap-start">
              <CardTile
                ctx={ctx}
                card={card}
                selected={selected.includes(card)}
                onClick={() => toggle(card)}
              />
            </li>
          ))}
        </ul>
      )}
      {discard > 0 && (
        <Button
          block
          disabled={ctx.busy || selected.length !== discard}
          onClick={() => {
            onDiscard(selected);
            setSelected([]);
          }}
        >
          {m.turn.discardConfirm(discard)}
        </Button>
      )}
      {focus !== undefined && <CardActions ctx={ctx} card={focus} onDone={() => setSelected([])} />}
    </section>
  );
}

export function CardTile({
  ctx,
  card,
  selected,
  onClick,
}: {
  ctx: Ctx;
  card: CardId;
  selected: boolean;
  onClick(): void;
}) {
  const { m } = ctx;
  const kind = cardKind(card);
  const family = cardFamily(card);
  const color = family ? ctx.family(family).color : undefined;
  return (
    <button
      type="button"
      data-card={card}
      aria-label={[
        kind ? m.cards.kind[kind] : card,
        family ? ctx.family(family).name[ctx.locale] : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex h-24 w-16 flex-col items-center justify-between rounded-lg border-2 bg-card p-1.5 text-center shadow-sm transition-transform',
        selected ? '-translate-y-2 border-primary' : 'border-border',
        kind === 'stop' && 'bg-destructive/10',
        kind === 'takeover' && 'bg-amber-400/15',
      )}
      style={kind === 'clan' && color ? { borderColor: selected ? undefined : color } : undefined}
    >
      <span className="text-[10px] font-bold leading-tight">
        {kind ? m.cards.kind[kind] : card}
      </span>
      {family ? (
        <FamilyDot ctx={ctx} id={family} size="md" />
      ) : kind === 'travel' ? (
        <span className="text-[10px] text-muted-foreground">{m.cards.anyFamily}</span>
      ) : (
        <span aria-hidden className="text-xl">
          {kind === 'stop' ? '✋' : kind === 'takeover' ? '👑' : kind === 'recruit' ? '🤝' : ''}
        </span>
      )}
      <span className="line-clamp-1 text-[9px] text-muted-foreground">
        {family ? ctx.family(family).name[ctx.locale] : ''}
      </span>
    </button>
  );
}

function CardActions({ ctx, card, onDone }: { ctx: Ctx; card: CardId; onDone(): void }) {
  const { m, view, board } = ctx;
  const kind = cardKind(card);
  const space = view.deal ? (board.spaces[view.deal.space] ?? null) : null;
  const use = cardUse(view, space, card);
  if (kind === null) return null;

  async function send(action: Parameters<Ctx['send']>[0]) {
    if (await ctx.send(action)) onDone();
  }

  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm"
      data-testid="card-actions"
    >
      <p className="font-bold">{m.cards.kind[kind]}</p>
      <p className="text-muted-foreground">{m.cards.help[kind]}</p>
      {use === null && (
        <p className="text-xs text-muted-foreground">
          {kind === 'stop'
            ? m.cards.onlyPending
            : kind === 'recruit' && view.phase === 'deal'
              ? m.cards.needThree(recruitCards(view).length)
              : m.cards.onlyInDeal}
        </p>
      )}
      {use === 'offer' && (
        <Button block disabled={ctx.busy} onClick={() => void send({ type: 'OFFER_CLAN', card })}>
          {m.cards.offer}
        </Button>
      )}
      {use === 'takeover' && (
        <Button
          block
          disabled={ctx.busy}
          onClick={() => void send({ type: 'PLAY_TAKEOVER', card })}
        >
          {m.cards.play}
        </Button>
      )}
      {use === 'stop' && (
        <Button
          block
          variant="destructive"
          disabled={ctx.busy}
          onClick={() => void send({ type: 'PLAY_STOP', card })}
        >
          {m.pending.stop}
        </Button>
      )}
      {use === 'travel' && space && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">{m.cards.target}</p>
          {travelTargets(view, space, card).map((target) => {
            const f = ctx.family(target.family).name[ctx.locale];
            const label =
              target.source === 'investor'
                ? m.deal.investorOf(ctx.nameOf(view.investors[target.family] ?? ''))
                : m.deal.cardOf(
                    ctx.nameOf(view.deal?.offered.find((o) => o.card === target.source)?.by ?? ''),
                  );
            return (
              <Button
                key={`${target.family}-${target.source}`}
                block
                variant="outline"
                disabled={ctx.busy}
                onClick={() => void send({ type: 'PLAY_TRAVEL', card, target })}
              >
                <FamilyDot ctx={ctx} id={target.family} />
                {f} · {label}
              </Button>
            );
          })}
        </div>
      )}
      {use === 'recruit' && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">{m.cards.recruitPick}</p>
          {recruitFamilies(view).map((family) => {
            const holder = view.investors[family];
            return (
              <Button
                key={family}
                block
                variant="outline"
                disabled={ctx.busy}
                onClick={() =>
                  void send({
                    type: 'PLAY_RECRUIT',
                    cards: recruitCards(view).slice(0, RECRUIT_SET),
                    family,
                  })
                }
              >
                <FamilyDot ctx={ctx} id={family} />
                {ctx.family(family).name[ctx.locale]} ·{' '}
                {holder === null ? m.cards.pool : ctx.nameOf(holder)}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
