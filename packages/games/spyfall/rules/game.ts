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
  VoteRound,
  WinReason,
} from './types';
import {
  CUSTOM_ID_PATTERN,
  DEFAULT_DURATION_MS,
  GUESS_MS,
  MAX_CUSTOM_LOCATIONS,
  MAX_CUSTOM_ROLES,
  MAX_CUSTOM_TEXT,
  MAX_DURATION_MS,
  MAX_MATCH_ROUNDS,
  MAX_PLAYERS,
  MIN_DECK_SIZE,
  MIN_DURATION_MS,
  MIN_MATCH_ROUNDS,
  MIN_PLAYERS,
  SpyfallError,
  VOTE_MS,
} from './constants';
import { createSpyfallBot } from './bot';
import { buildDeck } from './deck';
import { isMatchOver } from './match';

const idSchema = z.string().min(1).max(64);

const actionSchema: z.ZodType<SpyfallAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('START_VOTE') }),
  z.object({ type: z.literal('VOTE'), target: idSchema }),
  z.object({ type: z.literal('SPY_GUESS'), locationId: idSchema }),
  z.object({ type: z.literal('NEXT_ROUND') }),
]);

const textSchema = z.string().trim().min(1).max(MAX_CUSTOM_TEXT);

const unique = (values: string[]) =>
  new Set(values.map((v) => v.toLowerCase())).size === values.length;

/** ตั้งค่าห้องมาจาก client: ตรวจทั้งรูปแบบ และว่ายังเหลือสถานที่พอเล่น */
function optionsSchemaFor(builtin: LocationDef[]): z.ZodType<SpyfallOptions> {
  const builtinIds = new Set(builtin.map((l) => l.id));
  return z
    .object({
      durationMs: z.number().int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
      disabled: z.array(idSchema).max(builtin.length).optional(),
      custom: z
        .array(
          z.object({
            id: z.string().regex(CUSTOM_ID_PATTERN),
            name: textSchema,
            roles: z.array(textSchema).min(1).max(MAX_CUSTOM_ROLES),
          }),
        )
        .max(MAX_CUSTOM_LOCATIONS)
        .optional(),
      rounds: z.number().int().min(MIN_MATCH_ROUNDS).max(MAX_MATCH_ROUNDS).optional(),
    })
    .superRefine((options, ctx) => {
      const disabled = options.disabled ?? [];
      const custom = options.custom ?? [];
      if (!unique(disabled) || disabled.some((id) => !builtinIds.has(id))) {
        ctx.addIssue({ code: 'custom', message: 'disabled must be unique built-in ids' });
      }
      if (!unique(custom.map((c) => c.id)) || !unique(custom.map((c) => c.name))) {
        ctx.addIssue({ code: 'custom', message: 'custom ids and names must be unique' });
      }
      if (custom.some((c) => !unique(c.roles))) {
        ctx.addIssue({ code: 'custom', message: 'roles must be unique within a location' });
      }
      if (builtin.length - disabled.length + custom.length < MIN_DECK_SIZE) {
        ctx.addIssue({ code: 'custom', message: `need at least ${MIN_DECK_SIZE} locations` });
      }
    });
}

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

interface Match {
  durationMs: number;
  scores: Record<PlayerId, number>;
  round: number;
  rounds: number | null;
}

function deal(
  players: PlayerId[],
  deck: LocationDef[],
  rng: Rng,
  now: number,
  { durationMs, scores, round, rounds }: Match,
  previousLocationId: string | null,
): SpyfallState {
  const candidates = deck.filter((l) => l.id !== previousLocationId);
  const location = candidates[rng.int(candidates.length)] as LocationDef;
  const spy = players[rng.int(players.length)] as PlayerId;
  const roles = rng.shuffle(location.roles);
  const agents = players.filter((p) => p !== spy);

  return {
    phase: 'questioning',
    players,
    spy,
    locationId: location.id,
    // สถานที่ที่สร้างเองอาจมีบทบาทน้อยกว่าจำนวนคน จึงวนซ้ำ (ชุดมาตรฐานมีพอเสมอ)
    roles: Object.fromEntries(agents.map((p, i) => [p, roles[i % roles.length] as string])),
    deck,
    firstAsker: players[rng.int(players.length)] as PlayerId,
    durationMs,
    deadline: now + durationMs,
    voting: null,
    voteRounds: [],
    accused: null,
    spyGuess: null,
    result: null,
    scores: Object.fromEntries(players.map((p) => [p, scores[p] ?? 0])),
    round,
    rounds,
  };
}

