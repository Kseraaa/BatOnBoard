// รวม server + package ใน monorepo + dependency ทั้งหมดเป็นไฟล์เดียว (dist/main.js)
// image ตอน deploy จึงไม่ต้องมี node_modules หรือ tsx
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  minify: false,
  // optional native addon ของ ws — ไม่มีก็ทำงานได้
  external: ['bufferutil', 'utf-8-validate'],
  // dependency แบบ CommonJS ใน bundle ESM ต้องมี require
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
