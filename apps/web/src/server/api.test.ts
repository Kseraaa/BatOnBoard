/**
 * เทสต์ route handler จริง (ไม่ผ่าน HTTP) กับ store ในหน่วยความจำ
 * ตรวจการต่อสาย: URL → schema → RoomService → Ack JSON
 */
import type { Ack, JoinedMessage, RoomSnapshot } from '@batonboard/protocol';
import { describe, expect, it } from 'vitest';
import { POST as command } from '@/app/api/rooms/[code]/[command]/route';
import { GET as poll } from '@/app/api/rooms/[code]/route';
import { POST as create } from '@/app/api/rooms/route';

const BASE = 'http://localhost';

async function body<T>(res: Response): Promise<Ack<T>> {
  return (await res.json()) as Ack<T>;
}

function post(path: string, payload: unknown, token?: string): Request {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

const params = <T>(p: T) => ({ params: Promise.resolve(p) });

async function newRoom(): Promise<JoinedMessage> {
  const res = await body<JoinedMessage>(
    await create(post('/api/rooms', { name: 'Ann', gameId: 'spyfall' })),
  );
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

describe('API /api/rooms', () => {
  it('สร้าง → เข้าห้อง → poll ด้วย Bearer token', async () => {
    const host = await newRoom();
    const res = await command(
      post(`/api/rooms/${host.code}/join`, { name: 'Bob' }),
      params({ code: host.code, command: 'join' }),
    );
    const bob = await body<JoinedMessage>(res);
    expect(bob.ok).toBe(true);

    const snapRes = await poll(
      new Request(`${BASE}/api/rooms/${host.code}`, {
        headers: { authorization: `Bearer ${host.token}` },
      }),
      params({ code: host.code }),
    );
    expect(snapRes.headers.get('cache-control')).toBe('no-store');
    const snap = await body<RoomSnapshot>(snapRes);
    expect(snap.ok && snap.value.room.players.map((p) => p.name)).toEqual(['Ann', 'Bob']);

    // etag เดิม = ไม่มีอะไรเปลี่ยน
    const etag = snap.ok ? snap.value.etag : '';
    const again = await body<RoomSnapshot | null>(
      await poll(
        new Request(`${BASE}/api/rooms/${host.code}?etag=${encodeURIComponent(etag)}`, {
          headers: { authorization: `Bearer ${host.token}` },
        }),
        params({ code: host.code }),
      ),
    );
    expect(again).toEqual({ ok: true, value: null });
  });

  it('คำสั่งที่ต้องรู้ตัวผู้เล่นแต่ไม่มี token ถูกปฏิเสธ', async () => {
    const host = await newRoom();
    const res = await command(
      post(`/api/rooms/${host.code}/start`, undefined),
      params({ code: host.code, command: 'start' }),
    );
    expect(await body(res)).toEqual({ ok: false, error: 'not-in-room' });
  });

  it('รหัสห้องผิดรูปแบบ = room-not-found, คำสั่งที่ไม่มี = 404', async () => {
    const res = await poll(new Request(`${BASE}/api/rooms/0OIL1x`), params({ code: '0OIL1x' }));
    expect(await body(res)).toEqual({ ok: false, error: 'room-not-found' });
    const host = await newRoom();
    const unknown = await command(
      post(`/api/rooms/${host.code}/hack`, {}, host.token),
      params({ code: host.code, command: 'hack' }),
    );
    expect(unknown.status).toBe(404);
  });

  it('body ใหญ่เกินหรือ JSON เสีย = invalid-payload', async () => {
    const host = await newRoom();
    const big = await command(
      post(`/api/rooms/${host.code}/action`, { junk: 'x'.repeat(20_000) }, host.token),
      params({ code: host.code, command: 'action' }),
    );
    expect(await body(big)).toEqual({ ok: false, error: 'invalid-payload' });

    const broken = await create(
      new Request(`${BASE}/api/rooms`, { method: 'POST', body: '{not json' }),
    );
    expect(await body(broken)).toEqual({ ok: false, error: 'invalid-payload' });
  });
});
