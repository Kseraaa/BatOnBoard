import { createRegistry } from '@batonboard/engine';
import { ROOM_CODE_ALPHABET } from '@batonboard/protocol';
import type { JoinedMessage, RoomSnapshot } from '@batonboard/protocol';
import { spyfall } from '@batonboard/spyfall';
import { ROOM_TTL_SECONDS } from './room';
import type { IdSource } from './room';
import { RoomService } from './service';
import { MemoryRoomStore } from './store';

export function sequentialIds(): IdSource {
  let room = 0;
  let player = 0;
  let token = 0;
  const a = ROOM_CODE_ALPHABET;
  return {
    roomCode: () => {
      const n = room++;
      return `TEST${a[Math.floor(n / a.length) % a.length]}${a[n % a.length]}`;
    },
    playerId: () => `p${++player}`,
    token: () => `secret-token-${++token}`,
    seed: () => 12345,
    hash: (t) => `hash(${t})`,
  };
}

export function createTestService() {
  const clock = { time: 1_700_000_000_000 };
  const now = () => clock.time;
  const store = new MemoryRoomStore(ROOM_TTL_SECONDS * 1000, now);
  const registry = createRegistry();
  registry.register(spyfall);
  const service = new RoomService({ store, registry, ids: sequentialIds(), now });
  const advance = (ms: number) => {
    clock.time += ms;
  };
  return { service, store, clock, advance };
}

export function must<T>(res: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

/** สร้างห้องโดยคนแรก แล้วให้ที่เหลือเข้าห้อง */
export async function roomWith(n: number) {
  const setup = createTestService();
  const { service } = setup;
  const players: JoinedMessage[] = [must(await service.create({ name: 'Ann', gameId: 'spyfall' }))];
  const code = (players[0] as JoinedMessage).code;
  for (let i = 2; i <= n; i++) {
    players.push(must(await service.join(code, { name: `Player ${i}` })));
  }
  /** poll ล่าสุดของผู้เล่นคนที่ i (ไม่สน etag) */
  const poll = async (i: number) =>
    must(await service.poll(code, (players[i] as JoinedMessage).token, null)) as RoomSnapshot;
  return {
    ...setup,
    code,
    players,
    poll,
    token: (i: number) => (players[i] as JoinedMessage).token,
  };
}
