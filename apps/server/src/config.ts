export type Origin = string | RegExp;

export interface ServerConfig {
  port: number;
  host: string;
  /** โดเมนเว็บที่อนุญาต (CORS) */
  webOrigins: Origin[];
}

/**
 * แปลง origin จาก env: ตัว `*` แทนชื่อ subdomain หนึ่งช่วง ([a-z0-9-]+)
 * เช่น https://batonboard-*-myteam.vercel.app สำหรับ preview deploy ของ Vercel
 */
export function parseOrigin(raw: string): Origin {
  const origin = raw.trim().replace(/\/+$/, '');
  if (!origin.includes('*')) return origin;
  const pattern = origin
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('[a-z0-9-]+');
  return new RegExp(`^${pattern}$`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`invalid PORT: ${env.PORT}`);
  const webOrigins = (env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseOrigin);
  return { port, host: env.HOST ?? '0.0.0.0', webOrigins };
}
