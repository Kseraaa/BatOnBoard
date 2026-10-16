import { RoomError } from '@batonboard/protocol';
import { bearerToken, handle, parseCode, reply } from '@/server/http';
import { getRoomService } from '@/server/service';

export const dynamic = 'force-dynamic';

/** poll: GET ?etag=… → Ack<RoomSnapshot | null> (null = ไม่มีอะไรเปลี่ยน) */
export function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    if (!code) return reply({ ok: false, error: RoomError.RoomNotFound });
    const etag = new URL(req.url).searchParams.get('etag');
    return reply(await getRoomService().poll(code, bearerToken(req), etag));
  });
}
