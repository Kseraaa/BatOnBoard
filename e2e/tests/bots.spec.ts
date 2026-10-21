import { expect, test } from '@playwright/test';
import { cityV1 } from '../../packages/games/boss/data';
import { bossMessages } from '../../packages/games/boss/client/messages';
import { closeAll, createRoom, t } from './helpers';
import type { Player } from './helpers';

const bm = bossMessages.th;
let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

test('host เปิด ?bots=1 เพิ่มบอท 2 ตัว ตั้งชื่อตระกูลเอง → เริ่มเกม → บอทเล่นต่อเอง', async ({
  browser,
}) => {
  const { host, code } = await createRoom(browser, 'แอน', 'boss');
  players = [host];
  const page = host.page;
  const addBot = page.getByRole('button', { name: `🤖 ${t.room.addBot}`, exact: true });

  // ผู้เล่นทั่วไปไม่เห็นปุ่ม
  await expect(page.getByTestId('room-code')).toHaveText(code);
  await expect(addBot).toHaveCount(0);

  await page.goto(`/r/${code}?bots=1`);
  await addBot.click();
  await expect(page.getByText(t.room.botName(1), { exact: true })).toBeVisible();
  await addBot.click();
  await expect(page.getByText(t.room.botName(2), { exact: true })).toBeVisible();
  await expect(page.getByText(t.room.players(3, 6))).toBeVisible();

  // ตั้งชื่อตระกูลแรกเอง (ส่งตอนออกจากช่อง)
  const family = cityV1.families[0];
  if (!family) throw new Error('no family');
  const input = page.getByLabel(bm.settings.familyNameLabel(family.name.th));
  await input.fill('แก๊งแอน');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: bm.settings.resetNames })).toBeVisible();

  await page.getByRole('button', { name: t.room.start, exact: true }).click();
  await expect(page.locator('[data-phase]')).toBeVisible();

  // แตะช่องบนกระดาน 2D → popup บอกตระกูลที่ใช้และเงินรวม (ช่องไหนก็ได้ ไม่ต้องรอตัวเงิน)
  const to2d = page.getByRole('button', { name: bm.board.view2d, exact: true });
  if (await to2d.isVisible()) await to2d.click();
  const space = cityV1.spaces.findIndex((s) =>
    [...s.required, ...(s.optional?.from ?? [])].includes(family.id),
  );
  await page.getByTestId(`space-${space}`).click();
  const detail = page.getByTestId('space-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('space-total')).toHaveText(/^\d[\d,]*k$/);
  await expect(detail.getByText('แก๊งแอน', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  const roll = page.getByRole('button', { name: bm.turn.roll, exact: true });
  const draw = page.getByRole('button', { name: bm.turn.draw, exact: true });
  // ถ้าเป็นตาของ host ให้ทอยแล้วจั่ว เทิร์นจะไปที่บอท
  if (await roll.isVisible()) {
    await roll.click();
    await draw.click();
    await expect(roll).toBeHidden();
  }
  // บอทเล่นต่อเอง: เทิร์นวนกลับมาที่ host หรือมีบอทประกาศดีล
  await expect(roll.or(page.getByTestId('deal-panel'))).toBeVisible({ timeout: 30_000 });
});
