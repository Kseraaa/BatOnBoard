import type { BossConfig } from '../rules';
import { cityV1 } from './city-v1';
import type { BoardData } from './types';

export type { BoardData, FamilyInfo, LocalizedText, SpaceData } from './types';
export { cityV1 };

/** กระดานทั้งหมด — client ใช้ boardId ใน view หากระดานที่ต้องแสดง */
export const boards: Record<string, BoardData> = {
  [cityV1.id]: cityV1,
};

export const DEFAULT_BOARD_ID = cityV1.id;

export function getBoard(id: string): BoardData | undefined {
  return boards[id];
}

/** ตัดชื่อที่แสดงออก เหลือแค่สิ่งที่กติกาใช้ */
export function toBossConfig(board: BoardData): BossConfig {
  return {
    boardId: board.id,
    spaces: board.spaces.map(({ id, shares, required, optional }) => ({
      id,
      shares,
      required,
      optional,
    })),
    dealValues: board.dealValues,
    endFaces: board.endFaces,
  };
}
