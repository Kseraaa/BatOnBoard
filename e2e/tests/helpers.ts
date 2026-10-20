import { devices, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { th as web } from '../../apps/web/src/messages/th';
import { spyfallMessages } from '../../packages/games/spyfall/client/messages';

/** ใช้ข้อความจากไฟล์ข้อความจริง — เปลี่ยนคำใน UI แล้วเทสต์ไม่พัง */
export const t = web;
export const m = spyfallMessages.th;

export interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
}

export type Role = { spy: true } | { spy: false; location: string; role: string };

/** ผู้เล่นแต่ละคน = browser context ใหม่ (localStorage แยก = ตัวตนแยก) */
async function newPlayer(browser: Browser, name: string): Promise<Player> {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: test.info().project.use.baseURL,
  });
  const page = await context.newPage();
  return { name, context, page };
}

export async function createRoom(
  browser: Browser,
  name: string,
  game = 'spyfall',
): Promise<{ host: Player; code: string }> {
  const host = await newPlayer(browser, name);
  const { page } = host;
  await page.goto(`/play/${game}`);
  const create = page.getByRole('button', { name: t.home.createRoom, exact: true });
  // รอ hydrate (ปุ่มเปิดใช้งาน) ก่อนพิมพ์ ไม่งั้น React อาจล้างค่าที่พิมพ์ไว้
  await expect(create).toBeEnabled();
  await page.getByPlaceholder(t.home.namePlaceholder).fill(name);
  await create.click();
  await page.waitForURL(/\/r\/[A-Z2-9]{6}$/);
  const code = page.url().split('/').pop() as string;
  await expect(page.getByTestId('room-code')).toHaveText(code);
  return { host, code };
}

/** เข้าห้องผ่านลิงก์ /r/<code> แบบคนที่เปิดลิงก์ครั้งแรก */
export async function joinRoom(browser: Browser, code: string, name: string): Promise<Player> {
  const player = await newPlayer(browser, name);
  const { page } = player;
  await page.goto(`/r/${code}`);
  await page.getByLabel(t.home.yourName).fill(name);
  await page.getByRole('button', { name: t.home.join, exact: true }).click();
  await expect(page.getByTestId('room-code')).toHaveText(code);
  return player;
}

export const NAMES = ['แอน', 'บีม', 'ซีซี', 'ดิว'];

/** host สร้างห้อง อีก 3 คนเข้าผ่านลิงก์ แล้ว host เริ่มเกม */
export async function startGame(browser: Browser, names = NAMES) {
  const [hostName, ...others] = names as [string, ...string[]];
  const { host, code } = await createRoom(browser, hostName);
  const players = [host];
  for (const name of others) players.push(await joinRoom(browser, code, name));

  await expect(host.page.getByText(t.room.players(names.length, 8))).toBeVisible();
  for (const p of players) {
    for (const name of names) await expect(p.page.getByText(name, { exact: true })).toBeVisible();
  }
  await host.page.getByRole('button', { name: t.room.start, exact: true }).click();
  for (const p of players) await expect(p.page.locator('[data-phase="questioning"]')).toBeVisible();
  return { code, players };
}

/** เปิดการ์ดค้างไว้แล้วอ่านบทบาท */
export async function readRole(page: Page): Promise<Role> {
  const show = page.getByRole('button', { name: m.card.show, exact: true });
  if (await show.isVisible()) await show.click();
  const spyCard = page.getByTestId('role-spy');
  const agentCard = page.getByTestId('role-agent');
  await expect(spyCard.or(agentCard)).toBeVisible();
  if (await spyCard.isVisible()) return { spy: true };
  return {
    spy: false,
    location: (await page.getByTestId('role-location').textContent()) ?? '',
    role: (await page.getByTestId('role-name').textContent()) ?? '',
  };
}

export async function rolesOf(players: Player[]) {
  const roles = [];
  for (const p of players) roles.push({ player: p, role: await readRole(p.page) });
  return roles;
}

/** กดกล่าวหา target จากรายชื่อผู้เล่น แล้วยืนยัน */
export async function accuse(page: Page, target: string) {
  await page
    .getByRole('listitem')
    .filter({ hasText: target })
    .getByRole('button', { name: m.accuse, exact: true })
    .click();
  await expect(page.getByText(m.confirmAccuse(target))).toBeVisible();
  await page.getByRole('button', { name: m.confirm, exact: true }).click();
}

export async function closeAll(players: Player[]) {
  await Promise.all(players.map((p) => p.context.close()));
}
