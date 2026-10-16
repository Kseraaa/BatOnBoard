import cors from '@fastify/cors';
import type { GameRegistry } from '@batonboard/engine';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@batonboard/protocol';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { ServerConfig } from './config';
import { createGameRegistry } from './games';
import { cryptoIds } from './ids';
import { RoomManager } from './rooms';
import type { IdSource, Scheduler, Transport } from './rooms';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface AppOptions {
  config: Pick<ServerConfig, 'webOrigins'>;
  registry?: GameRegistry;
  ids?: IdSource;
  now?: () => number;
}

function timerScheduler(): Scheduler & { clearAll(): void } {
  const timers = new Map<string, NodeJS.Timeout>();
  return {
    set(key, delayMs, fn) {
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn();
        }, delayMs),
      );
    },
    clear(key) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
    clearAll() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: opts.config.webOrigins });

  app.get('/health', async () => ({ ok: true }));

  const io: IO = new Server(app.server, {
    cors: { origin: opts.config.webOrigins },
    // payload ใหญ่ผิดปกติไม่ใช่ของ client เรา
    maxHttpBufferSize: 16 * 1024,
  });

  const transport: Transport = {
    send(conn, event, ...args) {
      io.to(conn).emit(event, ...args);
    },
    close(conn) {
      io.sockets.sockets.get(conn)?.disconnect(true);
    },
  };
  const scheduler = timerScheduler();
  const rooms = new RoomManager({
    registry: opts.registry ?? createGameRegistry(),
    transport,
    scheduler,
    ids: opts.ids ?? cryptoIds,
    now: opts.now ?? Date.now,
  });

  io.on('connection', (socket: ClientSocket) => {
    const conn = socket.id;
    /** ตอบผ่าน ack ถ้ามี ไม่งั้นส่ง event 'error' เมื่อไม่สำเร็จ */
    const reply = <T>(res: Ack<T>, ack: unknown) => {
      if (typeof ack === 'function') (ack as (r: Ack<T>) => void)(res);
      else if (!res.ok) socket.emit('error', { code: res.error });
    };

    socket.on('room:create', (payload, ack) => reply(rooms.createRoom(conn, payload), ack));
    socket.on('room:join', (payload, ack) => reply(rooms.joinRoom(conn, payload), ack));
    socket.on('room:leave', (ack) => reply(rooms.leave(conn), ack));
    socket.on('room:settings', (payload, ack) => reply(rooms.updateSettings(conn, payload), ack));
    socket.on('room:start', (ack) => reply(rooms.start(conn), ack));
    socket.on('room:lobby', (ack) => reply(rooms.backToLobby(conn), ack));
    socket.on('room:kick', (payload, ack) => reply(rooms.kick(conn, payload), ack));
    socket.on('game:action', (payload, ack) => reply(rooms.action(conn, payload), ack));
    socket.on('disconnect', () => rooms.disconnect(conn));
  });

  app.addHook('onClose', async () => {
    scheduler.clearAll();
    await io.close();
  });

  return { app, io, rooms };
}
