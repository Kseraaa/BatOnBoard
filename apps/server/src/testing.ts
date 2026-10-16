import { ROOM_CODE_ALPHABET } from '@batonboard/protocol';
import type { ServerToClientEvents } from '@batonboard/protocol';
import { createGameRegistry } from './games';
import { RoomManager } from './rooms';
import type { IdSource, Scheduler, Transport } from './rooms';

type EventName = keyof ServerToClientEvents;
type EventData<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

export interface Sent {
  event: EventName;
  data: unknown;
}

/** transport ปลอมที่จดทุกข้อความที่ส่งถึงแต่ละ connection */
export class FakeTransport implements Transport {
  readonly inbox = new Map<string, Sent[]>();
  readonly closed = new Set<string>();

  send<E extends EventName>(conn: string, event: E, ...args: Parameters<ServerToClientEvents[E]>) {
    const list = this.inbox.get(conn) ?? [];
    list.push({ event, data: args[0] });
    this.inbox.set(conn, list);
  }

  close(conn: string) {
    this.closed.add(conn);
  }

  all<E extends EventName>(conn: string, event: E): EventData<E>[] {
    return (this.inbox.get(conn) ?? [])
      .filter((m) => m.event === event)
      .map((m) => m.data as EventData<E>);
  }

  last<E extends EventName>(conn: string, event: E): EventData<E> | undefined {
    return this.all(conn, event).at(-1);
  }

  clear() {
    this.inbox.clear();
  }
}

/** นาฬิกา + scheduler ปลอม เดินเวลาเองด้วย advance() */
export class FakeClock implements Scheduler {
  time = 1_700_000_000_000;
  private readonly timers = new Map<string, { at: number; fn: () => void }>();

  now = () => this.time;

  set(key: string, delayMs: number, fn: () => void) {
    this.timers.set(key, { at: this.time + delayMs, fn });
  }

  clear(key: string) {
    this.timers.delete(key);
  }

  has(key: string) {
    return this.timers.has(key);
  }

  dueAt(key: string) {
    return this.timers.get(key)?.at;
  }

  /** เดินเวลาไปทีละ timer ตามลำดับเวลา */
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [key, timer] = next;
      this.timers.delete(key);
      this.time = Math.max(this.time, timer.at);
      timer.fn();
    }
    this.time = end;
  }
}

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
  };
}

export function createTestManager() {
  const transport = new FakeTransport();
  const clock = new FakeClock();
  const manager = new RoomManager({
    registry: createGameRegistry(),
    transport,
    scheduler: clock,
    ids: sequentialIds(),
    now: clock.now,
  });
  return { manager, transport, clock };
}
