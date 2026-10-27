'use client';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  cn,
  Countdown,
  HoldToReveal,
  PixelAvatar,
  PixelIcon,
} from '@batonboard/ui';
import type { GameScreenProps, Locale, PlayerInfo } from '@batonboard/ui';
import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
// เฉพาะชื่อโวหาร — ห้าม import ประโยค (../data/sentences) ฝั่ง client
import { getFigure } from '../data/figures';
import type { PoetsAction, PoetsView, VoteRound } from '../rules/types';
import { POETS_ICON } from './icon';
import { canVote, champions, currentReader, standings, tally, voteTargets } from './logic';
import { poetsMessages } from './messages';
import type { PoetsMessages } from './messages';

interface Ctx {
  view: PoetsView;
  m: PoetsMessages;
  locale: Locale;
  nameOf(id: string): string;
  figureName(id: string): string;
  send(action: PoetsAction): Promise<boolean>;
  busy: boolean;
}

const emblem = <PixelIcon rows={POETS_ICON} className="size-full" />;

export function PoetsScreen(props: GameScreenProps) {
  // view มาจาก server ของเราเอง (playerView ของ poets) จึงแปลง type ตรง ๆ ได้
  const view = props.view as PoetsView;
  const m = poetsMessages[props.locale];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // รอบใหม่กดจากปุ่มล่างสุดของหน้าเฉลย — เลื่อนกลับบนสุดให้เห็นการ์ดทันที
  const seenRound = useRef(view.round);
  useEffect(() => {
    if (seenRound.current !== view.round) window.scrollTo(0, 0);
    seenRound.current = view.round;
  }, [view.round]);

  const nameOf = (id: string) => props.players.find((p) => p.id === id)?.name ?? '?';
  const figureName = (id: string) => getFigure(id)?.name[props.locale] ?? id;

  async function send(action: PoetsAction): Promise<boolean> {
    setBusy(true);
    setError(null);
    const code = await props.sendAction(action);
    setBusy(false);
    if (code === null) return true;
    setError((m.errors as Record<string, string>)[code] ?? props.platformError(code));
    return false;
  }

  const ctx: Ctx = { view, m, locale: props.locale, nameOf, figureName, send, busy };
  const isHost = props.hostId === view.me;
  const firstRound = view.voteRounds[0];

  return (
    <div data-phase={view.phase}>
      <Backdrop />
      {/* relative: ให้เนื้อหาวาดทับ Backdrop ที่เป็น fixed */}
      <div className="relative flex flex-col gap-4">
        <Header ctx={ctx} serverOffset={props.serverOffset} />

        {view.phase === 'reveal' ? (
          <Reveal ctx={ctx} isHost={isHost} />
        ) : (
          <>
            {view.you.role === 'moderator' ? <ModeratorPanel ctx={ctx} /> : <PoetCard ctx={ctx} />}
            {view.phase === 'reading' && (
              <ReadingPanel ctx={ctx} players={props.players} isHost={isHost} />
            )}
            {view.phase === 'discussion' && <StartVote ctx={ctx} isHost={isHost} />}
            {view.phase === 'voting' && <VotePanel ctx={ctx} />}
            {view.phase === 'voting' && firstRound && <FirstRound ctx={ctx} round={firstRound} />}
            {view.phase !== 'reading' && <Board ctx={ctx} />}
          </>
        )}

        {error && (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** พื้นหลังแบบสมุดกลอน: เส้นบรรทัดจาง ๆ */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:100%_34px] [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_75%)]" />
    </div>
  );
}

/** แผ่นกระดาษที่มีป้ายชื่อมุมบน */
function Sheet({
  label,
  tone = 'border-border',
  className,
  children,
  ...props
}: {
  label: ReactNode;
  tone?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section className="relative pt-4" {...props}>
      <span
        className={cn(
          'absolute left-4 top-0 z-10 max-w-[80%] truncate rounded-full border bg-card px-3 py-0.5 text-xs font-semibold text-muted-foreground',
          tone,
        )}
      >
        {label}
      </span>
      <Card className={cn('pt-6', tone, className)}>{children}</Card>
    </section>
  );
}

