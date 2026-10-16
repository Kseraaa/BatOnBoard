import { z } from 'zod';
import type { GameDefinition, PlayerId } from './types';

/**
 * เกมจำลองสำหรับเทสต์ engine: ทุกคนได้เลขลับ 0–99 ทายเลขของคนอื่นได้
 * ทายถูกได้ 1 แต้ม เกมจบเมื่อหมดเวลาหรือ host สั่ง END
 */
export interface SecretState {
  players: PlayerId[];
  secrets: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  deadline: number;
  over: boolean;
  lastGuessAt: number | null;
}

export type SecretAction =
  { type: 'GUESS'; target: PlayerId; value: number } | { type: 'REROLL' } | { type: 'END' };

export interface SecretView {
  me: PlayerId;
  mySecret: number | null;
  scores: Record<PlayerId, number>;
  deadline: number;
  over: boolean;
  /** เปิดเผยเลขทุกคนเมื่อจบเกมเท่านั้น */
  secrets: Record<PlayerId, number> | null;
}

export interface SecretOptions {
  durationMs: number;
}

export const secretGame: GameDefinition<SecretState, SecretAction, SecretView, SecretOptions> = {
  id: 'secret-number',
  minPlayers: 2,
  maxPlayers: 4,
  actionSchema: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('GUESS'),
      target: z.string(),
      value: z.number().int().min(0).max(99),
    }),
    z.object({ type: z.literal('REROLL') }),
    z.object({ type: z.literal('END') }),
  ]),
  optionsSchema: z.object({ durationMs: z.number().int().min(1_000).max(60_000) }),
  defaultOptions: { durationMs: 10_000 },

  setup(players, options, rng, now) {
    return {
      players,
      secrets: Object.fromEntries(players.map((p) => [p, rng.int(100)])),
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      deadline: now + options.durationMs,
      over: false,
      lastGuessAt: null,
    };
  },

  validate(state, action, by, ctx) {
    if (!state.players.includes(by)) return 'not-a-player';
    switch (action.type) {
      case 'GUESS':
        if (action.target === by) return 'cannot-target-self';
        if (!state.players.includes(action.target)) return 'unknown-target';
        return null;
      case 'REROLL':
        return null;
      case 'END':
        return by === ctx.hostId ? null : 'not-host';
    }
  },

  apply(state, action, by, now, rng) {
    switch (action.type) {
      case 'GUESS': {
        const hit = state.secrets[action.target] === action.value;
        return {
          ...state,
          scores: { ...state.scores, [by]: (state.scores[by] ?? 0) + (hit ? 1 : 0) },
          lastGuessAt: now,
        };
      }
      case 'REROLL':
        return { ...state, secrets: { ...state.secrets, [by]: rng.int(100) } };
      case 'END':
        return { ...state, over: true };
    }
  },

  playerView(state, viewer) {
    return {
      me: viewer,
      mySecret: state.secrets[viewer] ?? null,
      scores: state.scores,
      deadline: state.deadline,
      over: state.over,
      secrets: state.over ? state.secrets : null,
    };
  },

  nextDeadline: (state) => state.deadline,
  onDeadline: (state) => ({ ...state, over: true }),

  onPlayerLeave(state, player) {
    const players = state.players.filter((p) => p !== player);
    return { ...state, players, over: players.length < 2 };
  },

  isOver: (state) => state.over,
};
