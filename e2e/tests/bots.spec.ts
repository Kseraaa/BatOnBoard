import { expect, test } from '@playwright/test';
import { bossMessages } from '../../packages/games/boss/client/messages';
import { closeAll, createRoom, t } from './helpers';
import type { Player } from './helpers';

const bm = bossMessages.th;
let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

test('host เปิด ?bots=1 เพิ่มบอท 2 ตัว → เริ่มเกม → บอทเล่นต่อเองหลังจบเทิร์นของ host', async ({
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

  await page.getByRole('button', { name: t.room.start, exact: true }).click();
  await expect(page.locator('[data-phase]')).toBeVisible();

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
