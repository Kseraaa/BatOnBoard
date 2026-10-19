import type { GameClient } from '@batonboard/ui';
import { MAX_PLAYERS, MIN_PLAYERS } from '../rules/constants';
import { BOSS_ICON } from './icon';
import { GAME_DESCRIPTION, GAME_DISPLAY_NAME } from './messages';
import { BossScreen } from './screen';
import { BossSettings } from './settings';

export { GAME_DESCRIPTION, GAME_DISPLAY_NAME, bossMessages } from './messages';
export type { BossMessages } from './messages';
export { BossScreen } from './screen';
export { BossSettings } from './settings';

/** หน้าจอของเกมที่เว็บลงทะเบียนใน apps/web/src/games.ts */
export const bossClient: GameClient = {
  id: 'boss',
  displayName: GAME_DISPLAY_NAME,
  description: GAME_DESCRIPTION,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // ต่อรองกันด้วยปาก (นั่งด้วยกันหรือ call) บนจอเป็นตัวบันทึกข้อตกลงและลงไพ่
  mode: 'together',
  layout: 'wide',
  icon: BOSS_ICON,
  Screen: BossScreen,
  Settings: BossSettings,
};
