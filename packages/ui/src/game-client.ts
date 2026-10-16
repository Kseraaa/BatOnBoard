import type { ComponentType } from 'react';

/**
 * สัญญาระหว่างเว็บกับหน้าจอของแต่ละเกม — เว็บไม่รู้จักกติกาเกม
 * แค่ส่ง view ที่ได้จาก server กับข้อมูลห้องให้ Screen ของเกมวาดเอง
 */
export type Locale = 'th' | 'en';
export type LocalizedText = Record<Locale, string>;

export interface PlayerInfo {
  id: string;
  name: string;
  online: boolean;
}

export interface GameScreenProps {
  /** view จาก server (playerView ของผู้เล่นคนนี้) — เกมแปลง type เอง */
  view: unknown;
  players: PlayerInfo[];
  me: string;
  hostId: string;
  /** serverNow - เวลาเครื่อง ใช้กับ Countdown */
  serverOffset: number;
  locale: Locale;
  /** ส่ง action ผ่าน 'game:action' คืนรหัส error หรือ null ถ้าสำเร็จ */
  sendAction(action: unknown): Promise<string | null>;
  /** แปลรหัส error ระดับแพลตฟอร์ม (เกมแปลรหัสของตัวเองก่อน) */
  platformError(code: string): string;
}

export interface GameSettingsProps {
  options: unknown;
  locale: Locale;
  editable: boolean;
  onChange(options: unknown): void;
}

export interface GameClient {
  id: string;
  displayName: LocalizedText;
  description: LocalizedText;
  minPlayers: number;
  maxPlayers: number;
  Screen: ComponentType<GameScreenProps>;
  Settings?: ComponentType<GameSettingsProps>;
}
