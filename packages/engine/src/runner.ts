import { EngineError } from './types';
import type { ActionContext, GameDefinition, PlayerId, Result, Rng } from './types';

/**
 * Game runner — pipeline ของ server ในรูปฟังก์ชันบริสุทธิ์
 * ฝั่ง server (packages/rooms) เป็นคนเก็บ state และส่ง view ส่วน runner แค่คำนวณ
 *
 *   startGame → (dispatchAction | fireDeadline | removePlayer)* → viewsFor
 */

export function startGame<S, A, V, O>(
  game: GameDefinition<S, A, V, O>,
  players: readonly PlayerId[],
  rawOptions: unknown,
  rng: Rng,
  now: number,
): Result<S> {
  if (new Set(players).size !== players.length) {
    return { ok: false, error: EngineError.DuplicatePlayers };
  }
  if (players.length < game.minPlayers) {
    return { ok: false, error: EngineError.TooFewPlayers };
  }
  if (players.length > game.maxPlayers) {
    return { ok: false, error: EngineError.TooManyPlayers };
  }
  const options = game.optionsSchema.safeParse(rawOptions ?? game.defaultOptions);
  if (!options.success) {
    return { ok: false, error: EngineError.InvalidOptions };
  }
  return { ok: true, value: game.setup([...players], options.data, rng, now) };
}

/** 'game:action' → actionSchema.parse → validate → apply */
export function dispatchAction<S, A, V, O>(
  game: GameDefinition<S, A, V, O>,
  state: S,
  payload: unknown,
  by: PlayerId,
  ctx: ActionContext,
  now: number,
  rng: Rng,
): Result<S> {
  if (game.isOver(state)) {
    return { ok: false, error: EngineError.GameOver };
  }
  const parsed = game.actionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: EngineError.InvalidAction };
  }
  const error = game.validate(state, parsed.data, by, ctx);
  if (error !== null) {
    return { ok: false, error };
  }
  return { ok: true, value: game.apply(state, parsed.data, by, now, rng) };
}

/** เวลาที่เกมต้องถูกปลุก (deadline ถัดไป) หรือ null */
export function getDeadline<S, A, V, O>(game: GameDefinition<S, A, V, O>, state: S): number | null {
  if (game.isOver(state) || !game.nextDeadline) return null;
  return game.nextDeadline(state);
}

/**
 * เรียกเมื่อถึงหรือเลย deadline แล้ว (server เช็กทุก request)
 * คืน state เดิม (object เดิม) ถ้ายังไม่ถึงเวลา — กันกรณี timer เก่าที่ยกเลิกไม่ทัน
 */
export function fireDeadline<S, A, V, O>(
  game: GameDefinition<S, A, V, O>,
  state: S,
  now: number,
): S {
  const deadline = getDeadline(game, state);
  if (deadline === null || now < deadline || !game.onDeadline) return state;
  return game.onDeadline(state, now);
}

/** ผู้เล่นถูกเตะหรือออกกลางเกม — คืน state เดิมถ้าเกมไม่ได้กำหนด onPlayerLeave */
export function removePlayer<S, A, V, O>(
  game: GameDefinition<S, A, V, O>,
  state: S,
  player: PlayerId,
  now: number,
): S {
  if (game.isOver(state) || !game.onPlayerLeave) return state;
  return game.onPlayerLeave(state, player, now);
}

/** view แยกรายผู้เล่น (กฎข้อ 2: ห้าม broadcast state เดียวให้ทั้งห้อง) */
export function viewsFor<S, A, V, O>(
  game: GameDefinition<S, A, V, O>,
  state: S,
  viewers: readonly PlayerId[],
): Map<PlayerId, V> {
  return new Map(viewers.map((viewer) => [viewer, game.playerView(state, viewer)]));
}