function Header({ ctx, serverOffset }: { ctx: Ctx; serverOffset: number }) {
  const { view, m } = ctx;
  const timed = view.phase === 'discussion' || view.phase === 'voting';
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {m.town} · <span data-testid="round">{m.round(view.round, view.rounds)}</span>
        </p>
        <span
          className={cn(
            'mt-1 inline-block -rotate-2 rounded-md border-2 px-2 py-0.5 text-sm font-bold',
            view.phase === 'reveal'
              ? 'border-success text-success'
              : view.phase === 'voting'
                ? 'border-destructive text-destructive'
                : 'border-primary text-primary',
          )}
        >
          {m.phase[view.phase]}
        </span>
      </div>
      {timed && (
        <Countdown
          deadline={view.deadline}
          serverOffset={serverOffset}
          warnBelowMs={15_000}
          className="shrink-0"
        />
      )}
    </header>
  );
}

/** host ที่ดำเนินเกม: เห็นไพ่ทุกคน ซ่อนไว้ก่อนเพราะจอนี้อาจขึ้นโปรเจกเตอร์ */
function ModeratorPanel({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const [open, setOpen] = useState(false);
  if (view.you.role !== 'moderator') return null;
  const reader = currentReader(view);
  return (
    <Sheet label={m.moderator.title} tone="border-primary" data-testid="moderator-panel">
      <p className="mb-3 text-xs text-muted-foreground">{m.moderator.help}</p>
      {open ? (
        <ol className="divide-y divide-border">
          {view.you.cards.map((card) => (
            <li
              key={card.player}
              data-testid="moderator-card"
              data-spy={card.spy}
              className={cn(
                'flex items-start gap-2 rounded-xl px-2 py-2.5',
                card.spy && 'bg-destructive/10',
                card.player === reader && 'ring-2 ring-primary',
              )}
            >
              <PixelAvatar name={ctx.nameOf(card.player)} className="size-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{ctx.nameOf(card.player)}</span>
                  <Badge variant={card.spy ? 'danger' : 'secondary'}>
                    {ctx.figureName(card.figure)}
                  </Badge>
                  {card.spy && <Badge variant="danger">{m.moderator.spy}</Badge>}
                </p>
                <p className="leading-relaxed">“{card.text}”</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-2 text-center text-sm text-muted-foreground">{m.moderator.hidden}</p>
      )}
      <Button
        block
        variant={open ? 'outline' : 'secondary'}
        className="mt-3"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? m.moderator.hide : m.moderator.show}
      </Button>
    </Sheet>
  );
}

function PoetCard({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  if (view.you.role !== 'poet') {
    return <Card className="text-center text-muted-foreground">{m.card.spectator}</Card>;
  }
  const you = view.you;
  const figure = you.figure ? getFigure(you.figure) : undefined;
  return (
    <div className="space-y-2">
      <HoldToReveal
        hint={m.card.hint}
        backLabel={m.card.back}
        emblem={emblem}
        showLabel={m.card.show}
        hideLabel={m.card.hide}
      >
        <div data-testid="poet-card" className="space-y-3">
          {you.figure ? (
            <div>
              <p className="text-xs text-muted-foreground">{m.card.figure}</p>
              <p data-testid="poet-figure" className="text-2xl font-bold text-primary">
                {ctx.figureName(you.figure)}
              </p>
              {figure && <p className="text-xs text-muted-foreground">{figure.hint[ctx.locale]}</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{m.card.hidden}</p>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{m.card.line}</p>
            <p data-testid="poet-line" className="text-lg font-semibold leading-relaxed">
              “{you.text}”
            </p>
          </div>
        </div>
      </HoldToReveal>
      <p className="text-center text-xs text-muted-foreground">{m.card.spyHint}</p>
    </div>
  );
}

/** ลำดับการอ่าน: คนที่อ่านแล้วแสดงประโยค คนที่ถึงตากดอ่านจบ host ข้ามให้ได้ */
function ReadingPanel({
  ctx,
  players,
  isHost,
}: {
  ctx: Ctx;
  players: PlayerInfo[];
  isHost: boolean;
}) {
  const { view, m } = ctx;
  const reader = currentReader(view);
  const myTurn = reader === view.me;
  return (
    <Sheet label={m.reading.title} tone="border-primary" data-testid="reading-panel">
      <p className="mb-3 text-xs text-muted-foreground">{m.reading.help}</p>
      <ol className="space-y-2">
        {view.order.map((id, i) => {
          const line = view.readLines.find((l) => l.player === id);
          const now = id === reader;
          const info = players.find((p) => p.id === id);
          const gone = !view.players.includes(id);
          return (
            <li
              key={id}
              data-testid="reading-row"
              className={cn(
                'flex items-start gap-2 rounded-xl px-2 py-2',
                now && 'bg-primary/10 ring-2 ring-primary',
                gone && 'opacity-50',
              )}
            >
              <span className="mt-1 w-5 shrink-0 text-center font-mono text-sm text-muted-foreground">
                {i + 1}
              </span>
              <PixelAvatar name={ctx.nameOf(id)} className="size-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">
                  <span className={cn('truncate', id === view.me && 'text-primary')}>
                    {ctx.nameOf(id)}
                  </span>
                  {id === view.me && (
                    <span className="text-xs font-normal text-muted-foreground">({m.you})</span>
                  )}
                  {info && !info.online && <Badge variant="outline">{m.offline}</Badge>}
                </p>
                {line ? (
                  <p className="text-sm leading-relaxed">“{line.text}”</p>
                ) : (
                  <p className={cn('text-xs', now ? 'text-primary' : 'text-muted-foreground')}>
                    {now ? m.reading.now : m.reading.waiting}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {myTurn ? (
        <div className="mt-4 space-y-2">
          <p className="text-center font-semibold text-primary">{m.reading.yourTurn}</p>
          <Button
            block
            size="lg"
            disabled={ctx.busy}
            onClick={() => void ctx.send({ type: 'READ_DONE' })}
          >
            {m.reading.done}
          </Button>
        </div>
      ) : (
        isHost &&
        reader &&
        (view.you.role === 'moderator' ? (
          // ผู้ดำเนินเกมกดให้ทีละคนหลังนักเรียนอ่านจบ
          <Button
            block
            size="lg"
            className="mt-4"
            disabled={ctx.busy}
            onClick={() => void ctx.send({ type: 'READ_DONE' })}
          >
            {m.moderator.doneFor(ctx.nameOf(reader))}
          </Button>
        ) : (
          <Button
            block
            variant="outline"
            className="mt-4"
            disabled={ctx.busy}
            onClick={() => void ctx.send({ type: 'READ_DONE' })}
          >
            {m.reading.skip(ctx.nameOf(reader))}
          </Button>
        ))
      )}
    </Sheet>
  );
}

/** กระดานกลอน: ทุกประโยคที่อ่านแล้ว ใช้ตอนคุยและโหวต */
function Board({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const voted = view.vote?.voted ?? [];
  return (
    <Sheet label={m.board.title} data-testid="poem-board">
      {view.readLines.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{m.board.empty}</p>
      ) : (
        <ol className="divide-y divide-border">
          {view.readLines.map((line) => (
            <li key={line.player} className="flex items-start gap-2 py-2.5">
              <PixelAvatar name={ctx.nameOf(line.player)} className="size-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p
                  className={cn('text-sm font-semibold', line.player === view.me && 'text-primary')}
                >
                  {ctx.nameOf(line.player)}
                </p>
                <p className="leading-relaxed">“{line.text}”</p>
              </div>
              {voted.includes(line.player) && <Badge variant="secondary">✓</Badge>}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

function StartVote({ ctx, isHost }: { ctx: Ctx; isHost: boolean }) {
  const { m } = ctx;
  const [asking, setAsking] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-center text-sm text-muted-foreground">{m.discussion.hint}</p>
      {isHost &&
        (asking ? (
          <Confirm
            ctx={ctx}
            text={m.discussion.confirm}
            onConfirm={() => {
              setAsking(false);
              void ctx.send({ type: 'START_VOTE' });
            }}
            onCancel={() => setAsking(false)}
          />
        ) : (
          <Button block variant="secondary" disabled={ctx.busy} onClick={() => setAsking(true)}>
            {m.discussion.button}
          </Button>
        ))}
    </div>
  );
}

function VotePanel({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const vote = view.vote;
  const [target, setTarget] = useState<string | null>(null);
  if (!vote) return null;
  const revote = vote.round > 1;

  return (
    <Sheet label={m.phase.voting} tone="border-destructive" data-testid="vote-panel">
      <CardTitle className="mb-1">{revote ? m.vote.revoteTitle : m.vote.title}</CardTitle>
      <p className="mb-2 text-xs text-muted-foreground">
        {revote ? m.vote.revoteHelp : m.vote.help}
      </p>
      <p className="mb-3 text-sm text-muted-foreground">
        {m.vote.progress(vote.voted.length, view.players.length)}
      </p>

      {vote.myVote !== null ? (
        <p className="py-2 text-center font-semibold">{m.vote.voted(ctx.nameOf(vote.myVote))}</p>
      ) : canVote(view) ? (
        target ? (
          <Confirm
            ctx={ctx}
            text={m.vote.confirm(ctx.nameOf(target))}
            onConfirm={() => {
              setTarget(null);
              void ctx.send({ type: 'VOTE', target });
            }}
            onCancel={() => setTarget(null)}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {voteTargets(view).map((id) => (
              <li key={id}>
                <button
                  type="button"
                  disabled={ctx.busy}
                  onClick={() => setTarget(id)}
                  className="flex min-h-14 w-full items-center gap-2 rounded-xl border border-border bg-card px-2 py-2 text-left font-semibold transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  <PixelAvatar name={ctx.nameOf(id)} className="size-8 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{ctx.nameOf(id)}</span>
                  <span className="text-xs text-primary">{m.vote.choose}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        view.you.role !== 'spectator' && (
          <p className="py-2 text-center text-muted-foreground">
            {view.you.role === 'moderator' ? m.moderator.noVote : m.vote.noChoice}
          </p>
        )
      )}
    </Sheet>
  );
}

/** ผลรอบแรกตอนโหวตใหม่ (คะแนนเสมอ) */
function FirstRound({ ctx, round }: { ctx: Ctx; round: VoteRound }) {
  const { view, m } = ctx;
  return (
    <Sheet label={m.vote.firstRound} data-testid="vote-results">
      <ul className="space-y-1">
        {tally(round, view.players).map(({ id, votes }) => (
          <li key={id} className="flex items-center gap-2 px-1">
            <PixelAvatar name={ctx.nameOf(id)} className="size-6" />
            <span className="min-w-0 flex-1 truncate">{ctx.nameOf(id)}</span>
            <span className="font-mono text-sm">{m.vote.votes(votes)}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function Reveal({ ctx, isHost }: { ctx: Ctx; isHost: boolean }) {
  const { view, m } = ctx;
  const reveal = view.reveal;
  const result = view.result;
  if (!reveal || !result) return null;
  const title =
    result.winner === 'village'
      ? m.reveal.safe
      : result.winner === 'spy'
        ? m.reveal.punished
        : m.reveal.noWinner;
  const decided = view.voteRounds.at(-1);
  const voted = result.reason === 'caught' || result.reason === 'missed';

  return (
    <div className="flex flex-col gap-4" data-testid="reveal">
      <div className="text-center">
        <p
          data-testid="reveal-winner"
          className={cn(
            'inline-block animate-stamp rounded-xl border-4 px-4 py-1 text-3xl font-black motion-reduce:animate-none',
            result.winner === 'village'
              ? 'border-success text-success'
              : result.winner === 'spy'
                ? 'border-destructive text-destructive'
                : 'border-border text-foreground',
          )}
        >
          {title}
        </p>
        {voted && (
          <p className="mt-2 text-sm text-muted-foreground">
            {view.accused ? m.reveal.chosen(ctx.nameOf(view.accused)) : m.reveal.noOne}
          </p>
        )}
        {result.winners.length > 0 && (
          <p data-testid="reveal-winners" className="mt-1 font-semibold">
            {m.reveal.winners(result.winners.map(ctx.nameOf).join(', '), result.points)}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">{m.reveal.reasons[result.reason]}</p>
      </div>

      <div className="animate-rise motion-reduce:animate-none">
        <Sheet label={m.reveal.spyWas} tone="border-destructive" className="text-center">
          <div className="flex items-center justify-center gap-3">
            <PixelAvatar name={ctx.nameOf(reveal.spy)} className="size-12 rounded-xl" />
            <p data-testid="reveal-spy" className="text-2xl font-bold text-destructive">
              {ctx.nameOf(reveal.spy)}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-left">
            <FigureBox ctx={ctx} label={m.reveal.villageFigure} id={reveal.figure} />
            <FigureBox ctx={ctx} label={m.reveal.spyFigure} id={reveal.spyFigure} spy />
          </div>
        </Sheet>
      </div>

      <div className="animate-rise [animation-delay:150ms] motion-reduce:animate-none">
        <Sheet label={m.reveal.lines} data-testid="reveal-lines">
          <ol className="divide-y divide-border">
            {reveal.lines.map((line) => {
              const spy = line.player === reveal.spy;
              const ballot = decided?.ballots[line.player];
              const also = line.figures.slice(1);
              return (
                <li key={line.player} className="flex items-start gap-2 py-2.5">
                  <PixelAvatar name={ctx.nameOf(line.player)} className="size-8 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1">
                      <span className="font-semibold">{ctx.nameOf(line.player)}</span>
                      <Badge variant={spy ? 'danger' : 'secondary'}>
                        {ctx.figureName(line.figures[0] ?? '')}
                      </Badge>
                      {result.winners.includes(line.player) && (
                        <Badge variant="success">+{result.points}</Badge>
                      )}
                    </p>
                    <p className={cn('leading-relaxed', spy && 'font-semibold text-destructive')}>
                      “{line.text}”
                    </p>
                    {line.note && <p className="text-xs text-muted-foreground">{line.note}</p>}
                    {also.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {m.reveal.alsoFits(also.map(ctx.figureName).join(', '))}
                      </p>
                    )}
                    {ballot && (
                      <p
                        className={cn(
                          'text-xs',
                          ballot === reveal.spy ? 'text-success' : 'text-muted-foreground',
                        )}
                      >
                        {m.reveal.votedFor(ctx.nameOf(ballot))}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Sheet>
      </div>

      <div className="animate-rise [animation-delay:300ms] motion-reduce:animate-none">
        <Scoreboard ctx={ctx} />
      </div>

      <div className="animate-rise [animation-delay:450ms] motion-reduce:animate-none">
        {isHost ? (
          <Button
            block
            size="lg"
            disabled={ctx.busy}
            onClick={() => void ctx.send({ type: 'NEXT_ROUND' })}
          >
            {view.matchOver ? m.reveal.newMatch : m.reveal.nextRound}
          </Button>
        ) : (
          <p className="text-center text-muted-foreground">
            {view.matchOver ? m.reveal.waitingHostMatch : m.reveal.waitingHost}
          </p>
        )}
      </div>
    </div>
  );
}

function FigureBox({
  ctx,
  label,
  id,
  spy,
}: {
  ctx: Ctx;
  label: string;
  id: string;
  spy?: boolean;
}) {
  const figure = getFigure(id);
  return (
    <div
      className={cn(
        'rounded-xl border-2 p-2',
        spy ? 'border-destructive/60 bg-destructive/5' : 'border-success/60 bg-success/5',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p data-testid={spy ? 'reveal-spy-figure' : 'reveal-figure'} className="font-bold">
        {ctx.figureName(id)}
      </p>
      {figure && <p className="text-xs text-muted-foreground">{figure.hint[ctx.locale]}</p>}
    </div>
  );
}

/** คะแนนรวมของแมตช์ — รอบสุดท้ายประกาศแชมป์ */
function Scoreboard({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const winners = view.result?.winners ?? [];
  const gained = view.result?.points ?? 1;
  const champs = view.matchOver ? champions(view) : [];
  return (
    <Sheet
      label={view.matchOver ? m.reveal.matchOver : m.reveal.scoreboard}
      tone={view.matchOver ? 'border-success' : undefined}
      data-testid="scoreboard"
    >
      {champs.length > 0 && (
        <p
          data-testid="champions"
          className="mb-3 animate-stamp text-center text-xl font-black text-success motion-reduce:animate-none"
        >
          🏆 {m.reveal.champions(champs.map(ctx.nameOf).join(', '))}
        </p>
      )}
      <ol className="space-y-1">
        {standings(view).map(({ id, score, rank }) => (
          <li
            key={id}
            className={cn(
              'flex min-h-10 items-center gap-2 rounded-lg px-2',
              champs.includes(id) && 'bg-success/10 font-bold',
            )}
          >
            <span className="w-5 text-center font-mono text-sm text-muted-foreground">{rank}</span>
            <PixelAvatar name={ctx.nameOf(id)} className="size-7" />
            <span className={cn('min-w-0 flex-1 truncate', id === view.me && 'text-primary')}>
              {ctx.nameOf(id)}
            </span>
            {winners.includes(id) && <span className="text-xs text-success">+{gained}</span>}
            <span className="font-mono text-sm font-semibold">{m.reveal.points(score)}</span>
          </li>
        ))}
      </ol>
    </Sheet>
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
