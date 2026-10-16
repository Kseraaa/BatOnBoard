import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ทุกโฟลเดอร์ที่ตรง glob เป็น project แยกของ Vitest
    projects: ['packages/!(games)', 'packages/games/*', 'apps/*'],
    passWithNoTests: true,
  },
});
