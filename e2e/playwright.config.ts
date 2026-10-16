import { defineConfig, devices } from '@playwright/test';

/**
 * E2E หลายผู้เล่น: แต่ละผู้เล่นเป็น browser context แยก (localStorage แยก = ตัวตนแยก)
 * ใช้พอร์ตแยกจาก dev (server 4100, web 3100) จะได้รันพร้อม `pnpm dev` ได้
 */
const SERVER_PORT = 4100;
const WEB_PORT = 3100;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // ทุกเทสต์สร้างห้องของตัวเอง แต่ dev server compile หน้าแรกช้า รันทีละเทสต์จะนิ่งกว่า
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        // ในเครื่อง dev ใช้ Chrome ที่ติดตั้งอยู่ ใน CI ใช้ Chromium ของ Playwright
        ...(CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @batonboard/server start',
      url: `http://localhost:${SERVER_PORT}/health`,
      env: { PORT: String(SERVER_PORT), WEB_ORIGIN: `http://localhost:${WEB_PORT}` },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @batonboard/web exec next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: {
        NEXT_PUBLIC_SERVER_URL: `http://localhost:${SERVER_PORT}`,
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
