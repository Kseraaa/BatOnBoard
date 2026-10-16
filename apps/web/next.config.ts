import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // e2e ใช้โฟลเดอร์แยก จะได้รัน next dev สองตัวพร้อมกันได้
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // package ใน monorepo export ซอร์ส TypeScript ตรง ๆ
  transpilePackages: [
    '@batonboard/engine',
    '@batonboard/protocol',
    '@batonboard/spyfall',
    '@batonboard/ui',
  ],
  turbopack: {
    root: path.join(import.meta.dirname, '../..'),
  },
};

export default config;
