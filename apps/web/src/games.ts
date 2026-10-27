import { bossClient } from '@batonboard/boss/client';
import { poetsClient } from '@batonboard/poets/client';
import { spyfallClient } from '@batonboard/spyfall/client';
import type { GameClient } from '@batonboard/ui';

/**
 * ที่เดียวในเว็บที่อ้างถึงเกม — เพิ่มเกมใหม่ด้วยการเพิ่มในรายการนี้
 * (คู่กับ apps/server/src/games.ts)
 */
export const gameClients: GameClient[] = [spyfallClient, bossClient, poetsClient];

export function getGameClient(id: string): GameClient | undefined {
  return gameClients.find((g) => g.id === id);
}
