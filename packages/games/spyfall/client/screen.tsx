'use client';

import {
  Badge,
  Button,
  Card,
  CardBack,
  CardFace,
  CardTitle,
  cn,
  Countdown,
  FlipCard,
  HoldToReveal,
  PixelAvatar,
  PixelIcon,
  prefersReducedMotion,
} from '@batonboard/ui';
import type { GameScreenProps, Locale, PlayerInfo } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { getLocationSet } from '../data';
import type { SpyfallAction, SpyfallView, VoteRound } from '../rules/types';
import { deckFor } from './deck';
import type { DeckLocation } from './deck';
import { SPYFALL_ICON } from './icon';
import { canGuess, canStartVote, canVote, tally, voteTargets } from './logic';
import { spyfallMessages } from './messages';
import type { SpyfallMessages } from './messages';

interface Ctx {
  view: SpyfallView;
  m: SpyfallMessages;
  locale: Locale;
  /** สถานที่ที่ใช้ในห้องนี้ (ชุดมาตรฐานที่เปิด + ที่สร้างเอง) */
  deck: DeckLocation[];
  nameOf(id: string): string;
  send(action: SpyfallAction): Promise<boolean>;
  busy: boolean;
}

/** ระยะห่างระหว่างการพลิกบัตรโหวตแต่ละใบ */
const BALLOT_STEP_MS = 380;

const emblem = <PixelIcon rows={SPYFALL_ICON} className="size-full" />;

export function SpyfallScreen(props: GameScreenProps) {
  // view มาจาก server ของเราเอง (playerView ของ spyfall) จึงแปลง type ตรง ๆ ได้
  const view = props.view as SpyfallView;
  const m = spyfallMessages[props.locale];
  const deck = deckFor(getLocationSet(view.locationSetId), props.options, props.locale);
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

  const ctx: Ctx = { view, m, locale: props.locale, deck, nameOf, send, busy };
  const lastRound = view.voteRounds.at(-1);

  return (
    <div data-phase={view.phase}>
      <Backdrop />
      {/* relative: ให้เนื้อหาวาดทับ Backdrop ที่เป็น fixed */}
      <div className="relative flex flex-col gap-4">
        <Header ctx={ctx} serverOffset={props.serverOffset} />

        {view.phase === 'reveal' ? (
          <Reveal ctx={ctx} isHost={props.hostId === view.me} />
        ) : (
          <>
            <RoleCard ctx={ctx} />
            {view.phase === 'questioning' && (
              <StartVote ctx={ctx} isHost={canStartVote(view, props.hostId)} />
            )}
            {view.phase === 'voting' && <VotePanel ctx={ctx} />}
            {/* รอบโหวตใหม่ (เสมอ) แสดงผลรอบแรกให้ดูว่าเสมอกันยังไง */}
            {view.phase === 'voting' && lastRound && (
              <VoteResults ctx={ctx} round={lastRound} index={view.voteRounds.length} />
            )}
            {view.phase === 'guessing' && lastRound && (
              <VoteResults
                ctx={ctx}
                round={lastRound}
                index={view.voteRounds.length}
                chosen={view.accused}
              />
            )}
            {view.phase === 'guessing' && <GuessPanel ctx={ctx} />}
            <PlayerList ctx={ctx} players={props.players} />
            <LocationList ctx={ctx} />
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

function locationName(ctx: Ctx, id: string): string {
  return ctx.deck.find((l) => l.id === id)?.name ?? id;
}

function roleName(ctx: Ctx, locationId: string, roleId: string): string {
  const loc = ctx.deck.find((l) => l.id === locationId);
  return loc?.roles.find((r) => r.id === roleId)?.name ?? roleId;
}

/** พื้นหลังธีมแฟ้มลับ: ตารางจาง ๆ กับเส้นสแกนแบบจอเรดาร์ */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_75%)]" />
      <div className="absolute inset-x-0 top-0 h-28 animate-scan bg-gradient-to-b from-transparent via-primary/[0.06] to-transparent motion-reduce:hidden" />
    </div>
  );
}

/** แผ่นข้อมูลแบบแฟ้มเอกสาร มีแถบชื่อเหมือนแฟ้ม */
function Dossier({
  label,
  tone = 'border-border',
  className,
  children,
  ...props
}: {
  label: ReactNode;
  /** class สีขอบ ใช้กับทั้งแถบชื่อและตัวแฟ้ม */
  tone?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section className="relative pt-5" {...props}>
      <span
        className={cn(
          'absolute left-4 top-0 z-10 h-6 max-w-[80%] truncate rounded-t-lg border border-b-0 bg-card px-3 pt-0.5 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground',
          tone,
        )}
      >
        {label}
      </span>
      <Card className={cn(tone, className)}>{children}</Card>
    </section>
  );
}

