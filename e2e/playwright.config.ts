import { defineConfig, devices } from '@playwright/test';

/**
 * E2E หลายผู้เล่น: แต่ละผู้เล่นเป็น browser context แยก (localStorage แยก = ตัวตนแยก)
 * ใช้พอร์ต 3100 และ distDir แยกจาก dev จะได้รันพร้อม `pnpm dev` ได้
 */
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
  webServer: {
    // เว็บอย่างเดียว — API ของห้องอยู่ใน Next.js (store ในหน่วยความจำของ next dev)
    command: `pnpm --filter @batonboard/web exec next dev -p ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      NEXT_TELEMETRY_DISABLED: '1',
      // poll ถี่ขึ้นให้เทสต์เร็ว
      NEXT_PUBLIC_POLL_MS: '300',
      // ไม่ใช้ Redis แม้ในเครื่องจะตั้ง env ไว้
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
    },
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