function endRound(
  state: SpyfallState,
  winner: SpyfallResult['winner'],
  winners: PlayerId[],
  reason: WinReason,
): SpyfallState {
  const scores = { ...state.scores };
  for (const p of winners) scores[p] = (scores[p] ?? 0) + 1;
  return {
    ...state,
    phase: 'reveal',
    deadline: null,
    voting: null,
    result: { winner, winners, reason },
    scores,
  };
}

/** เปิดโหวตรอบใหม่ — รอบแรกเลือกได้ทุกคน รอบสองเฉพาะคนที่คะแนนเสมอ */
function openVoting(state: SpyfallState, candidates: PlayerId[], now: number): SpyfallState {
  return {
    ...state,
    phase: 'voting',
    deadline: now + VOTE_MS,
    voting: { candidates, ballots: {} },
  };
}

/** นับคะแนนเฉพาะบัตรของคนที่ยังอยู่ และเฉพาะผู้สมัครที่ยังอยู่ */
function tally(state: SpyfallState, round: VoteRound): Map<PlayerId, number> {
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
 */
function closeVoting(state: SpyfallState, now: number, force: boolean): SpyfallState {
  const voting = state.voting ?? { candidates: state.players, ballots: {} };
  if (!force && !state.players.every((p) => p in voting.ballots)) return state;

  const round: VoteRound = {
    candidates: voting.candidates,
    ballots: Object.fromEntries(state.players.map((p) => [p, voting.ballots[p] ?? null])),
  };
  const counts = tally(state, round);
  const top = Math.max(0, ...counts.values());
  const leaders = [...counts].filter(([, n]) => n === top && n > 0).map(([c]) => c);
  // ห้องที่เริ่มก่อนเปลี่ยนกติกาไม่มี voteRounds
  const previous = state.voteRounds ?? [];
  const closed = { ...state, voteRounds: [...previous, round], voting: null };

  if (leaders.length > 1 && previous.length === 0) {
    return openVoting(closed, leaders, now);
  }
  return {
    ...closed,
    phase: 'guessing',
    deadline: now + GUESS_MS,
    accused: leaders.length === 1 ? (leaders[0] as PlayerId) : null,
  };
}

/** สายลับทายแล้ว (หรือหมดเวลา = null) → ตัดสินผล */
function finishGuess(state: SpyfallState, guess: string | null): SpyfallState {
  const guessed = { ...state, spyGuess: guess };
  const correct = guess === state.locationId;
  const caught = state.accused === state.spy;
  if (correct) {
    return endRound(
      guessed,
      'spy',
      [state.spy],
      caught ? 'caught-spy-guessed' : 'missed-spy-guessed',
    );
  }
  if (!caught) return endRound(guessed, null, [], 'missed');
  // คนที่โหวตถูก = เลือกสายลับในรอบโหวตที่ตัดสินผล
  const deciding = state.voteRounds.at(-1);
  const voters = state.players.filter((p) => deciding?.ballots[p] === state.spy);
  return endRound(guessed, 'voters', voters, 'caught');
}

export function createSpyfall(
  config: SpyfallConfig,
): GameDefinition<SpyfallState, SpyfallAction, SpyfallView, SpyfallOptions> {
  assertValidConfig(config);

  return {
    id: 'spyfall',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    actionSchema,
    optionsSchema: optionsSchemaFor(config.locations),
    defaultOptions: { durationMs: DEFAULT_DURATION_MS },

    setup(players, options, rng, now) {
      const deck = buildDeck(config.locations, options);
      const match = { durationMs: options.durationMs, scores: {}, round: 1 };
      return deal(players, deck, rng, now, { ...match, rounds: options.rounds ?? null }, null);
    },

    validate(state, action, by, ctx) {
      if (!state.players.includes(by)) return SpyfallError.NotAPlayer;

      switch (action.type) {
        case 'START_VOTE':
          if (state.phase !== 'questioning') return SpyfallError.WrongPhase;
          if (by !== ctx.hostId) return SpyfallError.NotHost;
          return null;
        case 'VOTE': {
          if (state.phase !== 'voting' || state.voting === null) return SpyfallError.WrongPhase;
          if (by in state.voting.ballots) return SpyfallError.AlreadyVoted;
          if (action.target === by) return SpyfallError.CannotVoteSelf;
          const ok =
            state.voting.candidates.includes(action.target) &&
            state.players.includes(action.target);
          return ok ? null : SpyfallError.NotACandidate;
        }
        case 'SPY_GUESS':
          // ทายได้ช่วงเดียว: หลังโหวตเสร็จ — ห้ามเปิดตัวก่อน
          if (state.phase !== 'guessing') return SpyfallError.WrongPhase;
          if (by !== state.spy) return SpyfallError.NotSpy;
          if (!state.deck.some((l) => l.id === action.locationId)) {
            return SpyfallError.UnknownLocation;
          }
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
        case 'SPY_GUESS':
          return finishGuess(state, action.locationId);
        case 'NEXT_ROUND': {
          // จบแมตช์แล้ว = เริ่มแมตช์ใหม่ ล้างคะแนน
          const fresh = isMatchOver(state);
          const match: Match = {
            durationMs: state.durationMs,
            scores: fresh ? {} : state.scores,
            round: fresh ? 1 : (state.round ?? 1) + 1,
            rounds: state.rounds ?? null,
          };
          return deal(state.players, state.deck, rng, now, match, state.locationId);
        }
      }
    },

    playerView(state, viewer): SpyfallView {
      const revealed = state.phase === 'reveal';
      const role = state.roles[viewer];
      const voting = state.voting;
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
        vote: voting
          ? {
              // ห้องที่เริ่มก่อนเปลี่ยนกติกาไม่มี voteRounds
              round: (state.voteRounds?.length ?? 0) + 1,
              candidates: voting.candidates,
              voted: Object.keys(voting.ballots).filter((p) => state.players.includes(p)),
              myVote: voting.ballots[viewer] ?? null,
            }
          : null,
        voteRounds: state.voteRounds ?? [],
        accused: state.accused ?? null,
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
        // ห้องที่เริ่มก่อนมีแมตช์ไม่มี round/rounds
        round: state.round ?? 1,
        rounds: state.rounds ?? null,
        matchOver: isMatchOver(state),
      };
    },

    nextDeadline: (state) => state.deadline,

    onDeadline(state, now) {
      switch (state.phase) {
        case 'questioning':
          return openVoting(state, state.players, now);
        case 'voting':
          return closeVoting(state, now, true);
        case 'guessing':
          return finishGuess(state, null);
        default:
          // reveal หรือ phase จากกติกาเก่า (ห้องที่เล่นค้างก่อน deploy) — ไม่ทำอะไร
          return { ...state, deadline: null };
      }
    },

    onPlayerLeave(state, player, now) {
      if (!state.players.includes(player)) return state;
      const players = state.players.filter((p) => p !== player);
      const left: SpyfallState = { ...state, players };
      if (state.phase === 'reveal') return left;
      if (player === state.spy) return endRound(left, 'voters', players, 'spy-left');
      if (players.length < MIN_PLAYERS) return endRound(left, null, [], 'not-enough-players');
      if (state.phase === 'voting' && state.voting) {
        // บัตรของคนที่ออกไม่นับ คะแนนที่ให้คนที่ออกก็ไม่นับ (tally กรองให้)
        const ballots = Object.fromEntries(
          Object.entries(state.voting.ballots).filter(([p]) => p !== player),
        );
        return closeVoting({ ...left, voting: { ...state.voting, ballots } }, now, false);
      }
      return left;
    },

    bot: createSpyfallBot(config.locations),

    // reveal ยังรับ NEXT_ROUND ได้ — จบจริงเมื่อคนไม่พอเล่นรอบต่อ
    isOver: (state) => state.phase === 'reveal' && state.players.length < MIN_PLAYERS,
  };
}
