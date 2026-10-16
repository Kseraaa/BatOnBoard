import { randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@batonboard/protocol';
import type { IdSource } from './rooms';

/** id จริงจาก crypto — token ต้องเดายาก เพราะใช้แทนรหัสผ่านของผู้เล่น */
export const cryptoIds: IdSource = {
  roomCode: () =>
    Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
    ).join(''),
  playerId: () => randomBytes(6).toString('base64url'),
  token: () => randomBytes(24).toString('base64url'),
  seed: () => randomInt(2 ** 32),
};
