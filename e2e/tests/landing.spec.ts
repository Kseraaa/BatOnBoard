import { expect, test } from '@playwright/test';
import { closeAll, createRoom, t } from './helpers';
import type { Player } from './helpers';

let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

test('หน้าหลัก → เลือกเกม', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: t.landing.aboutTitle })).toBeVisible();
  // แยกเกมเป็น 2 หมวดตามวิธีสื่อสาร
  await expect(
    page.getByRole('heading', { name: t.landing.inAppTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: t.landing.togetherTitle, exact: true }),
  ).toBeVisible();

  await page.getByRole('link', { name: t.landing.play, exact: true }).click();
  await page.waitForURL(/\/games$/);
  await expect(page.getByRole('heading', { level: 1, name: t.home.pickGame })).toBeVisible();
  await expect(page.getByRole('button', { name: t.home.createRoom, exact: true })).toBeEnabled();

  // การ์ดเกมบนหน้าหลักพาไปหน้าเลือกเกมโดยเลือกเกมนั้นไว้แล้ว
  await page.getByRole('link', { name: `← ${t.home.back}`, exact: true }).click();
  await page.waitForURL(/\/$/);
  await page.locator('a[href^="/games?game="]').first().click();
  await page.waitForURL(/\/games\?game=/);
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);
});

test('หน้าหลัก: ใส่รหัสห้องแล้วไปหน้าห้อง', async ({ browser, page }) => {
  const { host, code } = await createRoom(browser, 'แอน');
  players = [host];

  await page.goto('/');
  const join = page.getByRole('button', { name: t.home.join, exact: true });
  await expect(join).toBeEnabled();
  await page.getByLabel(t.home.codePlaceholder).fill(code.toLowerCase());
  await join.click();
  await page.waitForURL(new RegExp(`/r/${code}$`));
  // หน้าห้องถามชื่อเล่นก่อนเข้า
  await expect(page.getByLabel(t.home.yourName)).toBeVisible();
});
