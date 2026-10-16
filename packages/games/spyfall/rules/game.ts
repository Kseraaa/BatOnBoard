import { z } from 'zod';
import type { GameDefinition, PlayerId, Rng } from '@batonboard/engine';
import type {
  LocationDef,
  SpyfallAction,
  SpyfallConfig,
  SpyfallOptions,
  SpyfallResult,
  SpyfallState,
  SpyfallView,
  WinReason,
} from './types';
import {
  DEFAULT_DURATION_MS,
  FINAL_VOTE_MS,
  MAX_DURATION_MS,
  MAX_PLAYERS,
  MIN_DURATION_MS,
  MIN_PLAYERS,
  SpyfallError,
  VOTE_MS,
} from './constants';

const idSchema = z.string().min(1).max(64);

const actionSchema: z.ZodType<SpyfallAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ACCUSE'), target: idSchema }),
  z.object({ type: z.literal('BALLOT'), agree: z.boolean() }),
  z.object({ type: z.literal('PASS') }),
  z.object({ type: z.literal('SPY_GUESS'), locationId: idSchema }),
  z.object({ type: z.literal('NEXT_ROUND') }),
]);

const optionsSchema: z.ZodType<SpyfallOptions> = z.object({
  durationMs: z.number().int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
});

function assertValidConfig({ locations }: SpyfallConfig): void {
  if (locations.length < 2) throw new Error('spyfall needs at least 2 locations');
  const ids = new Set(locations.map((l) => l.id));
  if (ids.size !== locations.length) throw new Error('spyfall location ids must be unique');
  for (const loc of locations) {
    // บทบาทต้องพอให้ทุกคนที่ไม่ใช่สายลับได้คนละอย่าง
    if (new Set(loc.roles).size !== loc.roles.length || loc.roles.length < MAX_PLAYERS - 1) {
      throw new Error(`location "${loc.id}" needs at least ${MAX_PLAYERS - 1} unique roles`);
    }
  }
}

function deal(
  players: PlayerId[],
  locations: LocationDef[],
  rng: Rng,
  now: number,
  durationMs: number,
  scores: Record<PlayerId, number>,
  previousLocationId: string | null,
): SpyfallState {
  const candidates = locations.filter((l) => l.id !== previousLocationId);
  const location = candidates[rng.int(candidates.length)] as LocationDef;
  const spy = players[rng.int(players.length)] as PlayerId;
  const roles = rng.shuffle(location.roles);
  const agents = players.filter((p) => p !== spy);

  return {
    phase: 'questioning',
    players,
    spy,
    locationId: location.id,
    roles: Object.fromEntries(agents.map((p, i) => [p, roles[i] as string])),
    firstAsker: players[rng.int(players.length)] as PlayerId,
    durationMs,
    deadline: now + durationMs,
    pausedRemaining: null,
    usedAccusation: [],
    finalTurns: [],
    vote: null,
    spyGuess: null,
    result: null,
    scores: Object.fromEntries(players.map((p) => [p, scores[p] ?? 0])),
  };
}

function endRound(
  state: SpyfallState,
  winner: SpyfallResult['winner'],
  reason: WinReason,
): SpyfallState {
  const winners =
    winner === null ? [] : state.players.filter((p) => (p === state.spy) === (winner === 'spy'));
  const scores = { ...state.scores };
  for (const p of winners) scores[p] = (scores[p] ?? 0) + 1;

  return {
    ...state,
    phase: 'reveal',
    deadline: null,
    pausedRemaining: null,
    vote: null,
    result: { winner, reason },
    scores,
  };
}

/** final-vote จบเมื่อทุกคนใช้สิทธิ์ครบแล้วไม่มีใครถูกจับ */
function checkFinalVoteDone(state: SpyfallState): SpyfallState {
  if (state.phase === 'final-vote' && state.players.every((p) => state.finalTurns.includes(p))) {
    return endRound(state, 'spy', 'spy-survived');
  }
  return state;
}

