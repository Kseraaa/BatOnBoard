/**
 * เก็บชื่อเล่นและ token ของแต่ละห้องใน localStorage
 * ห่อทุกครั้งด้วย try/catch เพราะ private mode บางเครื่องเขียนไม่ได้
 */
const NAME_KEY = 'batonboard:name';
const roomKey = (code: string) => `batonboard:room:${code.toUpperCase()}`;

export interface RoomSession {
  token: string;
  playerId: string;
}

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // เก็บไม่ได้ก็เล่นต่อได้ แค่รีเฟรชแล้วต้องเข้าห้องใหม่
  }
}

export const storage = {
  getName: () => read(NAME_KEY) ?? '',
  setName: (name: string) => write(NAME_KEY, name),

  getSession(code: string): RoomSession | null {
    const raw = read(roomKey(code));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'token' in parsed &&
        'playerId' in parsed &&
        typeof parsed.token === 'string' &&
        typeof parsed.playerId === 'string'
      ) {
        return { token: parsed.token, playerId: parsed.playerId };
      }
    } catch {
      // ข้อมูลเสีย ทิ้งไป
    }
    return null;
  },
  setSession: (code: string, session: RoomSession) => write(roomKey(code), JSON.stringify(session)),
  clearSession: (code: string) => write(roomKey(code), null),
};
