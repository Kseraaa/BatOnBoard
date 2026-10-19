'use client';

import { Badge, Button, Card, CardTitle, cn, Countdown } from '@batonboard/ui';
import { useState } from 'react';
import { cardKind } from '../rules/cards';
import { spaceFamilies } from '../rules/plan';
import type { DealView, Family, Plan, PlayResult, SlotSource, SpaceDef } from '../rules/types';
import type { Ctx } from './ctx';
import { FamilyDot, FamilyName } from './family';
import { autoPlan, bossKeeps, canRespond, planError, planMembers, sourcesFor } from './logic';

export function DealPanel({ ctx, deal }: { ctx: Ctx; deal: DealView }) {
  const { m, view, board } = ctx;
  const space = board.spaces[deal.space];
  if (!space) return null;
  const boss = deal.boss === view.me;

  return (
    <Card className="space-y-4" data-testid="deal-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{space.name[ctx.locale]}</CardTitle>
          <p className="text-sm text-muted-foreground" data-testid="deal-boss">
            {boss ? m.deal.youBoss : m.deal.boss(ctx.nameOf(deal.boss))}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-xl font-black" data-testid="deal-payout">
            {ctx.money(deal.payout)}
          </p>
          {deal.deadline === null ? (
            <p className="text-xs text-muted-foreground">{m.deal.noLimit}</p>
          ) : (
            <Countdown
              deadline={deal.deadline}
              serverOffset={ctx.serverOffset}
              className="text-base"
            />
          )}
        </div>
      </div>

      <Pending ctx={ctx} deal={deal} />
      <LastPlay ctx={ctx} />
      {deal.closeAt !== null && (
        <p
          role="status"
          className="flex items-center justify-between rounded-xl bg-success/15 px-3 py-2 font-semibold text-success"
        >
          {m.deal.closing}
          <Countdown deadline={deal.closeAt} serverOffset={ctx.serverOffset} className="text-lg" />
        </p>
      )}

      <Families ctx={ctx} deal={deal} space={space} />

      {boss ? (
        <PlanEditor
          key={`${deal.space}-${deal.boss}-${JSON.stringify(deal.plan)}`}
          ctx={ctx}
          deal={deal}
          space={space}
        />
      ) : (
        <PlanView ctx={ctx} deal={deal} />
      )}

      <p className="text-xs text-muted-foreground">{m.deal.talk}</p>
      {boss && <Abandon ctx={ctx} />}
    </Card>
  );
}

function Pending({ ctx, deal }: { ctx: Ctx; deal: DealView }) {
  const { m, view } = ctx;
  const pending = deal.pending;
  if (pending === null) return null;
  const by = ctx.nameOf(pending.by);
  const text =
    pending.kind === 'travel'
      ? m.pending.travel(by, targetName(ctx, pending.target.family, pending.target.source))
      : pending.kind === 'takeover'
        ? m.pending.takeover(by)
        : m.pending.recruit(by, ctx.family(pending.family).name[ctx.locale]);
  const stop = view.hand.find((c) => cardKind(c) === 'stop');
  return (
    <div
      role="alert"
      data-testid="pending"
      className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-400/10 p-3"
    >
      <p className="font-bold">{text}</p>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {m.pending.in}
        <Countdown deadline={pending.until} serverOffset={ctx.serverOffset} className="text-base" />
      </p>
      {stop !== undefined && (
        <>
          <p className="text-xs">{m.pending.stopHelp}</p>
          <Button
            block
            variant="destructive"
            disabled={ctx.busy}
            onClick={() => void ctx.send({ type: 'PLAY_STOP', card: stop })}
          >
            {m.pending.stop}
          </Button>
        </>
      )}
    </div>
  );
}

/** ผลไพ่ล่าสุดที่ไม่ได้มีผลปกติ (โดนเบรก/ไม่มีผล) — ไพ่ที่มีผลเห็นได้จากโต๊ะอยู่แล้ว */
function LastPlay({ ctx }: { ctx: Ctx }) {
  const play: PlayResult | null = ctx.view.lastPlay;
  if (play === null || play.outcome === 'resolved') return null;
  const text =
    play.outcome === 'stopped'
      ? ctx.m.played.stopped(ctx.nameOf(play.stoppedBy ?? ''))
      : ctx.m.played.fizzled;
  return (
    <p className="text-sm font-semibold text-muted-foreground" data-testid="last-play">
      {text}
    </p>
  );
}

