import type { AnyGameDefinition, GameDefinition } from './types';

/**
 * ทะเบียนเกม — server ลงทะเบียนเกมตอนเริ่ม แล้วหาเกมจาก id ที่ห้องเลือก
 * ใช้ factory แทน singleton เพื่อให้เทสต์สร้าง registry แยกกันได้
 */
export interface GameRegistry {
  register<S, A, V, O>(game: GameDefinition<S, A, V, O>): void;
  get(id: string): AnyGameDefinition | undefined;
  has(id: string): boolean;
  list(): AnyGameDefinition[];
}

export function createRegistry(): GameRegistry {
  const games = new Map<string, AnyGameDefinition>();

  return {
    register(game) {
      if (games.has(game.id)) {
        throw new Error(`game "${game.id}" is already registered`);
      }
      if (game.minPlayers < 1 || game.minPlayers > game.maxPlayers) {
        throw new Error(
          `game "${game.id}" has invalid player range ${game.minPlayers}-${game.maxPlayers}`,
        );
      }
      games.set(game.id, game as AnyGameDefinition);
    },
    get: (id) => games.get(id),
    has: (id) => games.has(id),
    list: () => [...games.values()],
  };
}
