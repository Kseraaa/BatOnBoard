import { GUESS_MS } from '@batonboard/spyfall/rules';
import type { SpyfallView } from '@batonboard/spyfall/rules';
import { describe, expect, it } from 'vitest';
import { HOST_GRACE_MS, OFFLINE_AFTER_MS, ROOM_TTL_SECONDS } from './room';
import { createTestService, must, roomWith } from './testing';

const view = (snap: { view: unknown }) => snap.view as SpyfallView;

async function started(n = 4) {
  const r = await roomWith(n);
  must(await r.service.start(r.code, r.token(0)));
  return r;
}

describe('สร้างและเข้าห้อง', () => {
  it('สร้างห้องได้ รหัส 6 ตัว ผู้สร้างเป็น host', async () => {
    const { service } = createTestService();
    const joined = must(await service.create({ name: '  Ann  ', gameId: 'spyfall' }));
    expect(joined.code).toMatch(/^[A-Z2-9]{6}$/);
    const snap = must(await service.poll(joined.code, joined.token, null));
    expect(snap?.room).toMatchObject({
      code: joined.code,
      gameId: 'spyfall',
      hostId: joined.playerId,
      status: 'lobby',
      players: [{ id: joined.playerId, name: 'Ann', online: true }],
    });
    expect(snap?.view).toBeNull();
  });

  it('ปฏิเสธ payload ผิดและเกมที่ไม่มี', async () => {
    const { service } = createTestService();
    expect(await service.create({ name: '', gameId: 'spyfall' })).toEqual({
      ok: false,
      error: 'invalid-payload',
    });
    expect(await service.create('hello')).toEqual({ ok: false, error: 'invalid-payload' });
    expect(await service.create({ name: 'Ann', gameId: 'chess' })).toEqual({
      ok: false,
      error: 'unknown-game',
    });
  });

  it('เข้าห้องด้วยรหัส (ตัวพิมพ์เล็กก็ได้) แล้วทุกคนเห็นรายชื่อ', async () => {
    const r = await roomWith(1);
    must(await r.service.join(r.code.toLowerCase(), { name: 'Bob' }));
    expect((await r.poll(0)).room.players.map((p) => p.name)).toEqual(
      ['Ann', 'Player 2'].slice(0, 1).concat('Bob'),
    );
  });

  it('ห้องไม่มี ชื่อซ้ำ (ไม่สนตัวพิมพ์) และห้องเต็ม ถูกปฏิเสธ', async () => {
    const r = await roomWith(8);
    expect(await r.service.join('ZZZZZZ', { name: 'Zed' })).toEqual({
      ok: false,
      error: 'room-not-found',
    });
    expect(await r.service.join(r.code, { name: 'Zed' })).toEqual({
      ok: false,
      error: 'room-full',
    });
    const small = await roomWith(1);
    expect(await small.service.join(small.code, { name: 'ann' })).toEqual({
      ok: false,
      error: 'name-taken',
    });
  });

  it('snapshot ไม่มี token หรือ hash ของใคร', async () => {
    const r = await roomWith(3);
    const json = JSON.stringify(await r.poll(1));
    for (const p of r.players) {
      expect(json).not.toContain(p.token);
    }
    expect(json).not.toContain('hash(');
  });

  it('ไม่มี token หรือ token ผิด = not-in-room', async () => {
    const r = await roomWith(2);
    expect(await r.service.poll(r.code, null, null)).toEqual({ ok: false, error: 'not-in-room' });
    expect(await r.service.poll(r.code, 'nope', null)).toEqual({ ok: false, error: 'not-in-room' });
  });
});

describe('เริ่มเกมและ view รายคน', () => {
  it('host เท่านั้นที่เริ่มได้ และต้องมีผู้เล่นพอ', async () => {
    const small = await roomWith(2);
    expect(await small.service.start(small.code, small.token(0))).toEqual({
      ok: false,
      error: 'too-few-players',
    });
    const r = await roomWith(3);
    expect(await r.service.start(r.code, r.token(1))).toEqual({ ok: false, error: 'not-host' });
    expect((await r.service.start(r.code, r.token(0))).ok).toBe(true);
    expect(await r.service.start(r.code, r.token(0))).toEqual({ ok: false, error: 'not-in-lobby' });
  });

  it('แต่ละคนได้ view ของตัวเอง มีสายลับคนเดียว และ view สายลับไม่มีสถานที่', async () => {
    const r = await started(5);
    const snaps = await Promise.all(r.players.map((_, i) => r.poll(i)));
    snaps.forEach((s, i) => expect(view(s).me).toBe(r.players[i]?.playerId));
    const spies = snaps.filter((s) => view(s).you.role === 'spy');
    expect(spies).toHaveLength(1);
    const agent = snaps.find((s) => view(s).you.role === 'agent');
    const you = agent && view(agent).you;
    const locationId = you?.role === 'agent' ? you.locationId : '';
    expect(locationId).not.toBe('');
    expect(JSON.stringify(spies[0])).not.toContain(locationId);
  });

  it('คำสั่งคืน snapshot ล่าสุดของคนสั่งทันที', async () => {
    const r = await roomWith(3);
    const snap = must(await r.service.start(r.code, r.token(0)));
    expect(snap.room.status).toBe('playing');
    expect(view(snap).me).toBe(r.players[0]?.playerId);
  });

  it('ตั้งค่าได้เฉพาะ host ในล็อบบี้ และต้องผ่าน optionsSchema ของเกม', async () => {
    const r = await roomWith(3);
    expect(
      await r.service.settings(r.code, r.token(1), { options: { durationMs: 120_000 } }),
    ).toEqual({ ok: false, error: 'not-host' });
    expect(await r.service.settings(r.code, r.token(0), { options: { durationMs: 5 } })).toEqual({
      ok: false,
      error: 'invalid-options',
    });
    must(await r.service.settings(r.code, r.token(0), { options: { durationMs: 120_000 } }));
    expect((await r.poll(1)).room.options).toEqual({ durationMs: 120_000 });
    const snap = must(await r.service.start(r.code, r.token(0)));
    expect(view(snap).deadline).toBe(snap.serverNow + 120_000);
  });
});

