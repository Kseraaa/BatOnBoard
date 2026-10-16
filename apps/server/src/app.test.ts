import type { AddressInfo } from 'node:net';
import type {
  Ack,
  ClientToServerEvents,
  GameViewMessage,
  JoinedMessage,
  RoomStateMessage,
  ServerToClientEvents,
} from '@batonboard/protocol';
import type { SpyfallView } from '@batonboard/spyfall/rules';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const WEB = 'http://localhost:3000';

let built: Awaited<ReturnType<typeof buildApp>>;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  built = await buildApp({ config: { webOrigins: [WEB] } });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await built.app.close();
});

function client(): Client {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return c;
}

function next<E extends keyof ServerToClientEvents>(
  c: Client,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => {
    c.once(event as 'room:state', resolve as never);
  });
}

async function call<T>(fn: (ack: (res: Ack<T>) => void) => void): Promise<T> {
  const res = await new Promise<Ack<T>>((resolve) => fn(resolve));
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

describe('HTTP', () => {
  it('/health ตอบ ok', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('CORS รับเฉพาะโดเมนเว็บของโปรเจกต์', async () => {
    const good = await built.app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: WEB },
    });
    expect(good.headers['access-control-allow-origin']).toBe(WEB);
    const bad = await built.app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Socket.IO', () => {
  it('สร้างห้อง → เข้าห้อง → เริ่มเกม: ทุกคนได้ view ของตัวเอง มีสายลับคนเดียว', async () => {
    const [a, b, c] = [client(), client(), client()];
    const created = await call<JoinedMessage>((ack) =>
      a.emit('room:create', { name: 'Ann', gameId: 'spyfall' }, ack),
    );
    const lobby = next(a, 'room:state');
    await call<JoinedMessage>((ack) =>
      b.emit('room:join', { code: created.code, name: 'Bob' }, ack),
    );
    await call<JoinedMessage>((ack) =>
      c.emit('room:join', { code: created.code, name: 'Cat' }, ack),
    );
    expect(((await lobby) as RoomStateMessage).code).toBe(created.code);

    const views = [a, b, c].map((s) => next(s, 'game:view'));
    await call((ack) => a.emit('room:start', ack));
    const received = (await Promise.all(views)) as GameViewMessage<SpyfallView>[];
    expect(received.map((m) => m.view.you.role).filter((r) => r === 'spy')).toHaveLength(1);
    expect(new Set(received.map((m) => m.view.me)).size).toBe(3);
    for (const m of received) expect(typeof m.serverNow).toBe('number');
  });

  it('รีเฟรช (socket ใหม่ + token เดิม) แล้วได้ view เดิมทันที', async () => {
    const [a, b, c] = [client(), client(), client()];
    const created = await call<JoinedMessage>((ack) =>
      a.emit('room:create', { name: 'Ann', gameId: 'spyfall' }, ack),
    );
    const bob = await call<JoinedMessage>((ack) =>
      b.emit('room:join', { code: created.code, name: 'Bob' }, ack),
    );
    await call<JoinedMessage>((ack) =>
      c.emit('room:join', { code: created.code, name: 'Cat' }, ack),
    );
    const bobView = next(b, 'game:view');
    await call((ack) => a.emit('room:start', ack));
    const before = (await bobView) as GameViewMessage<SpyfallView>;

    const offline = next(a, 'room:state');
    b.disconnect();
    const state = (await offline) as RoomStateMessage;
    expect(state.players.find((p) => p.id === bob.playerId)?.online).toBe(false);

    const b2 = client();
    const after = next(b2, 'game:view');
    const rejoined = await call<JoinedMessage>((ack) =>
      b2.emit('room:join', { code: created.code, name: 'Bob', token: bob.token }, ack),
    );
    expect(rejoined.playerId).toBe(bob.playerId);
    expect(((await after) as GameViewMessage<SpyfallView>).view).toEqual(before.view);
  });

  it('action ผิดโดยไม่มี ack ได้ event error กลับมา', async () => {
    const a = client();
    const err = next(a, 'error');
    a.emit('game:action', { type: 'PASS' });
    expect(await err).toEqual({ code: 'not-in-room' });
  });

  it('โดนเตะแล้ว socket ถูกตัด', async () => {
    const [a, b] = [client(), client()];
    const created = await call<JoinedMessage>((ack) =>
      a.emit('room:create', { name: 'Ann', gameId: 'spyfall' }, ack),
    );
    const bob = await call<JoinedMessage>((ack) =>
      b.emit('room:join', { code: created.code, name: 'Bob' }, ack),
    );
    const kicked = next(b, 'room:kicked');
    const gone = new Promise((resolve) => b.once('disconnect', resolve));
    await call((ack) => a.emit('room:kick', { playerId: bob.playerId }, ack));
    expect(await kicked).toEqual({ reason: 'kicked' });
    expect(await gone).toBe('io server disconnect');
  });
});
