import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { bossMessages } from '../../packages/games/boss/client/messages';
import { closeAll, createRoom, joinRoom, t } from './helpers';
import type { Player } from './helpers';

const bm = bossMessages.th;
const NAMES = ['แอน', 'บีม', 'ซีซี'];

let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

/** 3 คน: ทุกตระกูลมีเจ้าของ (คนละ 2) แผนเริ่มต้นของบอสจึงครบเสมอ */
async function startBoss(browser: Browser) {
  const [hostName, ...others] = NAMES as [string, ...string[]];
  const { host, code } = await createRoom(browser, hostName, 'boss');
  players = [host];
  for (const name of others) players.push(await joinRoom(browser, code, name));
  await expect(host.page.getByText(t.room.players(NAMES.length, 6))).toBeVisible();
  await host.page.getByRole('button', { name: t.room.start, exact: true }).click();
  for (const p of players) await expect(p.page.locator('[data-phase="turn"]')).toBeVisible();
}

/** คนที่เห็นปุ่มทอย = เจ้าของเทิร์น */
async function currentPlayer(): Promise<Player> {
  let found: Player | undefined;
  await expect
    .poll(async () => {
      for (const p of players) {
        if (await p.page.getByRole('button', { name: bm.turn.roll, exact: true }).isVisible()) {
          found = p;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found as Player;
}

/** เจ้าของเทิร์นประกาศดีล ให้ผู้ร่วมดีลคนละ 5k แล้วเสนอแผน คืนชื่อผู้ร่วมดีล */
async function declareAndPropose(boss: Player): Promise<string[]> {
  await boss.page.getByRole('button', { name: bm.turn.declare, exact: true }).click();
  for (const p of players) await expect(p.page.getByTestId('deal-panel')).toBeVisible();
  const editor = boss.page.getByTestId('plan-editor');
  const plus = editor.getByRole('button', { name: /^\+ / });
  const members: string[] = [];
  for (const button of await plus.all()) {
    members.push(((await button.getAttribute('aria-label')) ?? '').slice(2));
    await button.click();
  }
  await editor.getByRole('button', { name: bm.deal.propose, exact: true }).click();
  await expect(
    editor.getByRole('button', { name: bm.deal.proposeAgain, exact: true }),
  ).toBeVisible();
  return members;
}

async function moneyOf(page: Player['page'], name: string) {
  return page.locator(`[data-testid="player-chip"][data-player="${name}"] [data-testid="money"]`);
}

test('ทอย → ประกาศดีล → เสนอแผน → ทุกคนตกลง → ปิดดีลและเงินเข้าทุกจอ', async ({ browser }) => {
  await startBoss(browser);
  const boss = await currentPlayer();
  for (const p of players)
    await expect(await moneyOf(p.page, boss.name)).toHaveText(bm.money.k('0'));

  await boss.page.getByRole('button', { name: bm.turn.roll, exact: true }).click();
  for (const p of players) await expect(p.page.getByTestId('last-roll')).toBeVisible();
  await expect(boss.page.locator('[data-phase="moved"]')).toBeVisible();

  const members = await declareAndPropose(boss);
  for (const p of players.filter((p) => members.includes(p.name))) {
    await p.page.getByRole('button', { name: bm.deal.agree, exact: true }).click();
  }
  // คนที่ไม่ได้อยู่ในแผนไม่มีปุ่มตกลง
  for (const p of players.filter((p) => p !== boss && !members.includes(p.name))) {
    await expect(p.page.getByRole('button', { name: bm.deal.agree, exact: true })).toHaveCount(0);
  }

  // นับถอยหลัง 5 วินาทีแล้วปิดดีล
  for (const p of players) {
    await expect(p.page.getByTestId('news')).toContainText(boss.name);
    await expect(p.page.locator('[data-phase="turn"]')).toBeVisible();
  }
  for (const name of members) {
    for (const p of players) await expect(await moneyOf(p.page, name)).toHaveText(bm.money.k('5'));
  }
  const bossMoney = await (await moneyOf(boss.page, boss.name)).textContent();
  expect(bossMoney).not.toBe(bm.money.k('0'));
  for (const p of players)
    await expect(await moneyOf(p.page, boss.name)).toHaveText(bossMoney ?? '');
});

test('รีเฟรชกลางดีลแล้วยังเห็นแผนและตอบได้', async ({ browser }) => {
  await startBoss(browser);
  const boss = await currentPlayer();
  const members = await declareAndPropose(boss);
  const member = players.find((p) => members.includes(p.name));
  test.skip(member === undefined, 'บอสถือทุกตระกูลที่ดีลนี้ใช้เอง');
  if (!member) return;

  await member.page.reload();
  await expect(member.page.getByTestId('plan')).toBeVisible();
  await member.page.getByRole('button', { name: bm.deal.agree, exact: true }).click();
  for (const other of players.filter((p) => members.includes(p.name) && p !== member)) {
    await other.page.getByRole('button', { name: bm.deal.agree, exact: true }).click();
  }
  await expect(member.page.getByTestId('news')).toContainText(boss.name);
});

test('บอสยอมแพ้ → ดีลล่ม เทิร์นไปคนถัดไป', async ({ browser }) => {
  await startBoss(browser);
  const boss = await currentPlayer();
  await boss.page.getByRole('button', { name: bm.turn.declare, exact: true }).click();
  await boss.page.getByRole('button', { name: bm.deal.abandon, exact: true }).click();
  await boss.page.getByRole('button', { name: bm.deal.confirm, exact: true }).click();
  for (const p of players) {
    await expect(p.page.getByTestId('news')).toHaveText(bm.news.broken.abandoned(boss.name));
  }
  const next = await currentPlayer();
  expect(next).not.toBe(boss);
});
