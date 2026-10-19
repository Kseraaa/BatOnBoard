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
import type { SpyfallAction, SpyfallView, VoteResult } from '../rules/types';
import { deckFor } from './deck';
import type { DeckLocation } from './deck';
import { SPYFALL_ICON } from './icon';
import { canAccuse, canBallot, canGuess, canPass, voterCount } from './logic';
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
            {view.phase === 'voting' && <VotePanel ctx={ctx} serverOffset={props.serverOffset} />}
            {view.phase === 'final-vote' && <FinalPanel ctx={ctx} />}
            {view.phase !== 'voting' && <LastVotePanel ctx={ctx} />}
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
            className="[text-shadow:0_0_18px_color-mix(in_oklch,currentColor_45%,transparent)]"
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

function VotePanel({ ctx, serverOffset }: { ctx: Ctx; serverOffset: number }) {
  const { view, m } = ctx;
  const vote = view.vote;
  if (!vote) return null;
  const isAccused = vote.accused === view.me;
  return (
    <Dossier label={m.phase.voting} tone="border-primary">
      <div className="mb-2 flex items-center gap-2" aria-hidden>
        <PixelAvatar name={ctx.nameOf(vote.accuser)} />
        <span className="font-mono text-muted-foreground">→</span>
        <PixelAvatar name={ctx.nameOf(vote.accused)} className="ring-2 ring-destructive" />
      </div>
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
    </Dossier>
  );
}

/** ผลโหวตที่ไม่ผ่าน: พลิกบัตรทีละใบให้ทุกคนเห็นว่าใครโหวตอะไร */
function LastVotePanel({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  const result = ctx.view.lastVote;
  const key = result ? `${result.accuser}:${result.accused}:${result.final}` : '';
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!result || result.passed || dismissed === key) return null;
  return (
    <Dossier label={m.lastVote.failed} tone="border-destructive/60">
      <p className="mb-3 text-sm font-semibold">
        {m.lastVote.title(ctx.nameOf(result.accuser), ctx.nameOf(result.accused))}
      </p>
      <Ballots key={key} ctx={ctx} result={result} />
      <Button block variant="ghost" className="mt-2" onClick={() => setDismissed(key)}>
        {m.lastVote.dismiss}
      </Button>
    </Dossier>
  );
}

function Ballots({ ctx, result }: { ctx: Ctx; result: VoteResult }) {
  const { m } = ctx;
  // ผู้กล่าวหาก่อน แล้วตามลำดับผู้เล่น
  const entries = Object.entries(result.ballots).sort(
    ([a], [b]) => Number(b === result.accuser) - Number(a === result.accuser),
  );
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
      {entries.map(([id, ballot], i) => {
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
                  ballot === true && 'border-success text-success',
                  ballot === false && 'border-destructive text-destructive',
                  ballot === null && 'border-border text-muted-foreground',
                )}
              >
                <span aria-hidden className="text-2xl font-black leading-none">
                  {ballot === true ? '✓' : ballot === false ? '✗' : '–'}
                </span>
                <span className="text-[0.65rem] font-semibold leading-tight">
                  {ballot === true
                    ? m.vote.agree
                    : ballot === false
                      ? m.vote.disagree
                      : m.lastVote.none}
                </span>
                <span className="w-full truncate text-[0.65rem] text-foreground">
                  {id === result.accuser ? m.lastVote.accuser : name}
                </span>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

function FinalPanel({ ctx }: { ctx: Ctx }) {
  const { view, m } = ctx;
  return (
    <Dossier label={m.phase['final-vote']} tone="border-destructive">
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
    </Dossier>
  );
}

function PlayerList({ ctx, players }: { ctx: Ctx; players: PlayerInfo[] }) {
  const { view, m } = ctx;
  const [target, setTarget] = useState<string | null>(null);
  const accusing = canAccuse(view);
  const used = view.phase === 'final-vote' ? view.finalTurns : view.usedAccusation;

  return (
    <Dossier label={m.players}>
      {accusing && <p className="mb-2 text-xs text-muted-foreground">{m.accuseHelp}</p>}
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
    </Dossier>
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
    <Dossier label={m.spy.guess} tone="border-destructive" data-testid="spy-guess">
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
      <Button block variant="ghost" className="mt-2" onClick={() => setOpen(false)}>
        {m.cancel}
      </Button>
    </Dossier>
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

type RevealStage = 'votes' | 'suspense' | 'spy' | 'done';

/**
 * ฉากเฉลยแบบมีจังหวะ: (บัตรโหวตพลิกทีละใบ ถ้าจบด้วยโหวต) → "สายลับคือ…" → ไพ่พลิก → ผล
 * ทุกจอเข้า reveal พร้อมกันตาม poll จึงลุ้นไปพร้อม ๆ กัน ข้ามได้ และ reduced motion ข้ามให้เลย
 */
function Reveal({ ctx, isHost }: { ctx: Ctx; isHost: boolean }) {
  const { view, m } = ctx;
  const reveal = view.reveal;
  const result = view.result;
  const vote = view.lastVote?.passed ? view.lastVote : null;
  const voteCount = vote ? Object.keys(vote.ballots).length : 0;
  const [stage, setStage] = useState<RevealStage>(() =>
    prefersReducedMotion() ? 'done' : vote ? 'votes' : 'suspense',
  );

  useEffect(() => {
    if (stage === 'done') return;
    const [ms, next]: [number, RevealStage] =
      stage === 'votes'
        ? [voteCount * BALLOT_STEP_MS + 900, 'suspense']
        : stage === 'suspense'
          ? [1600, 'spy']
          : [1300, 'done'];
    const t = window.setTimeout(() => setStage(next), ms);
    return () => window.clearTimeout(t);
  }, [stage, voteCount]);

  if (!reveal || !result) return null;
  const title =
    result.winner === 'agents'
      ? m.reveal.agentsWin
      : result.winner === 'spy'
        ? m.reveal.spyWins
        : m.reveal.noWinner;
  const spyName = ctx.nameOf(reveal.spy);

  return (
    <div className="flex flex-col gap-4" data-testid="reveal">
      {stage === 'votes' && vote && (
        <Dossier label={m.lastVote.passed} tone="border-success">
          <p className="mb-3 text-sm font-semibold">
            {m.lastVote.title(ctx.nameOf(vote.accuser), ctx.nameOf(vote.accused))}
          </p>
          <Ballots ctx={ctx} result={vote} />
        </Dossier>
      )}

      {stage !== 'votes' && (
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
      )}

      {stage === 'done' ? (
        <>
          <div className="text-center">
            <p
              data-testid="reveal-winner"
              className={cn(
                'inline-block animate-stamp rounded-xl border-4 px-4 py-1 text-3xl font-black motion-reduce:animate-none',
                result.winner === 'agents'
                  ? 'border-success text-success'
                  : result.winner === 'spy'
                    ? 'border-destructive text-destructive'
                    : 'border-border text-foreground',
              )}
            >
              {title}
            </p>
            <p className="mt-2 text-muted-foreground">{m.reveal.reasons[result.reason]}</p>
            {reveal.spyGuess && (
              <p className="mt-1 text-sm">
                {m.reveal.spyGuessed(locationName(ctx, reveal.spyGuess))}
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
                {[...new Set([...view.players, reveal.spy])].map((id) => (
                  <li key={id} className="flex min-h-11 items-center gap-2 py-1.5">
                    <PixelAvatar name={ctx.nameOf(id)} className="size-8" />
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
