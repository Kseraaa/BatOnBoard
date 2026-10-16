import type { Room, RoomStore } from '@batonboard/rooms';
import { Redis } from '@upstash/redis';

/**
 * เก็บห้องใน Upstash Redis เป็น hash: { rev, data(JSON) }
 * compare-and-set ด้วย Lua script จึงไม่มีการเขียนทับกันแม้ request มาพร้อมกันหลายเครื่อง
 */
const PUT_SCRIPT = `
local rev = redis.call('HGET', KEYS[1], 'rev')
if not rev or tonumber(rev) ~= tonumber(ARGV[1]) then return 0 end
if ARGV[2] == '' then
  redis.call('DEL', KEYS[1])
else
  redis.call('HSET', KEYS[1], 'rev', ARGV[3], 'data', ARGV[2])
  redis.call('EXPIRE', KEYS[1], ARGV[4])
end
return 1
`;

const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'rev', ARGV[1], 'data', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;

export class UpstashRoomStore implements RoomStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  static fromEnv(ttlSeconds: number): UpstashRoomStore | null {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    // เก็บ/อ่าน string ดิบ ไม่ให้ client แปลง JSON เอง
    return new UpstashRoomStore(
      new Redis({ url, token, automaticDeserialization: false }),
      ttlSeconds,
    );
  }

  private key(code: string) {
    return `batonboard:room:${code}`;
  }

  async get(code: string): Promise<Room | null> {
    const data = await this.redis.hget<string>(this.key(code), 'data');
    return data ? (JSON.parse(data) as Room) : null;
  }

  async create(room: Room): Promise<boolean> {
    const res = await this.redis.eval(
      CREATE_SCRIPT,
      [this.key(room.code)],
      [String(room.rev), JSON.stringify(room), String(this.ttlSeconds)],
    );
    return Number(res) === 1;
  }

  async put(code: string, room: Room | null, expectedRev: number): Promise<boolean> {
    const res = await this.redis.eval(
      PUT_SCRIPT,
      [this.key(code)],
      [
        String(expectedRev),
        room === null ? '' : JSON.stringify(room),
        String(room?.rev ?? 0),
        String(this.ttlSeconds),
      ],
    );
    return Number(res) === 1;
  }
}
