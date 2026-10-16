import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
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
