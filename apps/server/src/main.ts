import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = await buildApp({ config });
await app.listen({ port: config.port, host: config.host });
console.log(`BatOnBoard game server on :${config.port} (web: ${config.webOrigins.join(', ')})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
