'use client';

import { Badge, Button, Card, CardTitle, cn, Countdown, HoldToReveal } from '@batonboard/ui';
import type { GameScreenProps, Locale, PlayerInfo } from '@batonboard/ui';
import { useState } from 'react';
import { getLocationSet } from '../data';
import type { LocationSet } from '../data';
import type { SpyfallAction, SpyfallView } from '../rules/types';
import { canAccuse, canBallot, canGuess, canPass, voterCount } from './logic';
import { spyfallMessages } from './messages';
import type { SpyfallMessages } from './messages';

interface Ctx {
  view: SpyfallView;
  m: SpyfallMessages;
  locale: Locale;
  set: LocationSet | undefined;
  nameOf(id: string): string;
  send(action: SpyfallAction): Promise<boolean>;
  busy: boolean;
}

export function SpyfallScreen(props: GameScreenProps) {
  // view มาจาก server ของเราเอง (playerView ของ spyfall) จึงแปลง type ตรง ๆ ได้
  const view = props.view as SpyfallView;
  const m = spyfallMessages[props.locale];
  const set = getLocationSet(view.locationSetId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameOf = (id: string) => props.players.find((p) => p.id === id)?.name ?? '?';

  async function send(action: SpyfallAction): Promise<boolean> {
    setBusy(true);
    setError(null);
    const code = await props.sendAction(action);
    setBusy(false);
    if (code === null) return true;
    setError((m.errors as Record<string, string>)[code] ?? props.platformError(code));
    return false;
  }

  const ctx: Ctx = { view, m, locale: props.locale, set, nameOf, send, busy };

  return (
    <div className="flex flex-col gap-4" data-phase={view.phase}>
      <Header ctx={ctx} serverOffset={props.serverOffset} />

      {view.phase === 'reveal' ? (
        <Reveal ctx={ctx} isHost={props.hostId === view.me} />
      ) : (
        <>
          <RoleCard ctx={ctx} />
          {view.phase === 'voting' && <VotePanel ctx={ctx} serverOffset={props.serverOffset} />}
          {view.phase === 'final-vote' && <FinalPanel ctx={ctx} />}
          <PlayerList ctx={ctx} players={props.players} />
          {canGuess(view) && <SpyGuess ctx={ctx} />}
          <LocationList ctx={ctx} />
        </>
      )}

      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function locationName(ctx: Ctx, id: string): string {
  return ctx.set?.locations.find((l) => l.id === id)?.name[ctx.locale] ?? id;
}

function roleName(ctx: Ctx, locationId: string, roleId: string): string {
  const loc = ctx.set?.locations.find((l) => l.id === locationId);
  return loc?.roles.find((r) => r.id === roleId)?.name[ctx.locale] ?? roleId;
}

function Header({ ctx, serverOffset }: { ctx: Ctx; serverOffset: number }) {
  const { view, m } = ctx;
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Badge variant={view.phase === 'reveal' ? 'success' : 'secondary'}>
          {m.phase[view.phase]}
        </Badge>
        {view.phase !== 'reveal' && (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {m.firstAsker(ctx.nameOf(view.firstAsker))}
          </p>
        )}
      </div>
      {view.phase !== 'reveal' && (
        <div className="text-right">
          <Countdown
            deadline={view.deadline}
            pausedRemaining={view.pausedRemaining}
            serverOffset={serverOffset}
          />
          {view.deadline === null && <p className="text-xs text-muted-foreground">{m.paused}</p>}
        </div>
      )}
    </header>
  );
}

function RoleCard({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  if (view.you.role === 'spectator') {
    return <Card className="text-center text-muted-foreground">{m.card.spectator}</Card>;
  }
  const you = view.you;
  return (
    <HoldToReveal hint={m.card.hint} showLabel={m.card.show} hideLabel={m.card.hide}>
      {you.role === 'spy' ? (
        <div data-testid="role-spy" className="space-y-2">
          <p className="text-3xl font-bold text-destructive">{m.card.youAreSpy}</p>
          <p className="text-sm text-muted-foreground">{m.card.spyHint}</p>
        </div>
      ) : (
        <div data-testid="role-agent" className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {m.card.location}
            </p>
            <p className="text-2xl font-bold">{locationName(ctx, you.locationId)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.card.role}</p>
            <p className="text-lg font-semibold">{roleName(ctx, you.locationId, you.roleId)}</p>
          </div>
        </div>
      )}
    </HoldToReveal>
  );
}

function VotePanel({ ctx, serverOffset }: { ctx: Ctx; serverOffset: number }) {
  const { view, m } = ctx;
  const vote = view.vote;
  if (!vote) return null;
  const isAccused = vote.accused === view.me;
  return (
    <Card className="border-primary">
      <CardTitle className="mb-1">
        {m.vote.title(ctx.nameOf(vote.accuser), ctx.nameOf(vote.accused))}
      </CardTitle>
      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{m.vote.progress(vote.voted.length, voterCount(view))}</span>
        <Countdown
          deadline={vote.deadline}
          serverOffset={serverOffset}
          className="text-lg"
          warnBelowMs={15_000}
        />
      </div>
      {canBallot(view) ? (
        <>
          <p className="mb-2 font-semibold">{m.vote.question}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={ctx.busy}
              onClick={() => void ctx.send({ type: 'BALLOT', agree: true })}
            >
              {m.vote.agree}
            </Button>
            <Button
              variant="outline"
              disabled={ctx.busy}
              onClick={() => void ctx.send({ type: 'BALLOT', agree: false })}
            >
              {m.vote.disagree}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{m.vote.help}</p>
        </>
      ) : (
        <p className="text-center font-semibold">
          {isAccused ? m.vote.youAreAccused : m.vote.waiting}
        </p>
      )}
    </Card>
  );
}

function FinalPanel({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  return (
    <Card className="border-destructive">
      <CardTitle className="mb-1 text-destructive">{m.final.title}</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">{m.final.help}</p>
      {canPass(view) ? (
        <Button
          block
          variant="outline"
          disabled={ctx.busy}
          onClick={() => void ctx.send({ type: 'PASS' })}
        >
          {m.final.pass}
        </Button>
      ) : (
        <p className="text-center font-semibold">{m.final.done}</p>
      )}
    </Card>
  );
}

function PlayerList({ ctx, players }: { ctx: Ctx; players: PlayerInfo[] }) {
  const { view, m } = ctx;
  const [target, setTarget] = useState<string | null>(null);
  const accusing = canAccuse(view);
  const used = view.phase === 'final-vote' ? view.finalTurns : view.usedAccusation;

  return (
    <Card>
      <CardTitle className="mb-1 text-base">{m.players}</CardTitle>
      {accusing && <p className="mb-2 text-xs text-muted-foreground">{m.accuseHelp}</p>}
      <ul className="divide-y divide-border">
        {view.players.map((id) => {
          const info = players.find((p) => p.id === id);
          return (
            <li key={id} className="flex min-h-12 items-center gap-2 py-2">
              <span
                className={cn('flex-1 truncate font-semibold', id === view.me && 'text-primary')}
              >
                {ctx.nameOf(id)}
                {id === view.me && (
                  <span className="ml-1 text-xs text-muted-foreground">({m.you})</span>
                )}
              </span>
              {info && !info.online && <Badge variant="outline">{m.offline}</Badge>}
              {used.includes(id) && <Badge variant="outline">{m.accuseUsed}</Badge>}
              {accusing && id !== view.me && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={ctx.busy}
                  onClick={() => setTarget(id)}
                >
                  {m.accuse}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {target && accusing && (
        <Confirm
          ctx={ctx}
          text={m.confirmAccuse(ctx.nameOf(target))}
          onConfirm={() => {
            void ctx.send({ type: 'ACCUSE', target });
            setTarget(null);
          }}
          onCancel={() => setTarget(null)}
        />
      )}
    </Card>
  );
}

function SpyGuess({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);

  if (!open) {
    return (
      <Button block variant="destructive" onClick={() => setOpen(true)}>
        {m.spy.guess}
      </Button>
    );
  }
  return (
    <Card className="border-destructive">
      <CardTitle className="mb-1">{m.spy.guessTitle}</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">{m.spy.guessHelp}</p>
      {choice ? (
        <Confirm
          ctx={ctx}
          text={m.spy.confirmGuess(locationName(ctx, choice))}
          onConfirm={() => void ctx.send({ type: 'SPY_GUESS', locationId: choice })}
          onCancel={() => setChoice(null)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {ctx.set?.locations.map((l) => (
            <Button
              key={l.id}
              variant="outline"
              size="sm"
              className="h-auto min-h-11 py-2"
              onClick={() => setChoice(l.id)}
            >
              {l.name[ctx.locale]}
            </Button>
          ))}
        </div>
      )}
      <Button block variant="ghost" className="mt-2" onClick={() => setOpen(false)}>
        {m.cancel}
      </Button>
    </Card>
  );
}

function LocationList({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  // component นี้ถูกถอดออกตอน reveal ที่ขีดไว้จึงล้างเองทุกรอบใหม่
  const [crossed, setCrossed] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCrossed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <CardTitle className="mb-1 text-base">{m.locations.title}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{m.locations.help}</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {ctx.set?.locations.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => toggle(l.id)}
              className={cn(
                'min-h-10 w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                crossed.has(l.id)
                  ? 'bg-muted text-muted-foreground line-through'
                  : 'bg-secondary/50',
              )}
            >
              {l.name[ctx.locale]}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Reveal({ ctx, isHost }: { ctx: Ctx; isHost: boolean }) {
  const { view, m } = ctx;
  const reveal = view.reveal;
  const result = view.result;
  if (!reveal || !result) return null;
  const title =
    result.winner === 'agents'
      ? m.reveal.agentsWin
      : result.winner === 'spy'
        ? m.reveal.spyWins
        : m.reveal.noWinner;
  const iWon =
    result.winner !== null &&
    (view.me === reveal.spy) === (result.winner === 'spy') &&
    view.players.includes(view.me);

  return (
    <div className="flex flex-col gap-4" data-testid="reveal">
      <Card className={cn('text-center', iWon && 'border-success')}>
        <p data-testid="reveal-winner" className="text-3xl font-bold">
          {title}
        </p>
        <p className="mt-1 text-muted-foreground">{m.reveal.reasons[result.reason]}</p>
        {reveal.spyGuess && (
          <p className="mt-2 text-sm">{m.reveal.spyGuessed(locationName(ctx, reveal.spyGuess))}</p>
        )}
      </Card>

      <Card className="grid grid-cols-2 gap-3 text-center">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.reveal.spyWas}</p>
          <p data-testid="reveal-spy" className="text-xl font-bold text-destructive">
            {ctx.nameOf(reveal.spy)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {m.reveal.locationWas}
          </p>
          <p className="text-xl font-bold">{locationName(ctx, reveal.locationId)}</p>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-2 text-base">{m.reveal.roles}</CardTitle>
        <ul className="divide-y divide-border">
          {[...new Set([...view.players, reveal.spy])].map((id) => (
            <li key={id} className="flex min-h-11 items-center gap-2 py-1.5">
              <span className="flex-1 truncate font-semibold">{ctx.nameOf(id)}</span>
              <span
                className={cn(
                  'text-sm',
                  id === reveal.spy ? 'font-bold text-destructive' : 'text-muted-foreground',
                )}
              >
                {id === reveal.spy
                  ? m.reveal.spyRole
                  : roleName(ctx, reveal.locationId, reveal.roles[id] ?? '')}
              </span>
              <Badge variant="outline">
                {view.scores[id] ?? 0} {m.reveal.wins}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      {isHost ? (
        <Button
          block
          size="lg"
          disabled={ctx.busy}
          onClick={() => void ctx.send({ type: 'NEXT_ROUND' })}
        >
          {m.reveal.nextRound}
        </Button>
      ) : (
        <p className="text-center text-muted-foreground">{m.reveal.waitingHost}</p>
      )}
    </div>
  );
}

function Confirm({
  ctx,
  text,
  onConfirm,
  onCancel,
}: {
  ctx: Ctx;
  text: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <div className="mt-3 rounded-xl bg-muted p-3">
      <p className="mb-2 font-semibold">{text}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="destructive" disabled={ctx.busy} onClick={onConfirm}>
          {ctx.m.confirm}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {ctx.m.cancel}
        </Button>
      </div>
    </div>
  );
}