describe('action pipeline', () => {
  it('action ผ่านแล้วทุกคนเห็น phase ใหม่', async () => {
    const r = await started(4);
    must(await r.service.action(r.code, r.token(0), { type: 'START_VOTE' }));
    for (let i = 0; i < 4; i++) expect(view(await r.poll(i)).phase).toBe('voting');
  });

  it('action ผิดคืนรหัส error', async () => {
    const r = await started(4);
    expect(await r.service.action(r.code, r.token(0), { type: 'HACK' })).toEqual({
      ok: false,
      error: 'invalid-action',
    });
    expect(await r.service.action(r.code, r.token(1), { type: 'NEXT_ROUND' })).toEqual({
      ok: false,
      error: 'wrong-phase',
    });
    const lobby = await roomWith(3);
    expect(await lobby.service.action(lobby.code, lobby.token(0), { type: 'START_VOTE' })).toEqual({
      ok: false,
      error: 'not-playing',
    });
  });

  it('สองคนโหวตพร้อมกัน ไม่มีโหวตไหนหาย (compare-and-set)', async () => {
    const r = await started(5);
    const snaps = await Promise.all(r.players.map((_, i) => r.poll(i)));
    const spyIdx = snaps.findIndex((s) => view(s).you.role === 'spy');
    const spyId = r.players[spyIdx]?.playerId as string;
    const someone = r.players[(spyIdx + 1) % 5]?.playerId as string;
    must(await r.service.action(r.code, r.token(0), { type: 'START_VOTE' }));
    // ทั้ง 5 คนโหวตพร้อมกัน — ทุกคำสั่งโหลดห้อง rev เดียวกัน คนที่เขียนทีหลังต้องลองใหม่
    const results = await Promise.all(
      r.players.map((_, i) =>
        r.service.action(r.code, r.token(i), {
          type: 'VOTE',
          target: i === spyIdx ? someone : spyId,
        }),
      ),
    );
    expect(results.every((x) => x.ok)).toBe(true);
    const after = view(await r.poll(0));
    expect(after.phase).toBe('guessing');
    expect(after.accused).toBe(spyId);
    expect(Object.values(after.voteRounds[0]?.ballots ?? {}).filter(Boolean)).toHaveLength(5);
  });
});

describe('เวลา (lazy deadline)', () => {
  it('หมดเวลาแล้ว request ถัดไปพาเกมเข้าช่วงโหวต', async () => {
    const r = await started(3);
    const deadline = view(await r.poll(0)).deadline as number;
    r.advance(deadline - r.clock.time - 1);
    expect(view(await r.poll(1)).phase).toBe('questioning');
    r.advance(1);
    expect(view(await r.poll(1)).phase).toBe('voting');
  });

  it('deadline ถูกเรียก ณ เวลาจริง แม้ request มาช้า (เวลาทายของสายลับไม่คลาด)', async () => {
    const r = await started(3);
    r.advance(10_000);
    const voting = must(await r.service.action(r.code, r.token(0), { type: 'START_VOTE' }));
    const voteDeadline = view(voting).deadline as number;
    // ไม่มีใคร poll จนเลยเวลาโหวตไป 20 วินาที
    r.advance(voteDeadline - r.clock.time + 20_000);
    const snap = await r.poll(2);
    expect(view(snap).phase).toBe('guessing');
    // เวลาทายนับจากตอนโหวตหมดเวลา ไม่ใช่จากตอนที่มี request เข้ามา
    expect(view(snap).deadline).toBe(voteDeadline + GUESS_MS);
  });

  it('หลาย deadline ที่เลยมาแล้วถูกเรียกต่อกันใน request เดียว', async () => {
    const r = await started(3);
    r.advance(60 * 60_000);
    // ถามตอบ → โหวต (ไม่มีใครโหวต) → สายลับไม่ทาย = โหวตผิด + ทายผิด
    expect(view(await r.poll(0)).result).toEqual({ winner: null, winners: [], reason: 'missed' });
  });
});

