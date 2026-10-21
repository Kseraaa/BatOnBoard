'use client';

import { Button, cn } from '@batonboard/ui';
import { useState } from 'react';
import { cardFamily, cardKind } from '../rules/cards';
import { RECRUIT_SET } from '../rules/constants';
import type { CardId } from '../rules/types';
import { CARD_ART, CARD_STYLE } from './card-art';
import { SYMBOLS } from './ctx';
import type { Ctx } from './ctx';
import { FamilyDot } from './family';
import {
  canRecruitInstead,
  cardUse,
  pendingPlay,
  recruitCards,
  recruitFamilies,
  sortHand,
  travelTargets,
} from './logic';

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
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 pt-3" data-testid="hand">
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
      {canRecruitInstead(view) && (
        <div className="space-y-1.5 rounded-xl border border-dashed border-border p-3">
          <p className="text-sm font-semibold">{m.turn.recruitInstead}</p>
          <RecruitPicker ctx={ctx} onDone={() => setSelected([])} />
        </div>
      )}
      {discard > 0 && pendingPlay(view) === null && (
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
        'block rounded-xl transition-transform',
        selected && '-translate-y-2 ring-4 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <CardFace ctx={ctx} card={card} />
    </button>
  );
}

/**
 * หน้าไพ่: ชนิดไพ่บนแถบบน สัญลักษณ์ใหญ่กลางใบ ผลของไพ่สั้น ๆ ด้านล่าง
 * ไพ่อิทธิพลแต่ละชนิดมีสีของตัวเอง (หรือภาพจาก `CARD_ART`) ไพ่ตระกูลใช้สีของตระกูล
 */
export function CardFace({
  ctx,
  card,
  size = 'md',
}: {
  ctx: Ctx;
  card: CardId;
  size?: 'md' | 'lg';
}) {
  const { m } = ctx;
  const kind = cardKind(card);
  const family = cardFamily(card);
  if (kind === null) return null;
  const style = CARD_STYLE[kind];
  const info = family ? ctx.family(family) : null;
  const art = CARD_ART[kind];
  const from = kind === 'clan' && info ? info.color : style.from;
  const to = kind === 'clan' && info ? info.color : style.to;
  const background = [
    // ไล่สีทับภาพ ตัวหนังสือบนไพ่จึงอ่านออกเสมอ
    `linear-gradient(180deg, rgb(0 0 0 / 0.35), transparent 35%, transparent 60%, rgb(0 0 0 / 0.55))`,
    art ? `url("${art}") center / cover` : `linear-gradient(160deg, ${from}, ${to})`,
  ].join(', ');

  return (
    <span
      className={cn(
        'relative flex flex-col items-center justify-between overflow-hidden rounded-xl border-2 border-white/70 p-1.5 text-center text-white shadow-md',
        size === 'md' ? 'h-32 w-24' : 'h-40 w-28',
        kind === 'clan' && 'border-dashed',
      )}
      style={{ background }}
    >
      <span className="w-full truncate rounded bg-black/25 px-1 text-[11px] font-black leading-snug tracking-wide">
        {m.cards.kind[kind]}
      </span>
      {kind === 'clan' && info ? (
        <span aria-hidden className="text-4xl drop-shadow">
          {SYMBOLS[info.symbol] ?? style.icon}
        </span>
      ) : art ? (
        // ภาพมีสัญลักษณ์อยู่แล้ว เหลือแค่จุดสีของไพ่ไปเที่ยวประจำตระกูล
        <span className="flex flex-1 items-end justify-end self-stretch">
          {family && <FamilyDot ctx={ctx} id={family} size="md" className="ring-2 ring-white" />}
        </span>
      ) : (
        <span aria-hidden className="relative text-4xl drop-shadow">
          {style.icon}
          {family && (
            <FamilyDot
              ctx={ctx}
              id={family}
              size="sm"
              className="absolute -bottom-1 -right-3 ring-2 ring-white"
            />
          )}
        </span>
      )}
      <span className="line-clamp-2 text-[10px] font-semibold leading-tight drop-shadow">
        {kind === 'clan' && info
          ? info.name[ctx.locale]
          : kind === 'travel'
            ? `${m.cards.short.travel} · ${info ? info.name[ctx.locale] : m.cards.anyFamily}`
            : m.cards.short[kind]}
      </span>
    </span>
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
      <div className="flex items-start gap-3">
        <CardFace ctx={ctx} card={card} />
        <div className="min-w-0 space-y-1">
          <p className="font-bold">{m.cards.kind[kind]}</p>
          <p className="text-muted-foreground">{m.cards.help[kind]}</p>
        </div>
      </div>
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
      {use === 'recruit' && <RecruitPicker ctx={ctx} onDone={onDone} />}
    </div>
  );
}

/** เลือกตระกูลที่จะซื้อตัว (ลงไพ่ซื้อตัว 3 ใบแรกบนมือ) */
function RecruitPicker({ ctx, onDone }: { ctx: Ctx; onDone(): void }) {
  const { m, view } = ctx;
  return (
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
            onClick={async () => {
              const ok = await ctx.send({
                type: 'PLAY_RECRUIT',
                cards: recruitCards(view).slice(0, RECRUIT_SET),
                family,
              });
              if (ok) onDone();
            }}
          >
            <FamilyDot ctx={ctx} id={family} />
            {ctx.family(family).name[ctx.locale]} ·{' '}
            {holder === null ? m.cards.pool : ctx.nameOf(holder)}
          </Button>
        );
      })}
    </div>
  );
}
