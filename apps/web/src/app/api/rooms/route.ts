import { getRoomService } from '@/server/service';
import { handle, readJson, reply } from '@/server/http';

export const dynamic = 'force-dynamic';

/** สร้างห้อง: CreateRoomPayload → Ack<JoinedMessage> */
export function POST(req: Request) {
  return handle(async () => reply(await getRoomService().create(await readJson(req))));
}
