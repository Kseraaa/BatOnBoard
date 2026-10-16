import type { SpyfallView } from '@batonboard/spyfall/rules';
import { describe, expect, it } from 'vitest';
import { HOST_GRACE_MS, ROOM_IDLE_MS } from './rooms';
import { createTestManager } from './testing';

type Setup = ReturnType<typeof createTestManager>;

function view(t: Setup['transport'], conn: string): SpyfallView {
  return t.last(conn, 'game:view')?.view as SpyfallView;
}

/** สร้างห้องโดย c1 แล้วให้ c2..cN เข้าห้อง */
function roomWith(n: number) {
  const setup = createTestManager();
  const { manager } = setup;
  const created = manager.createRoom('c1', { name: 'Ann', gameId: 'spyfall' });
  if (!created.ok) throw new Error(created.error);
  const { code } = created.value;
  const tokens: Record<string, string> = { c1: created.value.token };
  const ids: Record<string, string> = { c1: created.value.playerId };
  for (let i = 2; i <= n; i++) {
    const res = manager.joinRoom(`c${i}`, { code, name: `Player ${i}` });
    if (!res.ok) throw new Error(res.error);
    tokens[`c${i}`] = res.value.token;
    ids[`c${i}`] = res.value.playerId;
  }
  const conns = Array.from({ length: n }, (_, i) => `c${i + 1}`);
  return { ...setup, code, tokens, ids, conns };
}

function started(n = 4) {
  const r = roomWith(n);
  const res = r.manager.start('c1');
  if (!res.ok) throw new Error(res.error);
  return r;
}