function targetName(ctx: Ctx, family: Family, source: SlotSource): string {
  const f = ctx.family(family).name[ctx.locale];
  return source === 'investor' ? f : `${ctx.m.cards.kind.clan} ${f}`;
}

function sourceLabel(ctx: Ctx, family: Family, source: SlotSource, owner: string): string {
  void family;
  return source === 'investor'
    ? ctx.m.deal.investorOf(ctx.nameOf(owner))
    : ctx.m.deal.cardOf(ctx.nameOf(owner));
}

function Families({ ctx, deal, space }: { ctx: Ctx; deal: DealView; space: SpaceDef }) {
  const { m } = ctx;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">
        {m.deal.families}
        {space.optional && (
          <span className="font-normal text-muted-foreground">
            {' '}
            · {m.board.optional(space.optional.count)}{' '}
            {space.optional.from.map((f) => ctx.family(f).name[ctx.locale]).join(', ')}
          </span>
        )}
      </p>
      <ul className="space-y-1">
        {spaceFamilies(space).map((family) => {
          const sources = sourcesFor(ctx.view, family);
          const away = deal.away.includes(family);
          return (
            <li key={family} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <FamilyName ctx={ctx} id={family} />
              {!space.required.includes(family) && <Badge variant="outline">?</Badge>}
              {away && <Badge variant="danger">{m.deal.away}</Badge>}
              <span className="text-muted-foreground">
                {sources.length === 0
                  ? m.deal.nobody
                  : sources.map((s) => sourceLabel(ctx, family, s.source, s.owner)).join(' · ')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlanView({ ctx, deal }: { ctx: Ctx; deal: DealView }) {
  const { m, view } = ctx;
  const plan = deal.plan;
  if (plan === null) {
    return <p className="rounded-xl bg-muted p-3 text-center text-sm">{m.deal.noPlan}</p>;
  }
  const members = planMembers(view, plan.slots);
  const mine = members.includes(view.me) && canRespond(view);
  const answer = deal.responses[view.me];

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{m.deal.plan}</p>
      <ul className="space-y-1" data-testid="plan">
        {members.map((p) => (
          <li key={p} className="flex items-center justify-between gap-2 text-sm">
            <span className={cn(p === view.me && 'font-bold')}>
              {p === view.me ? `${ctx.nameOf(p)} (${m.you})` : ctx.nameOf(p)}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono font-semibold">{ctx.money(plan.shares[p] ?? 0)}</span>
              <Response ctx={ctx} value={deal.responses[p]} />
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{ctx.nameOf(deal.boss)}</span>
          <span className="font-mono">{m.deal.bossKeeps(ctx.money(bossKeeps(deal, plan)))}</span>
        </li>
      </ul>
      {mine && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={ctx.busy || answer === true}
            onClick={() => void ctx.send({ type: 'RESPOND', agree: true })}
          >
            {m.deal.agree}
          </Button>
          <Button
            variant="outline"
            disabled={ctx.busy || answer === false}
            onClick={() => void ctx.send({ type: 'RESPOND', agree: false })}
          >
            {m.deal.disagree}
          </Button>
        </div>
      )}
    </div>
  );
}

function Response({ ctx, value }: { ctx: Ctx; value: boolean | undefined }) {
  if (value === undefined) return <Badge variant="outline">{ctx.m.deal.waitingReply}</Badge>;
  return value ? (
    <Badge variant="success">{ctx.m.deal.agreed}</Badge>
  ) : (
    <Badge variant="danger">{ctx.m.deal.refused}</Badge>
  );
}

/** ปุ่ม +/− ปรับส่วนแบ่งทีละ 5 หน่วย (= 5 แสนบาทบนกระดานมาตรฐาน) */
const SHARE_STEP = 5;

/** บอสเลือกแหล่งของแต่ละตระกูลและส่วนแบ่ง แล้วเสนอแผน */
function PlanEditor({ ctx, deal, space }: { ctx: Ctx; deal: DealView; space: SpaceDef }) {
  const { m, view } = ctx;
  const [slots, setSlots] = useState<Plan['slots']>(
    () => deal.plan?.slots ?? autoPlan(view, space),
  );
  const [shares, setShares] = useState<Plan['shares']>(() => deal.plan?.shares ?? {});

  const members = planMembers(view, slots);
  const plan: Plan = {
    slots,
    shares: Object.fromEntries(members.map((p) => [p, shares[p] ?? 0])),
  };
  const error = planError(view, space, plan);
  const sameAsProposed = JSON.stringify(plan) === JSON.stringify(deal.plan);
  const keeps = bossKeeps(deal, plan);

  function setSource(family: Family, source: SlotSource | '') {
    const rest = slots.filter((s) => s.family !== family);
    setSlots(source === '' ? rest : [...rest, { family, source }]);
  }

  function step(p: string, delta: number) {
    setShares({ ...shares, [p]: Math.max(0, (shares[p] ?? 0) + delta) });
  }

  return (
    <div className="space-y-3" data-testid="plan-editor">
      <p className="text-sm font-semibold">{m.deal.plan}</p>
      <p className="text-xs text-muted-foreground">{m.deal.proposeHelp}</p>
      <div className="space-y-2">
        {spaceFamilies(space).map((family) => {
          const options = sourcesFor(view, family);
          const chosen = slots.find((s) => s.family === family)?.source ?? '';
          const required = space.required.includes(family);
          return (
            <div key={family} className="flex items-center gap-2 text-sm">
              <FamilyDot ctx={ctx} id={family} outline={!required} />
              <select
                aria-label={ctx.family(family).name[ctx.locale]}
                value={chosen}
                onChange={(e) => setSource(family, e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2"
              >
                <option value="">{required ? m.deal.nobody : m.deal.notUsed}</option>
                {options.map((o) => (
                  <option key={o.source} value={o.source}>
                    {sourceLabel(ctx, family, o.source, o.owner)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {members.length > 0 && (
        <ul className="space-y-2">
          {members.map((p) => (
            <li key={p} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-semibold">{ctx.nameOf(p)}</span>
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`- ${ctx.nameOf(p)}`}
                  onClick={() => step(p, -SHARE_STEP)}
                >
                  −
                </Button>
                <span className="w-16 text-center font-mono text-sm font-bold" data-testid="share">
                  {ctx.money(plan.shares[p] ?? 0)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`+ ${ctx.nameOf(p)}`}
                  onClick={() => step(p, SHARE_STEP)}
                >
                  +
                </Button>
              </span>
              <Response ctx={ctx} value={sameAsProposed ? deal.responses[p] : undefined} />
            </li>
          ))}
        </ul>
      )}
      <p className={cn('text-sm font-semibold', keeps < 0 && 'text-destructive')}>
        {m.deal.bossKeeps(ctx.money(keeps))}
      </p>
      {error !== null && (
        <p className="text-sm text-destructive">
          {error === 'shares-too-high' ? m.deal.tooMuch : m.deal.incomplete}
        </p>
      )}
      <Button
        block
        disabled={ctx.busy || error !== null || sameAsProposed || deal.pending !== null}
        onClick={() => void ctx.send({ type: 'PROPOSE', plan })}
      >
        {deal.plan === null ? m.deal.propose : m.deal.proposeAgain}
      </Button>
    </div>
  );
}

function Abandon({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button block variant="ghost" onClick={() => setConfirming(true)}>
        {m.deal.abandon}
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
      <span className="flex-1">{m.deal.confirmAbandon}</span>
      <Button
        size="sm"
        variant="destructive"
        disabled={ctx.busy}
        onClick={() => {
          setConfirming(false);
          void ctx.send({ type: 'ABANDON' });
        }}
      >
        {m.deal.confirm}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
        {m.deal.cancel}
      </Button>
    </div>
  );
}