/** โหวตไม่ผ่าน: กลับ phase เดิมและเดินเวลาต่อจากที่เหลือ */
function failVote(state: SpyfallState, now: number): SpyfallState {
  const final = state.vote?.final ?? false;
  return checkFinalVoteDone({
    ...state,
    phase: final ? 'final-vote' : 'questioning',
    vote: null,
    deadline: now + (state.pausedRemaining ?? 0),
    pausedRemaining: null,
  });
}

/** ตัดสินโหวตทันทีที่รู้ผล: มีคนไม่เห็นด้วย = ไม่ผ่าน, ทุกคนยกเว้นผู้ถูกกล่าวหาเห็นด้วย = ผ่าน */
function resolveVote(state: SpyfallState, now: number): SpyfallState {
  const vote = state.vote;
  if (state.phase !== 'voting' || vote === null) return state;
  const voters = state.players.filter((p) => p !== vote.accused);
  if (voters.some((p) => vote.ballots[p] === false)) return failVote(state, now);
  if (voters.every((p) => vote.ballots[p] === true)) {
    return vote.accused === state.spy
      ? endRound(state, 'agents', 'spy-caught')
      : endRound(state, 'spy', 'innocent-convicted');
  }
  return state;
}

export function createSpyfall(
  config: SpyfallConfig,
): GameDefinition<SpyfallState, SpyfallAction, SpyfallView, SpyfallOptions> {
  assertValidConfig(config);
  const locationIds = new Set(config.locations.map((l) => l.id));

  return {
    id: 'spyfall',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    actionSchema,
    optionsSchema,
    defaultOptions: { durationMs: DEFAULT_DURATION_MS },

    setup(players, options, rng, now) {
      return deal(players, config.locations, rng, now, options.durationMs, {}, null);
    },

    validate(state, action, by, ctx) {
      if (!state.players.includes(by)) return SpyfallError.NotAPlayer;

      switch (action.type) {
        case 'ACCUSE': {
          if (state.phase === 'questioning') {
            if (state.usedAccusation.includes(by)) return SpyfallError.AccusationUsed;
          } else if (state.phase === 'final-vote') {
            if (state.finalTurns.includes(by)) return SpyfallError.FinalTurnUsed;
          } else {
            return SpyfallError.WrongPhase;
          }
          if (action.target === by) return SpyfallError.CannotAccuseSelf;
          if (!state.players.includes(action.target)) return SpyfallError.UnknownPlayer;
          return null;
        }
        case 'BALLOT':
          if (state.phase !== 'voting' || state.vote === null) return SpyfallError.WrongPhase;
          if (by === state.vote.accused) return SpyfallError.AccusedCannotVote;
          if (by in state.vote.ballots) return SpyfallError.AlreadyVoted;
          return null;
        case 'PASS':
          if (state.phase !== 'final-vote') return SpyfallError.WrongPhase;
          if (state.finalTurns.includes(by)) return SpyfallError.FinalTurnUsed;
          return null;
        case 'SPY_GUESS':
          // final-vote ถือเป็นช่วงโหวต สายลับเดาไม่ได้
          if (state.phase !== 'questioning') return SpyfallError.WrongPhase;
          if (by !== state.spy) return SpyfallError.NotSpy;
          if (!locationIds.has(action.locationId)) return SpyfallError.UnknownLocation;
          return null;
        case 'NEXT_ROUND':
          if (state.phase !== 'reveal') return SpyfallError.WrongPhase;
          if (by !== ctx.hostId) return SpyfallError.NotHost;
          if (state.players.length < MIN_PLAYERS) return SpyfallError.NotEnoughPlayers;
          return null;
      }
    },

    apply(state, action, by, now, rng) {
      switch (action.type) {
        case 'ACCUSE': {
          const final = state.phase === 'final-vote';
          return resolveVote(
            {
              ...state,
              phase: 'voting',
              usedAccusation: final ? state.usedAccusation : [...state.usedAccusation, by],
              finalTurns: final ? [...state.finalTurns, by] : state.finalTurns,
              pausedRemaining: Math.max(0, (state.deadline ?? now) - now),
              deadline: null,
              vote: {
                accuser: by,
                accused: action.target,
                ballots: { [by]: true },
                deadline: now + VOTE_MS,
                final,
              },
            },
            now,
          );
        }
        case 'BALLOT': {
          const vote = state.vote;
          if (vote === null) return state;
          return resolveVote(
            { ...state, vote: { ...vote, ballots: { ...vote.ballots, [by]: action.agree } } },
            now,
          );
        }
        case 'PASS':
          return checkFinalVoteDone({ ...state, finalTurns: [...state.finalTurns, by] });
        case 'SPY_GUESS': {
          const guessed = { ...state, spyGuess: action.locationId };
          return action.locationId === state.locationId
            ? endRound(guessed, 'spy', 'spy-guessed')
            : endRound(guessed, 'agents', 'spy-guessed-wrong');
        }
        case 'NEXT_ROUND':
          return deal(
            state.players,
            config.locations,
            rng,
            now,
            state.durationMs,
            state.scores,
            state.locationId,
          );
      }
    },

    playerView(state, viewer): SpyfallView {
      const revealed = state.phase === 'reveal';
      const role = state.roles[viewer];
      return {
        phase: state.phase,
        me: viewer,
        you:
          viewer === state.spy
            ? { role: 'spy' }
            : role !== undefined && state.players.includes(viewer)
              ? { role: 'agent', locationId: state.locationId, roleId: role }
              : { role: 'spectator' },
        locationSetId: config.locationSetId,
        players: state.players,
        firstAsker: state.firstAsker,
        deadline: state.deadline,
        pausedRemaining: state.pausedRemaining,
        usedAccusation: state.usedAccusation,
        finalTurns: state.finalTurns,
        vote: state.vote && {
          accuser: state.vote.accuser,
          accused: state.vote.accused,
          voted: Object.keys(state.vote.ballots).filter((p) => state.players.includes(p)),
          deadline: state.vote.deadline,
        },
        result: state.result,
        reveal: revealed
          ? {
              spy: state.spy,
              locationId: state.locationId,
              roles: state.roles,
              spyGuess: state.spyGuess,
            }
          : null,
        scores: state.scores,
      };
    },

    nextDeadline(state) {
      if (state.phase === 'voting') return state.vote?.deadline ?? null;
      return state.deadline;
    },

    onDeadline(state, now) {
      switch (state.phase) {
        case 'voting':
          // คนที่ยังไม่โหวต = ไม่เห็นด้วย
          return failVote(state, now);
        case 'questioning':
          return {
            ...state,
            phase: 'final-vote',
            deadline: now + FINAL_VOTE_MS,
            finalTurns: [],
          };
        case 'final-vote':
          return endRound(state, 'spy', 'time-up');
        case 'reveal':
          return state;
      }
    },

    onPlayerLeave(state, player, now) {
      if (!state.players.includes(player)) return state;
      const left: SpyfallState = {
        ...state,
        players: state.players.filter((p) => p !== player),
      };
      if (state.phase === 'reveal') return left;
      if (player === state.spy) return endRound(left, 'agents', 'spy-left');
      if (left.players.length < MIN_PLAYERS) return endRound(left, null, 'not-enough-players');
      if (state.phase === 'voting' && state.vote?.accused === player) return failVote(left, now);
      if (state.phase === 'voting') return resolveVote(left, now);
      return checkFinalVoteDone(left);
    },

    // reveal ยังรับ NEXT_ROUND ได้ — จบจริงเมื่อคนไม่พอเล่นรอบต่อ
    isOver: (state) => state.phase === 'reveal' && state.players.length < MIN_PLAYERS,
  };
}
