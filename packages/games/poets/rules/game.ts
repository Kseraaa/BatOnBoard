import { z } from 'zod';
import type { GameDefinition, PlayerId, Rng } from '@batonboard/engine';
import type {
  PoetsAction,
  PoetsConfig,
  PoetsOptions,
  PoetsResult,
  PoetsState,
  PoetsView,
  VoteRound,
  WinReason,
} from './types';
import {
  DEFAULT_DISCUSSION_MS,
  MAX_DISCUSSION_MS,
  MAX_MATCH_ROUNDS,
  MAX_PLAYERS,
  MIN_DISCUSSION_MS,
  MIN_MATCH_ROUNDS,
  MIN_PLAYERS,
  PoetsError,
  VOTE_MS,
} from './constants';
import { createPoetsBot } from './bot';
import { deal, indexSentences, pairings } from './deal';
import { isMatchOver } from './match';

const idSchema = z.string().min(1).max(64);

const actionSchema: z.ZodType<PoetsAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('READ_DONE') }),
  z.object({ type: z.literal('START_VOTE') }),
  z.object({ type: z.literal('VOTE'), target: idSchema }),
  z.object({ type: z.literal('NEXT_ROUND') }),
]);

const optionsSchema: z.ZodType<PoetsOptions> = z.object({
  discussionMs: z.number().int().min(MIN_DISCUSSION_MS).max(MAX_DISCUSSION_MS),
  rounds: z.number().int().min(MIN_MATCH_ROUNDS).max(MAX_MATCH_ROUNDS).optional(),
  hideFigure: z.boolean().optional(),
});

function assertValidConfig({ figures }: PoetsConfig): void {
  if (figures.length < 2) throw new Error('poets needs at least 2 figures');
  const ids = new Set(figures.map((f) => f.id));
  if (ids.size !== figures.length) throw new Error('poets figure ids must be unique');
  const sentences = figures.flatMap((f) => f.sentences);
  if (new Set(sentences.map((s) => s.id)).size !== sentences.length) {
    throw new Error('poets sentence ids must be unique');
  }
  for (const f of figures) {
    for (const s of f.sentences) {
      if ((s.also ?? []).some((a) => a === f.id || !ids.has(a))) {
        throw new Error(`sentence "${s.id}" has an invalid "also" figure`);
      }
    }
  }
  if (pairings(figures, MAX_PLAYERS).length === 0) {
    throw new Error(`poets needs a figure pairing for ${MAX_PLAYERS} players`);
  }
}

interface Match {
  discussionMs: number;
  hideFigure: boolean;
  scores: Record<PlayerId, number>;
  round: number;
  rounds: number | null;
  used: string[];
}

function newRound(
  config: PoetsConfig,
  players: PlayerId[],
  rng: Rng,
  match: Match,
  previousFigure: string | null,
): PoetsState {
  const dealt = deal(config, players, rng, match.used, previousFigure);
  return {
    phase: 'reading',
    players,
    spy: dealt.spy,
    figure: dealt.figure,
    spyFigure: dealt.spyFigure,
    lines: dealt.lines,
    order: dealt.order,
    readCount: 0,
    discussionMs: match.discussionMs,
    hideFigure: match.hideFigure,
    deadline: null,
    voting: null,
    voteRounds: [],
    accused: null,
    result: null,
    scores: Object.fromEntries(players.map((p) => [p, match.scores[p] ?? 0])),
    round: match.round,
    rounds: match.rounds,
    used: dealt.used,
  };
}

function endRound(
  state: PoetsState,
  winner: PoetsResult['winner'],
  winners: PlayerId[],
  reason: WinReason,
): PoetsState {
  const points = 1;
  const scores = { ...state.scores };
  for (const p of winners) scores[p] = (scores[p] ?? 0) + points;
  return {
    ...state,
    phase: 'reveal',
    deadline: null,
    voting: null,
    result: { winner, winners, reason, points },
    scores,
  };
}

/** คนที่ยังต้องอ่าน (ข้ามคนที่ออกจากห้องไปแล้ว) — ครบแล้วเข้าช่วงคุย */
function advanceReading(state: PoetsState, now: number): PoetsState {
  let readCount = state.readCount;
  while (readCount < state.order.length && !state.players.includes(state.order[readCount] ?? '')) {
    readCount += 1;
  }
  if (readCount < state.order.length) return { ...state, readCount };
  return { ...state, readCount, phase: 'discussion', deadline: now + state.discussionMs };
}

