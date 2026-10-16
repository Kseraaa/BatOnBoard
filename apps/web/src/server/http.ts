import { roomCodeSchema, RoomError } from '@batonboard/protocol';
import type { Ack } from '@batonboard/protocol';

/** payload ใหญ่ผิดปกติไม่ใช่ของ client เรา */
const MAX_BODY_BYTES = 16 * 1024;

export function reply<T>(res: Ack<T>): Response {
  return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  const match = header?.match(/^Bearer (.+)$/);
  return match?.[1] ?? null;
}

export function parseCode(raw: string): string | null {
  const parsed = roomCodeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** อ่าน JSON body — คืน undefined ถ้าไม่มีหรือเสีย ปล่อยให้ schema ตัดสิน */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new PayloadTooLarge();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export class PayloadTooLarge extends Error {}

/** ห่อ handler: แปลง error ที่คาดไว้เป็น Ack */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PayloadTooLarge) {
      return reply({ ok: false, error: RoomError.InvalidPayload });
    }
    throw err;
  }
}
