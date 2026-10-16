import type { Room } from './room';

/**
 * ที่เก็บห้อง — production ใช้ Redis (Upstash), dev/เทสต์ใช้หน่วยความจำ
 * เขียนแบบ compare-and-set ด้วย rev กันสองคำสั่งเขียนทับกัน
 */
export interface RoomStore {
  get(code: string): Promise<Room | null>;
  /** สร้างห้องใหม่ — false ถ้ารหัสนี้มีอยู่แล้ว */
  create(room: Room): Promise<boolean>;
  /**
   * เขียนห้อง (room.rev ต้องเป็น expectedRev + 1) หรือลบ (room = null)
   * สำเร็จเฉพาะเมื่อ rev ใน store ยังเป็น expectedRev — false = มีคนเขียนก่อน ให้ลองใหม่
   */
  put(code: string, room: Room | null, expectedRev: number): Promise<boolean>;
}

/** store ในหน่วยความจำ — clone ผ่าน JSON ทุกครั้งเหมือนเก็บลง Redis จริง */
export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, { json: string; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(code: string): Promise<Room | null> {
    return this.read(code);
  }

  async create(room: Room): Promise<boolean> {
    if (this.read(room.code)) return false;
    this.write(room);
    return true;
  }

  async put(code: string, room: Room | null, expectedRev: number): Promise<boolean> {
    // ตรวจและเขียนใน tick เดียวกัน (ไม่มี await คั่น) ให้เป็น compare-and-set จริง
    const current = this.read(code);
    if (!current || current.rev !== expectedRev) return false;
    if (room === null) this.rooms.delete(code);
    else this.write(room);
    return true;
  }

  get size(): number {
    return this.rooms.size;
  }

  private read(code: string): Room | null {
    const entry = this.rooms.get(code);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.rooms.delete(code);
      return null;
    }
    return JSON.parse(entry.json) as Room;
  }

  private write(room: Room) {
    this.rooms.set(room.code, { json: JSON.stringify(room), expiresAt: this.now() + this.ttlMs });
  }
}
