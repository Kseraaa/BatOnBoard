import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { closeAll, createRoom, joinRoom, m, rolesOf, t } from './helpers';
import type { Player } from './helpers';

let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

const s = m.settings;

async function addLocation(page: Page, name: string, roles: string[]) {
  await page.getByRole('button', { name: s.add, exact: true }).click();
  await page.getByLabel(s.name).fill(name);
  await page.getByLabel(s.roles).fill(roles.join('\n'));
  await page.getByRole('button', { name: s.save, exact: true }).click();
  await expect(page.getByTestId('custom-locations')).toContainText(name);
}

test('host สร้างสถานที่เอง ปิดชุดมาตรฐานทั้งหมด → ทุกคนเล่นด้วยสถานที่ที่สร้างเอง', async ({
  browser,
}) => {
  const { host, code } = await createRoom(browser, 'แอน');
  players = [host];
  for (const name of ['บีม', 'ซีซี']) players.push(await joinRoom(browser, code, name));
  const page = host.page;

  await addLocation(page, 'คาเฟ่แมว', ['บาริสต้า', 'ทาสแมว']);
  // ชื่อปุ่มมีจำนวนที่เปิดอยู่ต่อท้ายด้วย จึงไม่ใช้ exact
  await page.getByRole('button', { name: s.showBuiltin }).click();
  // เหลือสถานที่เดียวไม่ได้ — ต้องมีอย่างน้อย 2
  await page.getByRole('button', { name: s.selectNone, exact: true }).click();
  await expect(page.getByText(s.errors.minDeck)).toBeVisible();

  await addLocation(page, 'ออฟฟิศ', ['หัวหน้า', 'เด็กฝึกงาน']);
  await page.getByRole('button', { name: s.selectNone, exact: true }).click();
  await expect(page.getByTestId('deck-count')).toHaveText(s.deckCount(2));
  // คนอื่นเห็นตั้งค่าเดียวกัน (อ่านอย่างเดียว)
  const guest = players[1] as Player;
  await expect(guest.page.getByTestId('custom-locations')).toContainText('ออฟฟิศ');

  await page.getByRole('button', { name: t.room.start, exact: true }).click();
  for (const p of players) await expect(p.page.locator('[data-phase="questioning"]')).toBeVisible();

  const roles = await rolesOf(players);
  const agents = roles.flatMap((r) => (r.role.spy ? [] : [r.role]));
  expect(agents).toHaveLength(2);
  const location = agents[0]?.location;
  expect(['คาเฟ่แมว', 'ออฟฟิศ']).toContain(location);
  for (const a of agents) expect(a.location).toBe(location);

  // รายชื่อสถานที่อ้างอิงมีแค่ที่สร้างเอง
  const list = page.locator('section').filter({ hasText: m.locations.title }).getByRole('listitem');
  await expect(list).toHaveText(['คาเฟ่แมว', 'ออฟฟิศ']);
});

test('นำเข้าชุดสถานที่จากข้อความ → ห้องใหม่กด "ใช้ชุดล่าสุด" ได้ทันที', async ({ browser }) => {
  const { host } = await createRoom(browser, 'แอน');
  players = [host];
  const page = host.page;

  await page.getByRole('button', { name: s.shareTitle, exact: true }).click();
  await page.getByRole('button', { name: s.importOpen, exact: true }).click();
  await page
    .getByLabel(s.importLabel)
    .fill(['ไม่ใช้: ตลาดน้ำ', '# คาเฟ่แมว', '- บาริสต้า', '# ออฟฟิศ', '- หัวหน้า'].join('\n'));
  await page.getByRole('button', { name: s.importApply, exact: true }).click();
  await expect(page.getByText(s.importDone)).toBeVisible();
  await expect(page.getByTestId('custom-locations')).toContainText('ออฟฟิศ');

  // ปุ่มคัดลอกเขียน clipboard จริง และข้อความที่ได้นำเข้ากลับได้
  await host.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: s.copy, exact: true }).click();
  await expect(page.getByRole('button', { name: s.copied, exact: true })).toBeVisible();
  // clipboard ของ Windows แปลงบรรทัดใหม่เป็น \r\n (ตอนนำเข้ารับได้ทั้งสองแบบ)
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(copied).toContain('ไม่ใช้: ตลาดน้ำ');
  expect(copied).toContain('# ออฟฟิศ\n- หัวหน้า');

  // ห้องใหม่ในเบราว์เซอร์เดิม: ชุดล่าสุดจำไว้ใน localStorage
  await page.goto('/games');
  const create = page.getByRole('button', { name: t.home.createRoom, exact: true });
  await expect(create).toBeEnabled();
  await create.click();
  await page.waitForURL(/\/r\/[A-Z2-9]{6}$/);
  await page.getByRole('button', { name: s.useLast, exact: true }).click();
  await expect(page.getByTestId('custom-locations')).toContainText('คาเฟ่แมว');
  await expect(page.getByRole('button', { name: s.useLast, exact: true })).toHaveCount(0);
});
