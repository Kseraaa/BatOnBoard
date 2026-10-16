export interface ServerConfig {
  port: number;
  host: string;
  /** โดเมนเว็บที่อนุญาต (CORS) */
  webOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`invalid PORT: ${env.PORT}`);
  const webOrigins = (env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { port, host: env.HOST ?? '0.0.0.0', webOrigins };
}
