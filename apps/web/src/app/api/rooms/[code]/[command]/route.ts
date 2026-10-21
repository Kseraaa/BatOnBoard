import { RoomError } from '@batonboard/protocol';
import { bearerToken, handle, parseCode, readJson, reply } from '@/server/http';
import { getRoomService } from '@/server/service';

export const dynamic = 'force-dynamic';

/** คำสั่งของห้อง: POST /api/rooms/<code>/<command> → Ack (ดู `api` ใน @batonboard/protocol) */
export function POST(req: Request, ctx: { params: Promise<{ code: string; command: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const code = parseCode(params.code);
    if (!code) return reply({ ok: false, error: RoomError.RoomNotFound });
    const rooms = getRoomService();
    const token = bearerToken(req);
    const body = await readJson(req);

    switch (params.command) {
      case 'join':
        return reply(await rooms.join(code, body));
      case 'leave':
        return reply(await rooms.leave(code, token));
      case 'settings':
        return reply(await rooms.settings(code, token, body));
      case 'start':
        return reply(await rooms.start(code, token));
      case 'lobby':
        return reply(await rooms.backToLobby(code, token));
      case 'kick':
        return reply(await rooms.kick(code, token, body));
      case 'bot':
        return reply(await rooms.addBot(code, token, body));
      case 'action':
        return reply(await rooms.action(code, token, body));
      default:
        return Response.json({ ok: false, error: 'not-found' }, { status: 404 });
    }
  });
}