function Header({ ctx, serverOffset }: { ctx: Ctx; serverOffset: number }) {
  const { view, m } = ctx;
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
          {m.dossier}
        </p>
        <span
          className={cn(
            'mt-1 inline-block -rotate-2 rounded-md border-2 px-2 py-0.5 text-sm font-bold',
            view.phase === 'reveal'
              ? 'border-success text-success'
              : view.phase === 'questioning'
                ? 'border-primary text-primary'
                : 'border-destructive text-destructive',
          )}
        >
          {m.phase[view.phase]}
        </span>
        {view.phase === 'questioning' && (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {m.firstAsker(ctx.nameOf(view.firstAsker))}
          </p>
        )}
      </div>
      {view.phase !== 'reveal' && (
        <Countdown
          deadline={view.deadline}
          serverOffset={serverOffset}
          warnBelowMs={view.phase === 'questioning' ? 60_000 : 15_000}
          className="[text-shadow:0_0_18px_color-mix(in_oklch,currentColor_45%,transparent)]"
        />
      )}
    </header>
  );
}

/** ช่วงถามตอบ: บอกว่าโหวตจะเริ่มเมื่อไหร่ และให้ host เริ่มก่อนได้ */
function StartVote({ ctx, isHost }: { ctx: Ctx; isHost: boolean }) {
  const { m } = ctx;
  const [asking, setAsking] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-muted-foreground">{m.startVote.hint}</p>
      {isHost &&
        (asking ? (
          <Confirm
            ctx={ctx}
            text={m.startVote.confirm}
            onConfirm={() => {
              setAsking(false);
              void ctx.send({ type: 'START_VOTE' });
            }}
            onCancel={() => setAsking(false)}
          />
        ) : (
          <Button block variant="secondary" disabled={ctx.busy} onClick={() => setAsking(true)}>
            {m.startVote.button}
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
  const targets = voteTargets(view);
  const revote = vote.round > 1;

  return (
    <Dossier label={m.phase.voting} tone="border-primary" data-testid="vote-panel">
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
            {targets.map((id) => (
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
          <p className="py-2 text-center text-muted-foreground">{m.vote.noChoice}</p>
        )
      )}
    </Dossier>
  );
}

/** ผลโหวตรอบที่ปิดแล้ว: คะแนนของแต่ละคน + บัตรของทุกคนพลิกทีละใบ */
function VoteResults({
  ctx,
  round,
  index,
  chosen,
}: {
  ctx: Ctx;
  round: VoteRound;
  /** ลำดับรอบ (1, 2) */
  index: number;
  /** คนที่ถูกเลือก — ส่งมาเฉพาะตอนโหวตจบแล้ว (undefined = รอบนี้เสมอ ยังโหวตต่อ) */
  chosen?: string | null;
}) {
  const { view, m } = ctx;
  const scores = tally(round, view.players);
  return (
    <Dossier label={m.result.title(index)} tone="border-destructive/60" data-testid="vote-results">
      {chosen !== undefined && (
        <p data-testid="vote-chosen" className="mb-3 text-center text-lg font-bold">
          {chosen ? m.result.chosen(ctx.nameOf(chosen)) : m.result.noOne}
        </p>
      )}
      <ul className="mb-3 space-y-1">
        {scores.map(({ id, votes }) => (
          <li
            key={id}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1',
              id === chosen && 'bg-destructive/10 font-bold',
            )}
          >
            <PixelAvatar name={ctx.nameOf(id)} className="size-6" />
            <span className="min-w-0 flex-1 truncate">{ctx.nameOf(id)}</span>
            <span className="font-mono text-sm">{m.result.votes(votes)}</span>
          </li>
        ))}
      </ul>
      <Ballots key={index} ctx={ctx} round={round} />
    </Dossier>
  );
}

function Ballots({ ctx, round }: { ctx: Ctx; round: VoteRound }) {
  const { m } = ctx;
  const entries = Object.entries(round.ballots);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(entries.length);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= entries.length) window.clearInterval(id);
    }, BALLOT_STEP_MS);
    return () => window.clearInterval(id);
  }, [entries.length]);

  return (
    <div className="grid grid-cols-4 gap-2">
      {entries.map(([id, target], i) => {
        const name = ctx.nameOf(id);
        return (
          <FlipCard
            key={id}
            flipped={i < shown}
            className="aspect-[3/4] w-full"
            back={
              <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted p-1.5">
                <PixelAvatar name={name} className="size-8" />
                <span className="w-full truncate text-center text-xs font-semibold">{name}</span>
              </div>
            }
            front={
              <div
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-card p-1.5 text-center',
                  target ? 'border-primary' : 'border-border text-muted-foreground',
                )}
              >
                {target ? (
                  <PixelAvatar name={ctx.nameOf(target)} className="size-7" />
                ) : (
                  <span aria-hidden className="text-2xl font-black leading-none">
                    –
                  </span>
                )}
                <span className="w-full truncate text-[0.65rem] font-semibold leading-tight">
                  {target ? ctx.nameOf(target) : m.result.none}
                </span>
                <span className="w-full truncate text-[0.6rem] text-muted-foreground">{name}</span>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

/** ช่วงสายลับทาย: สายลับเลือกสถานที่ คนอื่นรอ */
function GuessPanel({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  const [choice, setChoice] = useState<string | null>(null);

  if (!canGuess(view)) {
    return (
      <Dossier label={m.phase.guessing} tone="border-destructive">
        <p className="animate-pulse text-center text-lg font-semibold motion-reduce:animate-none">
          {m.guess.waiting}
        </p>
        <p className="mt-1 text-center text-xs text-muted-foreground">{m.guess.waitingHelp}</p>
      </Dossier>
    );
  }

  return (
    <Dossier label={m.phase.guessing} tone="border-destructive" data-testid="spy-guess">
      <CardTitle className="mb-1">{m.guess.spyTitle}</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">
        {view.accused === view.me ? m.guess.caughtHelp : m.guess.missedHelp}
      </p>
      {choice ? (
        <Confirm
          ctx={ctx}
          text={m.guess.confirm(locationName(ctx, choice))}
          onConfirm={() => void ctx.send({ type: 'SPY_GUESS', locationId: choice })}
          onCancel={() => setChoice(null)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {ctx.deck.map((l) => (
            <Button
              key={l.id}
              variant="outline"
              size="sm"
              className="h-auto min-h-11 py-2"
              onClick={() => setChoice(l.id)}
            >
              {l.name}
            </Button>
          ))}
        </div>
      )}
    </Dossier>
  );
}

function PlayerList({ ctx, players }: { ctx: Ctx; players: PlayerInfo[] }) {
  const { view, m } = ctx;
  const voted = view.vote?.voted ?? [];
  return (
    <Dossier label={m.players}>
      <ul className="divide-y divide-border">
        {view.players.map((id) => {
          const info = players.find((p) => p.id === id);
          return (
            <li key={id} className="flex min-h-12 items-center gap-2 py-2">
              <PixelAvatar name={ctx.nameOf(id)} className="size-8" />
              <span
                className={cn('flex-1 truncate font-semibold', id === view.me && 'text-primary')}
              >
                {ctx.nameOf(id)}
                {id === view.me && (
                  <span className="ml-1 text-xs text-muted-foreground">({m.you})</span>
                )}
              </span>
              {info && !info.online && <Badge variant="outline">{m.offline}</Badge>}
              {voted.includes(id) && <Badge variant="secondary">✓</Badge>}
            </li>
          );
        })}
      </ul>
    </Dossier>
  );
}

function RoleCard({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  if (view.you.role === 'spectator') {
    return <Card className="text-center text-muted-foreground">{m.card.spectator}</Card>;
  }
  const you = view.you;
  return (
    <HoldToReveal
      hint={m.card.hint}
      backLabel={m.card.back}
      emblem={emblem}
      showLabel={m.card.show}
      hideLabel={m.card.hide}
    >
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
            <p data-testid="role-location" className="text-2xl font-bold">
              {locationName(ctx, you.locationId)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.card.role}</p>
            <p data-testid="role-name" className="text-lg font-semibold">
              {roleName(ctx, you.locationId, you.roleId)}
            </p>
          </div>
        </div>
      )}
    </HoldToReveal>
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
    <Dossier label={m.locations.title}>
      <p className="mb-3 text-xs text-muted-foreground">{m.locations.help}</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {ctx.deck.map((l) => (
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
              {l.name}
            </button>
          </li>
        ))}
      </ul>
    </Dossier>
  );
}

type RevealStage = 'suspense' | 'spy' | 'done';

/**
 * ฉากเฉลยแบบมีจังหวะ: "สายลับคือ…" → ไพ่พลิก → ผล (ผลโหวตเห็นไปแล้วตอนสายลับทาย)
 * ทุกจอเข้า reveal พร้อมกันตาม poll จึงลุ้นไปพร้อม ๆ กัน ข้ามได้ และ reduced motion ข้ามให้เลย
 */
function Reveal({ ctx, isHost }: { ctx: Ctx; isHost: boolean }) {
  const { view, m } = ctx;
  const reveal = view.reveal;
  const result = view.result;
  const [stage, setStage] = useState<RevealStage>(() =>
    prefersReducedMotion() ? 'done' : 'suspense',
  );

  useEffect(() => {
    if (stage === 'done') return;
    const [ms, next]: [number, RevealStage] = stage === 'suspense' ? [1600, 'spy'] : [1300, 'done'];
    const t = window.setTimeout(() => setStage(next), ms);
    return () => window.clearTimeout(t);
  }, [stage]);

  if (!reveal || !result) return null;
  const title =
    result.winner === 'voters'
      ? m.reveal.votersWin
      : result.winner === 'spy'
        ? m.reveal.spyWins
        : m.reveal.noWinner;
  const spyName = ctx.nameOf(reveal.spy);
  // จบด้วยการทาย (ไม่ใช่สายลับออกหรือคนไม่พอ) — บอกว่าสายลับทายอะไร
  const guessed = !['spy-left', 'not-enough-players'].includes(result.reason);
  const lastRound = view.voteRounds.at(-1);

  return (
    <div className="flex flex-col gap-4" data-testid="reveal">
      <div className="flex flex-col items-center gap-3 pt-2">
        <p
          className={cn(
            'font-mono text-sm uppercase tracking-[0.3em] text-muted-foreground',
            stage === 'suspense' && 'animate-pulse motion-reduce:animate-none',
          )}
        >
          {stage === 'suspense' ? m.reveal.suspense : m.reveal.spyWas}
        </p>
        {/* เงาอยู่ที่ wrapper — filter บน FlipCard เองจะทำให้ 3D แบนและเห็นหลังไพ่ตลอด */}
        <div className="w-[min(48vw,11rem)] drop-shadow-xl">
          <FlipCard
            flipped={stage !== 'suspense'}
            lift
            className="aspect-[5/7]"
            back={<CardBack emblem={emblem} label={m.card.back} />}
            front={
              <CardFace emblem={emblem}>
                <div className="flex flex-col items-center gap-2">
                  <PixelAvatar name={spyName} className="size-16 rounded-xl" />
                  <p data-testid="reveal-spy" className="text-xl font-bold text-destructive">
                    {spyName}
                  </p>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {m.reveal.spyRole}
                  </p>
                </div>
              </CardFace>
            }
          />
        </div>
      </div>

      {stage === 'done' ? (
        <>
          <div className="text-center">
            <p
              data-testid="reveal-winner"
              className={cn(
                'inline-block animate-stamp rounded-xl border-4 px-4 py-1 text-3xl font-black motion-reduce:animate-none',
                result.winner === 'voters'
                  ? 'border-success text-success'
                  : result.winner === 'spy'
                    ? 'border-destructive text-destructive'
                    : 'border-border text-foreground',
              )}
            >
              {title}
            </p>
            {result.winner === 'voters' && result.winners.length > 0 && (
              <p data-testid="reveal-winners" className="mt-2 font-semibold">
                {m.reveal.winners(result.winners.map(ctx.nameOf).join(', '))}
              </p>
            )}
            <p className="mt-2 text-muted-foreground">{m.reveal.reasons[result.reason]}</p>
            {guessed && (
              <p className="mt-1 text-sm">
                {reveal.spyGuess
                  ? m.reveal.spyGuessed(locationName(ctx, reveal.spyGuess))
                  : m.reveal.spyNoGuess}
              </p>
            )}
          </div>

          <div className="animate-rise [animation-delay:150ms] motion-reduce:animate-none">
            <Dossier label={m.reveal.locationWas} className="text-center">
              <p className="text-2xl font-bold">{locationName(ctx, reveal.locationId)}</p>
            </Dossier>
          </div>

          <div className="animate-rise [animation-delay:300ms] motion-reduce:animate-none">
            <Dossier label={m.reveal.roles}>
              <ul className="divide-y divide-border">
                {[...new Set([...view.players, reveal.spy])].map((id) => {
                  const ballot = lastRound?.ballots[id];
                  return (
                    <li key={id} className="flex min-h-11 items-center gap-2 py-1.5">
                      <PixelAvatar name={ctx.nameOf(id)} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{ctx.nameOf(id)}</span>
                        {ballot && (
                          <span
                            className={cn(
                              'block truncate text-xs',
                              ballot === reveal.spy ? 'text-success' : 'text-muted-foreground',
                            )}
                          >
                            {m.result.votedFor(ctx.nameOf(ballot))}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-sm',
                          id === reveal.spy
                            ? 'font-bold text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {id === reveal.spy
                          ? m.reveal.spyRole
                          : roleName(ctx, reveal.locationId, reveal.roles[id] ?? '')}
                      </span>
                      <Badge variant={result.winners.includes(id) ? 'success' : 'outline'}>
                        {view.scores[id] ?? 0} {m.reveal.wins}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </Dossier>
          </div>

          <div className="animate-rise [animation-delay:450ms] motion-reduce:animate-none">
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
        </>
      ) : (
        <Button variant="ghost" onClick={() => setStage('done')}>
          {m.reveal.skip}
        </Button>
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
