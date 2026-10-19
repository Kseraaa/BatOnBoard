import { DEFAULT_BOARD_ID, getBoard, toBossConfig } from './data';
import { createBoss } from './rules';

const board = getBoard(DEFAULT_BOARD_ID);
if (!board) throw new Error(`missing board ${DEFAULT_BOARD_ID}`);

/** เกมที่ server ลงทะเบียนใน registry */
export const boss = createBoss(toBossConfig(board));