describe('สร้างและเข้าห้อง', () => {
  it('สร้างห้องได้ รหัส 6 ตัว ผู้สร้างเป็น host', () => {
    const { manager, transport } = createTestManager();
    const res = manager.createRoom('c1', { name: '  Ann  ', gameId: 'spyfall' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.code).toMatch(/^[A-Z2-9]{6}$/);
    const state = transport.last('c1', 'room:state');
    expect(state).toMatchObject({
      code: res.value.code,
      gameId: 'spyfall',
      hostId: res.value.playerId,
      status: 'lobby',
      players: [{ id: res.value.playerId, name: 'Ann', online: true }],
    });
  });

  it('ปฏิเสธ payload ผิดและเกมที่ไม่มี', () => {
    const { manager } = createTestManager();
    expect(manager.createRoom('c1', { name: '', gameId: 'spyfall' })).toEqual({
      ok: false,
      error: 'invalid-payload',
    });
    expect(manager.createRoom('c1', { name: 'x'.repeat(21), gameId: 'spyfall' }).ok).toBe(false);
    expect(manager.createRoom('c1', 'hello')).toEqual({ ok: false, error: 'invalid-payload' });
    expect(manager.createRoom('c1', { name: 'Ann', gameId: 'chess' })).toEqual({
      ok: false,
      error: 'unknown-game',
    });
  });

  it('เข้าห้องด้วยรหัส (ตัวพิมพ์เล็กก็ได้) แล้วทุกคนเห็นรายชื่อ', () => {
    const { manager, transport, code } = roomWith(1);
    const res = manager.joinRoom('c2', { code: code.toLowerCase(), name: 'Bob' });
    expect(res.ok).toBe(true);
    for (const c of ['c1', 'c2']) {
      expect(transport.last(c, 'room:state')?.players.map((p) => p.name)).toEqual(['Ann', 'Bob']);
    }
  });

  it('room:state ไม่มี token ของใครเลย', () => {
    const { transport, tokens, conns } = roomWith(3);
    for (const c of conns) {
      const json = JSON.stringify(transport.all(c, 'room:state'));
      for (const token of Object.values(tokens)) expect(json).not.toContain(token);
    }
  });

  it('ปฏิเสธห้องที่ไม่มี ชื่อซ้ำ ห้องเต็ม และ connection ที่อยู่ห้องอื่นแล้ว', () => {
    const { manager, code } = roomWith(8);
    expect(manager.joinRoom('x', { code: 'ZZZZZZ', name: 'Zed' }).ok).toBe(false);
    expect(manager.joinRoom('x', { code: 'ZZZZZZ', name: 'Zed' })).toEqual({
      ok: false,
      error: 'room-not-found',
    });
    expect(manager.joinRoom('x', { code, name: 'Zed' })).toEqual({ ok: false, error: 'room-full' });
    expect(manager.joinRoom('c2', { code, name: 'Zed' })).toEqual({
      ok: false,
      error: 'already-in-room',
    });
  });

  it('ชื่อซ้ำไม่สนตัวพิมพ์', () => {
    const { manager, code } = roomWith(1);
    expect(manager.joinRoom('c2', { code, name: 'ann' })).toEqual({
      ok: false,
      error: 'name-taken',
    });
  });

  it('รหัสห้องที่มีตัวอักษรสับสน (0/O/1/I) ไม่ผ่าน schema', () => {
    const { manager } = roomWith(1);
    expect(manager.joinRoom('c2', { code: 'TEST0O', name: 'Bob' })).toEqual({
      ok: false,
      error: 'invalid-payload',
    });
  });
});

describe('เริ่มเกมและส่ง view', () => {
  it('host เท่านั้นที่เริ่มเกมได้ และต้องมีผู้เล่นพอ', () => {
    const small = roomWith(2);
    expect(small.manager.start('c1')).toEqual({ ok: false, error: 'too-few-players' });
    const r = roomWith(3);
    expect(r.manager.start('c2')).toEqual({ ok: false, error: 'not-host' });
    expect(r.manager.start('c1')).toEqual({ ok: true, value: undefined });
    expect(r.manager.start('c1')).toEqual({ ok: false, error: 'not-in-lobby' });
  });

  it('ส่ง view แยกรายคน มีสายลับคนเดียว และ view ของสายลับไม่มีสถานที่', () => {
    const { transport, conns, ids } = started(5);
    const views = conns.map((c) => view(transport, c));
    for (const [i, v] of views.entries()) expect(v.me).toBe(ids[conns[i] as string]);

    const spies = views.filter((v) => v.you.role === 'spy');
    expect(spies).toHaveLength(1);
    const agentView = views.find((v) => v.you.role === 'agent');
    const locationId = agentView?.you.role === 'agent' ? agentView.you.locationId : '';
    expect(locationId).not.toBe('');

    const spyConn = conns[views.indexOf(spies[0] as SpyfallView)] as string;
    expect(JSON.stringify(transport.all(spyConn, 'game:view'))).not.toContain(locationId);
  });

  it('ส่ง serverNow ไปกับทุก view และตั้ง timer ตาม deadline ของเกม', () => {
    const { transport, clock, code } = started(3);
    const msg = transport.last('c1', 'game:view');
    expect(msg?.serverNow).toBe(clock.time);
    expect(clock.dueAt(`deadline:${code}`)).toBe((msg?.view as SpyfallView).deadline);
  });

  it('ปรับตั้งค่าได้เฉพาะ host ในล็อบบี้ และต้องผ่าน optionsSchema ของเกม', () => {
    const { manager, transport } = roomWith(3);
    expect(manager.updateSettings('c2', { options: { durationMs: 120_000 } })).toEqual({
      ok: false,
      error: 'not-host',
    });
    expect(manager.updateSettings('c1', { options: { durationMs: 5 } })).toEqual({
      ok: false,
      error: 'invalid-options',
    });
    expect(manager.updateSettings('c1', { options: { durationMs: 120_000 } }).ok).toBe(true);
    expect(transport.last('c2', 'room:state')?.options).toEqual({ durationMs: 120_000 });

    manager.start('c1');
    expect(view(transport, 'c1').deadline).toBe(
      (transport.last('c1', 'game:view')?.serverNow as number) + 120_000,
    );
    expect(manager.updateSettings('c1', { options: { durationMs: 60_000 } })).toEqual({
      ok: false,
      error: 'not-in-lobby',
    });
  });
});

describe('action pipeline', () => {
  it('action ที่ผ่านแล้วทุกคนได้ view ใหม่', () => {
    const { manager, transport, conns, ids } = started(4);
    const agentConn = conns.find((c) => view(transport, c).you.role === 'agent') as string;
    const target = conns.find((c) => c !== agentConn) as string;
    transport.clear();
    expect(manager.action(agentConn, { type: 'ACCUSE', target: ids[target] })).toEqual({
      ok: true,
      value: undefined,
    });
    for (const c of conns) expect(view(transport, c).phase).toBe('voting');
  });

  it('action ที่ผิดคืนรหัส error และไม่ส่ง view ใหม่', () => {
    const { manager, transport } = started(4);
    transport.clear();
    expect(manager.action('c1', { type: 'HACK' })).toEqual({ ok: false, error: 'invalid-action' });
    expect(manager.action('c2', { type: 'NEXT_ROUND' })).toEqual({
      ok: false,
      error: 'wrong-phase',
    });
    expect(transport.inbox.size).toBe(0);
  });

  it('action ก่อนเริ่มเกมหรือจาก connection ที่ไม่อยู่ห้อง ถูกปฏิเสธ', () => {
    const { manager } = roomWith(3);
    expect(manager.action('c1', { type: 'PASS' })).toEqual({ ok: false, error: 'not-playing' });
    expect(manager.action('nobody', { type: 'PASS' })).toEqual({ ok: false, error: 'not-in-room' });
  });

  it('ใช้ ctx.hostId จากห้อง: NEXT_ROUND ได้เฉพาะ host', () => {
    const { manager, transport, conns } = started(3);
    const spyConn = conns.find((c) => view(transport, c).you.role === 'spy') as string;
    const agent = view(transport, conns.find((c) => c !== spyConn) as string);
    const locationId = agent.you.role === 'agent' ? agent.you.locationId : '';
    expect(manager.action(spyConn, { type: 'SPY_GUESS', locationId }).ok).toBe(true);
    expect(manager.action('c2', { type: 'NEXT_ROUND' })).toEqual({ ok: false, error: 'not-host' });
    expect(manager.action('c1', { type: 'NEXT_ROUND' }).ok).toBe(true);
  });
});

describe('timer', () => {
  it('หมดเวลาแล้ว server เรียก onDeadline และส่ง view ใหม่เอง', () => {
    const { transport, clock, conns } = started(3);
    const deadline = view(transport, 'c1').deadline as number;
    clock.advance(deadline - clock.time - 1);
    expect(view(transport, 'c1').phase).toBe('questioning');
    clock.advance(1);
    for (const c of conns) expect(view(transport, c).phase).toBe('final-vote');
  });

  it('โหวตหยุดนาฬิกา: timer เปลี่ยนเป็นของโหวต แล้วกลับมาเมื่อโหวตไม่ผ่าน', () => {
    const { manager, transport, clock, ids, code } = started(3);
    const before = view(transport, 'c1').deadline as number;
    clock.advance(10_000);
    manager.action('c1', { type: 'ACCUSE', target: ids.c2 });
    expect(clock.dueAt(`deadline:${code}`)).toBe(view(transport, 'c1').vote?.deadline);
    clock.advance(5_000);
    manager.action('c3', { type: 'BALLOT', agree: false });
    expect(clock.dueAt(`deadline:${code}`)).toBe(before + 5_000);
  });

  it('กลับล็อบบี้แล้วยกเลิก timer', () => {
    const { manager, clock, code, transport } = started(3);
    expect(manager.backToLobby('c2')).toEqual({ ok: false, error: 'not-host' });
    expect(manager.backToLobby('c1').ok).toBe(true);
    expect(clock.has(`deadline:${code}`)).toBe(false);
    expect(transport.last('c2', 'room:state')?.status).toBe('lobby');
  });
});

describe('หลุดการเชื่อมต่อและกลับเข้าห้อง', () => {
  it('หลุดแล้วไม่ถูกลบ แค่แสดงว่าออฟไลน์', () => {
    const { manager, transport, ids } = roomWith(3);
    manager.disconnect('c2');
    const players = transport.last('c1', 'room:state')?.players;
    expect(players?.find((p) => p.id === ids.c2)).toMatchObject({ online: false });
    expect(players).toHaveLength(3);
  });

  it('กลับเข้าด้วย token เดิม = ผู้เล่นคนเดิม และได้ view ปัจจุบันทันที', () => {
    const { manager, transport, tokens, ids, code } = started(4);
    const before = view(transport, 'c2');
    manager.disconnect('c2');
    const res = manager.joinRoom('c2-new', { code, name: 'ชื่อใหม่ก็ได้', token: tokens.c2 });
    expect(res).toEqual({ ok: true, value: { code, playerId: ids.c2, token: tokens.c2 } });
    expect(view(transport, 'c2-new')).toEqual(before);
    expect(transport.last('c1', 'room:state')?.players.find((p) => p.id === ids.c2)).toMatchObject({
      name: 'Player 2',
      online: true,
    });
  });

  it('token ถูกแต่ยังมีแท็บเก่าอยู่ = ตัดแท็บเก่า', () => {
    const { manager, transport, tokens, code } = roomWith(2);
    manager.joinRoom('c2-tab2', { code, name: 'x', token: tokens.c2 });
    expect(transport.last('c2', 'room:kicked')).toEqual({ reason: 'replaced' });
    expect(transport.closed.has('c2')).toBe(true);
    // แท็บเก่าส่งอะไรมาก็ไม่มีผลแล้ว
    expect(manager.leave('c2')).toEqual({ ok: false, error: 'not-in-room' });
    expect(transport.last('c1', 'room:state')?.players).toHaveLength(2);
  });

  it('token ของห้องอื่นใช้ไม่ได้ — เข้าเป็นผู้เล่นใหม่', () => {
    const a = roomWith(2);
    const res = a.manager.createRoom('other', { name: 'Zed', gameId: 'spyfall' });
    if (!res.ok) throw new Error();
    const join = a.manager.joinRoom('c9', { code: a.code, name: 'Zed', token: res.value.token });
    expect(join.ok && join.value.playerId).not.toBe(res.value.playerId);
  });

  it('host ออฟไลน์นานเกิน grace = โอน host ให้คนที่ออนไลน์', () => {
    const { manager, transport, clock, ids } = roomWith(3);
    manager.disconnect('c1');
    clock.advance(HOST_GRACE_MS - 1);
    expect(transport.last('c2', 'room:state')?.hostId).toBe(ids.c1);
    clock.advance(1);
    expect(transport.last('c2', 'room:state')?.hostId).toBe(ids.c2);
  });

  it('host กลับมาทันก่อน grace = ยังเป็น host', () => {
    const { manager, transport, clock, ids, tokens, code } = roomWith(3);
    manager.disconnect('c1');
    clock.advance(1_000);
    manager.joinRoom('c1b', { code, name: 'Ann', token: tokens.c1 });
    clock.advance(HOST_GRACE_MS);
    expect(transport.last('c2', 'room:state')?.hostId).toBe(ids.c1);
  });

  it('ทุกคนออฟไลน์นานเกินกำหนด = ลบห้อง', () => {
    const { manager, clock, code, conns } = roomWith(2);
    for (const c of conns) manager.disconnect(c);
    clock.advance(ROOM_IDLE_MS - 1);
    expect(manager.hasRoom(code)).toBe(true);
    clock.advance(1);
    expect(manager.hasRoom(code)).toBe(false);
  });
});

describe('เตะและออกจากห้อง', () => {
  it('host เตะได้ คนโดนเตะได้รับแจ้งและถูกตัด token ใช้ไม่ได้อีก', () => {
    const { manager, transport, ids, tokens, code } = roomWith(3);
    expect(manager.kick('c2', { playerId: ids.c3 })).toEqual({ ok: false, error: 'not-host' });
    expect(manager.kick('c1', { playerId: ids.c1 })).toEqual({
      ok: false,
      error: 'cannot-kick-self',
    });
    expect(manager.kick('c1', { playerId: 'nobody' })).toEqual({
      ok: false,
      error: 'player-not-found',
    });
    expect(manager.kick('c1', { playerId: ids.c3 }).ok).toBe(true);
    expect(transport.last('c3', 'room:kicked')).toEqual({ reason: 'kicked' });
    expect(transport.closed.has('c3')).toBe(true);
    expect(transport.last('c1', 'room:state')?.players).toHaveLength(2);

    const back = manager.joinRoom('c3b', { code, name: 'Player 3', token: tokens.c3 });
    expect(back.ok && back.value.playerId).not.toBe(ids.c3);
  });

  it('เตะผู้เล่นออฟไลน์กลางเกมได้ และเกมจัดการต่อ (เตะสายลับ = ฝ่ายผู้เล่นชนะ)', () => {
    const { manager, transport, conns, ids } = started(4);
    const spyConn = conns.find((c) => view(transport, c).you.role === 'spy') as string;
    const watcher = conns.find((c) => c !== spyConn) as string;
    if (spyConn === 'c1') {
      // host เตะตัวเองไม่ได้ — host ที่เป็นสายลับออกจากห้องเองแทน
      manager.leave('c1');
    } else {
      manager.disconnect(spyConn);
      expect(manager.kick('c1', { playerId: ids[spyConn] }).ok).toBe(true);
    }
    expect(view(transport, watcher).result).toEqual({ winner: 'agents', reason: 'spy-left' });
  });

  it('host ออกจากห้อง = โอน host ให้คนถัดไปที่ออนไลน์', () => {
    const { manager, transport, ids } = roomWith(3);
    manager.disconnect('c2');
    manager.leave('c1');
    expect(transport.last('c3', 'room:state')?.hostId).toBe(ids.c3);
  });

  it('คนสุดท้ายออก = ลบห้อง', () => {
    const { manager, code } = roomWith(1);
    manager.leave('c1');
    expect(manager.hasRoom(code)).toBe(false);
    expect(manager.roomCount).toBe(0);
  });

  it('ผู้เล่นออกกลางเกมจนคนไม่พอ = เกมจบ และยกเลิก timer', () => {
    const { manager, transport, clock, code } = started(3);
    const remaining = ['c1', 'c2', 'c3'].filter((c) => view(transport, c).you.role !== 'spy');
    manager.leave(remaining[1] as string);
    expect(view(transport, remaining[0] as string).result?.reason).toBe('not-enough-players');
    expect(clock.has(`deadline:${code}`)).toBe(false);
  });
});