describe('etag และสถานะออนไลน์', () => {
  it('ไม่มีอะไรเปลี่ยน = null, มีอะไรเปลี่ยน = snapshot ใหม่', async () => {
    const r = await roomWith(2);
    const first = await r.poll(0);
    expect(must(await r.service.poll(r.code, r.token(0), first.etag))).toBeNull();
    must(await r.service.join(r.code, { name: 'Cat' }));
    const next = must(await r.service.poll(r.code, r.token(0), first.etag));
    expect(next?.room.players).toHaveLength(3);
  });

  it('ไม่ได้ poll นานเกินกำหนด = ออฟไลน์ และ etag เปลี่ยนตาม', async () => {
    const r = await roomWith(2);
    const first = await r.poll(0);
    r.advance(OFFLINE_AFTER_MS - 1);
    expect(must(await r.service.poll(r.code, r.token(0), first.etag))).toBeNull();
    r.advance(1);
    const snap = must(await r.service.poll(r.code, r.token(0), first.etag));
    expect(snap?.room.players.map((p) => p.online)).toEqual([true, false]);
  });

  it('กลับเข้าด้วย token เดิม = ผู้เล่นคนเดิม ชื่อเดิม', async () => {
    const r = await started(4);
    const before = view(await r.poll(1));
    const again = must(await r.service.join(r.code, { name: 'ชื่อใหม่', token: r.token(1) }));
    expect(again).toEqual({ code: r.code, playerId: r.players[1]?.playerId, token: r.token(1) });
    const snap = await r.poll(1);
    expect(view(snap)).toEqual(before);
    expect(snap.room.players[1]?.name).toBe('Player 2');
  });

  it('host หายไปนานเกิน grace = โอน host ให้คนที่ยัง poll อยู่', async () => {
    const r = await roomWith(3);
    const step = 5_000;
    for (let t = 0; t <= HOST_GRACE_MS; t += step) {
      r.advance(step);
      await r.poll(1);
    }
    expect((await r.poll(1)).room.hostId).toBe(r.players[1]?.playerId);
  });
});

describe('เตะและออก', () => {
  it('host เตะได้ คนโดนเตะได้ error kicked และ token เดิมเข้าเป็นคนใหม่', async () => {
    const r = await roomWith(3);
    expect(await r.service.kick(r.code, r.token(1), { playerId: r.players[2]?.playerId })).toEqual({
      ok: false,
      error: 'not-host',
    });
    expect(await r.service.kick(r.code, r.token(0), { playerId: r.players[0]?.playerId })).toEqual({
      ok: false,
      error: 'cannot-kick-self',
    });
    must(await r.service.kick(r.code, r.token(0), { playerId: r.players[2]?.playerId }));
    expect(await r.service.poll(r.code, r.token(2), null)).toEqual({ ok: false, error: 'kicked' });
    const back = must(await r.service.join(r.code, { name: 'Player 3', token: r.token(2) }));
    expect(back.playerId).not.toBe(r.players[2]?.playerId);
  });

  it('เตะสายลับกลางเกม = ฝ่ายผู้เล่นชนะ', async () => {
    const r = await started(4);
    const snaps = await Promise.all(r.players.map((_, i) => r.poll(i)));
    const spyIdx = snaps.findIndex((s) => view(s).you.role === 'spy');
    if (spyIdx === 0) {
      must(await r.service.leave(r.code, r.token(0)));
      expect(view(await r.poll(1)).result).toMatchObject({ winner: 'voters', reason: 'spy-left' });
    } else {
      must(await r.service.kick(r.code, r.token(0), { playerId: r.players[spyIdx]?.playerId }));
      expect(view(await r.poll(0)).result).toMatchObject({ winner: 'voters', reason: 'spy-left' });
    }
  });

  it('host ออก = โอน host ให้คนถัดไป, คนสุดท้ายออก = ลบห้อง', async () => {
    const r = await roomWith(2);
    must(await r.service.leave(r.code, r.token(0)));
    expect((await r.poll(1)).room.hostId).toBe(r.players[1]?.playerId);
    must(await r.service.leave(r.code, r.token(1)));
    expect(r.store.size).toBe(0);
  });

  it('กลับล็อบบี้ได้เฉพาะ host', async () => {
    const r = await started(3);
    expect(await r.service.backToLobby(r.code, r.token(1))).toEqual({
      ok: false,
      error: 'not-host',
    });
    const snap = must(await r.service.backToLobby(r.code, r.token(0)));
    expect(snap.room.status).toBe('lobby');
    expect(snap.view).toBeNull();
  });
});

describe('MemoryRoomStore', () => {
  it('ห้องหมดอายุเมื่อไม่มีใครแตะนานเกิน TTL', async () => {
    const r = await roomWith(1);
    r.advance(ROOM_TTL_SECONDS * 1000);
    expect(await r.service.poll(r.code, r.token(0), null)).toEqual({
      ok: false,
      error: 'room-not-found',
    });
  });
});
