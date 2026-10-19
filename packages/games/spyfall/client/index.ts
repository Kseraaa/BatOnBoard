import type { GameClient } from '@batonboard/ui';
import { MAX_PLAYERS, MIN_PLAYERS } from '../rules/constants';
import { SPYFALL_ICON } from './icon';
import { GAME_DESCRIPTION, GAME_DISPLAY_NAME } from './messages';
import { SpyfallScreen } from './screen';
import { SpyfallSettings } from './settings';

export { GAME_DESCRIPTION, GAME_DISPLAY_NAME, spyfallMessages } from './messages';
export type { SpyfallMessages } from './messages';
export { SpyfallScreen } from './screen';
export { SpyfallSettings } from './settings';

/** หน้าจอของเกมที่เว็บลงทะเบียนใน apps/web/src/games.ts */
export const spyfallClient: GameClient = {
  id: 'spyfall',
  displayName: GAME_DISPLAY_NAME,
  description: GAME_DESCRIPTION,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // ผู้เล่นถามตอบกันเองนอกระบบ
  mode: 'together',
  icon: SPYFALL_ICON,
  Screen: SpyfallScreen,
  Settings: SpyfallSettings,
};