function openVoting(state: PoetsState, candidates: PlayerId[], now: number): PoetsState {
  return {
    ...state,
    phase: 'voting',
    deadline: now + VOTE_MS,
    voting: { candidates, ballots: {} },
  };
}

/** นับคะแนนเฉพาะบัตรของคนที่ยังอยู่ และเฉพาะผู้สมัครที่ยังอยู่ */
function tally(state: PoetsState, round: VoteRound): Map<PlayerId, number> {
  const counts = new Map(
    round.candidates.filter((c) => state.players.includes(c)).map((c) => [c, 0]),
  );
  for (const p of state.players) {
    const target = round.ballots[p];
    if (target != null && counts.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}

/**
 * ปิดรอบโหวต: ทุกคนโหวตครบ หรือ force (หมดเวลา — คนที่ไม่โหวตถือว่างดออกเสียง)
 * คะแนนสูงสุดคนเดียว = ถูกเลือก, เสมอรอบแรก = โหวตใหม่เฉพาะคนที่เสมอ, เสมอรอบสอง = ไม่มีใครถูกเลือก
 * จากนั้นตัดสินทันที: เลือกสายลับถูก = หมู่บ้านปลอดภัย ไม่งั้นสายลับชนะ
 */
function closeVoting(state: PoetsState, now: number, force: boolean): PoetsState {
  const voting = state.voting ?? { candidates: state.players, ballots: {} };
  if (!force && !state.players.every((p) => p in voting.ballots)) return state;

  const round: VoteRound = {
    candidates: voting.candidates,
    ballots: Object.fromEntries(state.players.map((p) => [p, voting.ballots[p] ?? null])),
  };
  const counts = tally(state, round);
  const top = Math.max(0, ...counts.values());
  const leaders = [...counts].filter(([, n]) => n === top && n > 0).map(([c]) => c);
  const closed = { ...state, voteRounds: [...state.voteRounds, round], voting: null };

  if (leaders.length > 1 && state.voteRounds.length === 0) {
    return openVoting(closed, leaders, now);
  }
  const accused = leaders.length === 1 ? (leaders[0] as PlayerId) : null;
  const decided = { ...closed, accused };
  if (accused === state.spy) {
    const village = state.players.filter((p) => p !== state.spy);
    return endRound(decided, 'village', village, 'caught');
  }
  return endRound(decided, 'spy', [state.spy], 'missed');
}

export function createPoets(
  config: PoetsConfig,
): GameDefinition<PoetsState, PoetsAction, PoetsView, PoetsOptions> {
  assertValidConfig(config);
  const sentences = indexSentences(config.figures);
  const textOf = (id: string | undefined) => (id ? (sentences.get(id)?.text ?? '') : '');

  return {
    id: 'poets',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    actionSchema,
    optionsSchema,
    defaultOptions: { discussionMs: DEFAULT_DISCUSSION_MS },

    setup(players, options, rng) {
      const match: Match = {
        discussionMs: options.discussionMs,
        hideFigure: options.hideFigure ?? false,
        scores: {},
        round: 1,
        rounds: options.rounds ?? null,
        used: [],
      };
      return newRound(config, players, rng, match, null);
    },

    validate(state, action, by, ctx) {
      if (!state.players.includes(by)) return PoetsError.NotAPlayer;

      switch (action.type) {
        case 'READ_DONE':
          if (state.phase !== 'reading') return PoetsError.WrongPhase;
          // คนที่กำลังอ่านกดเอง หรือ host ข้ามให้ (เช่น คนนั้นหลุด)
          if (by !== state.order[state.readCount] && by !== ctx.hostId) {
            return PoetsError.NotReader;
          }
          return null;
        case 'START_VOTE':
          if (state.phase !== 'discussion') return PoetsError.WrongPhase;
          if (by !== ctx.hostId) return PoetsError.NotHost;
          return null;
        case 'VOTE': {
          if (state.phase !== 'voting' || state.voting === null) return PoetsError.WrongPhase;
          if (by in state.voting.ballots) return PoetsError.AlreadyVoted;
          if (action.target === by) return PoetsError.CannotVoteSelf;
          const ok =
            state.voting.candidates.includes(action.target) &&
            state.players.includes(action.target);
          return ok ? null : PoetsError.NotACandidate;
        }
        case 'NEXT_ROUND':
          if (state.phase !== 'reveal') return PoetsError.WrongPhase;
          if (by !== ctx.hostId) return PoetsError.NotHost;
          if (state.players.length < MIN_PLAYERS) return PoetsError.NotEnoughPlayers;
          return null;
      }
    },

    apply(state, action, by, now, rng) {
      switch (action.type) {
        case 'READ_DONE':
          return advanceReading({ ...state, readCount: state.readCount + 1 }, now);
        case 'START_VOTE':
          return openVoting(state, state.players, now);
        case 'VOTE': {
          const voting = state.voting;
          if (voting === null) return state;
          return closeVoting(
            {
              ...state,
              voting: { ...voting, ballots: { ...voting.ballots, [by]: action.target } },
            },
            now,
            false,
          );
        }
        case 'NEXT_ROUND': {
          // จบแมตช์แล้ว = เริ่มแมตช์ใหม่ ล้างคะแนนและประโยคที่ใช้ไป
          const fresh = isMatchOver(state);
          const match: Match = {
            discussionMs: state.discussionMs,
            hideFigure: state.hideFigure,
            scores: fresh ? {} : state.scores,
            round: fresh ? 1 : state.round + 1,
            rounds: state.rounds,
            used: fresh ? [] : state.used,
          };
          return newRound(config, state.players, rng, match, state.figure);
        }
      }
    },

    playerView(state, viewer): PoetsView {
      const revealed = state.phase === 'reveal';
      const line = state.lines[viewer];
      const voting = state.voting;
      const figure = viewer === state.spy ? state.spyFigure : state.figure;
      return {
        phase: state.phase,
        me: viewer,
        you:
          line !== undefined && state.players.includes(viewer)
            ? { role: 'poet', text: textOf(line), figure: state.hideFigure ? null : figure }
            : { role: 'spectator' },
        setId: config.setId,
        players: state.players,
        order: state.order,
        readCount: state.readCount,
        // ประโยคที่อ่านออกเสียงแล้วเป็นข้อมูลสาธารณะ (รวมของคนที่ออกไปแล้ว)
        readLines: state.order
          .slice(0, state.readCount)
          .map((p) => ({ player: p, text: textOf(state.lines[p]) })),
        deadline: state.deadline,
        vote: voting
          ? {
              round: state.voteRounds.length + 1,
              candidates: voting.candidates,
              voted: Object.keys(voting.ballots).filter((p) => state.players.includes(p)),
              myVote: voting.ballots[viewer] ?? null,
            }
          : null,
        voteRounds: state.voteRounds,
        accused: state.accused,
        result: state.result,
        reveal: revealed
          ? {
              spy: state.spy,
              figure: state.figure,
              spyFigure: state.spyFigure,
              lines: state.order.map((p) => {
                const s = sentences.get(state.lines[p] ?? '');
                return {
                  player: p,
                  text: s?.text ?? '',
                  note: s?.note ?? null,
                  figures: s?.figures ?? [],
                };
              }),
            }
          : null,
        scores: state.scores,
        round: state.round,
        rounds: state.rounds,
        matchOver: isMatchOver(state),
      };
    },

    nextDeadline: (state) => state.deadline,

    onDeadline(state, now) {
      switch (state.phase) {
        case 'discussion':
          return openVoting(state, state.players, now);
        case 'voting':
          return closeVoting(state, now, true);
        default:
          return { ...state, deadline: null };
      }
    },

    onPlayerLeave(state, player, now) {
      if (!state.players.includes(player)) return state;
      const players = state.players.filter((p) => p !== player);
      const left: PoetsState = { ...state, players };
      if (state.phase === 'reveal') return left;
      if (player === state.spy) return endRound(left, 'village', players, 'spy-left');
      if (players.length < MIN_PLAYERS) return endRound(left, null, [], 'not-enough-players');
      if (state.phase === 'reading') return advanceReading(left, now);
      if (state.phase === 'voting' && state.voting) {
        const ballots = Object.fromEntries(
          Object.entries(state.voting.ballots).filter(([p]) => p !== player),
        );
        return closeVoting({ ...left, voting: { ...state.voting, ballots } }, now, false);
      }
      return left;
    },

    bot: createPoetsBot(),

    // reveal ยังรับ NEXT_ROUND ได้ — จบจริงเมื่อคนไม่พอเล่นรอบต่อ
    isOver: (state) => state.phase === 'reveal' && state.players.length < MIN_PLAYERS,
  };
}
