import type { BossView } from '@batonboard/boss/rules';
import { describe, expect, it } from 'vitest';
import { BOT_DELAY_MS, OFFLINE_AFTER_MS } from './room';
import { createTestService, must } from './testing';

async function bossRoom() {
  const setup = createTestService();
  const host = must(await setup.service.create({ name: 'Ann', gameId: 'boss' }));
  const poll = async () => {
    const snap = must(await setup.service.poll(host.code, host.token, null));
    if (!snap) throw new Error('no snapshot');
    return snap;
  };
  const addBot = (name: string) => setup.service.addBot(host.code, host.token, { name });
  return { ...setup, host, code: host.code, poll, addBot };
}

describe('บอททดสอบ', () => {
  it('host เพิ่มบอทได้ บอทออนไลน์ตลอด และเกมบอกว่าเพิ่มบอทได้', async () => {
    const r = await bossRoom();
    must(await r.addBot('บอท 1'));
    r.advance(OFFLINE_AFTER_MS * 2);
    const snap = await r.poll();
    expect(snap.room.botsAllowed).toBe(true);
    expect(snap.room.players).toMatchObject([
      { name: 'Ann', bot: false },
      { name: 'บอท 1', bot: true, online: true },
    ]);
  });

  it('เกมที่ไม่มีบอท คนที่ไม่ใช่ host ชื่อซ้ำ และนอกล็อบบี้ ถูกปฏิเสธ', async () => {
    const r = createTestService();
    const spy = must(await r.service.create({ name: 'Ann', gameId: 'spyfall' }));
    expect(await r.service.addBot(spy.code, spy.token, { name: 'บอท' })).toEqual({
      ok: false,
      error: 'bots-unsupported',
    });
    expect(must(await r.service.poll(spy.code, spy.token, null))?.room.botsAllowed).toBe(false);

    const b = await bossRoom();
    const guest = must(await b.service.join(b.code, { name: 'Bob' }));
    expect(await b.service.addBot(b.code, guest.token, { name: 'บอท' })).toEqual({
      ok: false,
      error: 'not-host',
    });
    expect(await b.addBot('bob')).toEqual({ ok: false, error: 'name-taken' });
    must(await b.addBot('บอท 1'));
    must(await b.service.start(b.code, b.host.token));
    expect(await b.addBot('บอท 2')).toEqual({ ok: false, error: 'not-in-lobby' });
  });

  it('บอทเล่นเองเมื่อห้องนิ่งครบ BOT_DELAY_MS ทีละ 1 action', async () => {
    const r = await bossRoom();
    must(await r.addBot('บอท 1'));
    must(await r.addBot('บอท 2'));
    must(await r.service.start(r.code, r.host.token));
    const bots = (await r.poll()).room.players.filter((p) => p.bot).map((p) => p.id);

    // เล่นจนถึงตาบอท (host ทอยแล้วจั่วถ้าเป็นตาตัวเอง)
    for (let i = 0; i < 5; i++) {
      const v = (await r.poll()).view as BossView;
      if (bots.includes(v.current)) break;
      if (v.phase === 'turn') must(await r.service.action(r.code, r.host.token, { type: 'ROLL' }));
      else must(await r.service.action(r.code, r.host.token, { type: 'DRAW' }));
    }
    const before = (await r.poll()).view as BossView;
    expect(bots).toContain(before.current);
    expect(before.phase).toBe('turn');

    r.advance(BOT_DELAY_MS - 1);
    expect(((await r.poll()).view as BossView).phase).toBe('turn');
    r.advance(1);
    const after = (await r.poll()).view as BossView;
    expect(after.phase).toBe('moved');
    expect(after.lastRoll?.by).toBe(before.current);
  });

  it('เตะบอทได้ host ไม่ตกไปที่บอท และเหลือแต่บอท = ลบห้อง', async () => {
    const r = await bossRoom();
    must(await r.addBot('บอท 1'));
    must(await r.addBot('บอท 2'));
    const bot1 = (await r.poll()).room.players[1]?.id;
    must(await r.service.kick(r.code, r.host.token, { playerId: bot1 }));
    expect((await r.poll()).room.players.map((p) => p.name)).toEqual(['Ann', 'บอท 2']);

    const guest = must(await r.service.join(r.code, { name: 'Bob' }));
    // host หายไปนาน → โอนให้คนจริงที่ออนไลน์ ไม่ใช่บอทที่อยู่ก่อนในลำดับ
    r.advance(20_000);
    must(await r.service.poll(r.code, guest.token, null));
    r.advance(11_000);
    const snap = must(await r.service.poll(r.code, guest.token, null));
    expect(snap?.room.hostId).toBe(guest.playerId);

    must(await r.service.leave(r.code, guest.token));
    must(await r.service.leave(r.code, r.host.token));
    expect(r.store.size).toBe(0);
  });
});
