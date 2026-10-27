import type { GameClient } from '@batonboard/ui';
import { MAX_PLAYERS, MIN_PLAYERS } from '../rules/constants';
import type { PoetsOptions } from '../rules/types';
import { POETS_ICON } from './icon';
import { GAME_DESCRIPTION, GAME_DISPLAY_NAME } from './messages';
import { PoetsScreen } from './screen';
import { PoetsSettings } from './settings';

export { GAME_DESCRIPTION, GAME_DISPLAY_NAME, poetsMessages } from './messages';
export type { PoetsMessages } from './messages';
export { PoetsScreen } from './screen';
export { PoetsSettings } from './settings';

/** หน้าจอของเกมที่เว็บลงทะเบียนใน apps/web/src/games.ts */
export const poetsClient: GameClient = {
  id: 'poets',
  displayName: GAME_DISPLAY_NAME,
  description: GAME_DESCRIPTION,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // อ่านออกเสียงและคุยหาสายลับกันเองนอกระบบ
  mode: 'together',
  icon: POETS_ICON,
  // ตรงกับ hostModerates ของกติกา: ค่าเริ่มต้น host เป็นผู้ดำเนินเกม (ครู)
  hostModerates: (options) => (options as Partial<PoetsOptions> | null)?.hostPlays !== true,
  Screen: PoetsScreen,
  Settings: PoetsSettings,
};
