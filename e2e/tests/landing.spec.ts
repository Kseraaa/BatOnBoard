import { expect, test } from '@playwright/test';
import { closeAll, createRoom, t } from './helpers';
import type { Player } from './helpers';

let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

test('หน้าหลัก → เลือกเกม → หน้าสร้างห้องของเกมนั้น', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: t.landing.aboutTitle })).toBeVisible();
  // แยกเกมเป็น 2 หมวดตามวิธีสื่อสาร
  await expect(
    page.getByRole('heading', { name: t.landing.inAppTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: t.landing.togetherTitle, exact: true }),
  ).toBeVisible();

  // ปุ่ม "เล่นเลย!" เลื่อนลงไปที่ตารางเกมบนหน้าเดิม
  await page.getByRole('link', { name: t.landing.play, exact: true }).click();
  await page.waitForURL(/\/#games$/);

  // เลือกเกมที่หน้าหลักแล้วไปหน้าสร้างห้องของเกมนั้นเลย ไม่มีรายการเกมให้เลือกซ้ำ
  const tile = page.locator('#games a[href^="/play/"]').first();
  const href = (await tile.getAttribute('href')) ?? '';
  await tile.click();
  await page.waitForURL(new RegExp(`${href}$`));
  await expect(page.locator('a[href^="/play/"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.home.createRoom, exact: true })).toBeEnabled();

  await page.getByRole('link', { name: `← ${t.home.back}`, exact: true }).click();
  await page.waitForURL(/\/#games$/);
});

test('หน้าเกม: ใส่รหัสห้องของเพื่อน → เข้าห้องด้วยชื่อที่ใส่ไว้ ไม่ถามซ้ำ', async ({
  browser,
  page,
}) => {
  const { host, code } = await createRoom(browser, 'แอน', 'boss');
  players = [host];

  await page.goto('/play/boss');
  const join = page.getByRole('button', { name: t.home.join, exact: true });
  await expect(join).toBeEnabled();
  // รหัสสั้นไป → เตือน ไม่เปลี่ยนหน้า
  await page.getByLabel(t.home.joinTitle).fill('ABC');
  await join.click();
  await expect(page.getByText(t.home.codeInvalid)).toBeVisible();

  await page.getByLabel(t.home.yourName).fill('บีม');
  await page.getByLabel(t.home.joinTitle).fill(code.toLowerCase());
  await join.click();
  await page.waitForURL(new RegExp(`/r/${code}$`));
  await expect(page.getByTestId('room-code')).toHaveText(code);
  await expect(host.page.getByText('บีม', { exact: true })).toBeVisible();
});

test('ลิงก์เก่า /games พาไปที่ใหม่', async ({ page }) => {
  await page.goto('/games?game=boss');
  await page.waitForURL(/\/play\/boss$/);
  await page.goto('/games');
  await page.waitForURL(/\/#games$/);
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
