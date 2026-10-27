import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { poetsMessages } from '../../packages/games/poets/client/messages';
import { closeAll, createRoom, joinRoom, NAMES, t } from './helpers';
import type { Player } from './helpers';

const m = poetsMessages.th;
let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

async function startPoets(browser: Browser) {
  const [hostName, ...others] = NAMES as [string, ...string[]];
  const { host, code } = await createRoom(browser, hostName, 'poets');
  const list = [host];
  for (const name of others) list.push(await joinRoom(browser, code, name));
  await expect(host.page.getByText(t.room.players(NAMES.length, 6))).toBeVisible();
  await host.page.getByRole('button', { name: t.room.start, exact: true }).click();
  for (const p of list) await expect(p.page.locator('[data-phase="reading"]')).toBeVisible();
  return list;
}

/** เปิดการ์ดค้างไว้แล้วอ่านโวหารกับประโยค */
async function readCard(page: Page) {
  const show = page.getByRole('button', { name: m.card.show, exact: true });
  if (await show.isVisible()) await show.click();
  await expect(page.getByTestId('poet-card')).toBeVisible();
  return {
    figure: (await page.getByTestId('poet-figure').textContent()) ?? '',
    line: ((await page.getByTestId('poet-line').textContent()) ?? '').replace(/[“”]/g, ''),
  };
}

/** แยกกวีสายลับ (โวหารไม่เหมือนใคร) กับกวีในหมู่บ้าน */
async function sides(list: Player[]) {
  const cards = [];
  for (const p of list) cards.push({ player: p, ...(await readCard(p.page)) });
  const spy = cards.find((c) => cards.filter((o) => o.figure === c.figure).length === 1);
  if (!spy) throw new Error('no unique figure');
  return { spy, villagers: cards.filter((c) => c !== spy), cards };
}

/** ลำดับการอ่านจากหน้าจอของ host */
async function readingOrder(page: Page, list: Player[]): Promise<Player[]> {
  const rows = await page.getByTestId('reading-row').allTextContents();
  return rows.map((row) => list.find((p) => row.includes(p.name)) as Player);
}

test('4 คน: แจกประโยค → อ่านตามลำดับ → โหวตถูก → หมู่บ้านปลอดภัย', async ({ browser }) => {
  players = await startPoets(browser);
  const { spy, villagers, cards } = await sides(players);
  expect(villagers).toHaveLength(3);
  expect(new Set(villagers.map((v) => v.figure)).size).toBe(1);
  expect(new Set(cards.map((c) => c.line)).size).toBe(4);

  // ทุกคนเห็นลำดับเดียวกัน และกดอ่านจบได้เฉพาะคนที่ถึงตา
  const order = await readingOrder(players[0]?.page as Page, players);
  for (const reader of order) {
    const done = reader.page.getByRole('button', { name: m.reading.done, exact: true });
    await expect(done).toBeVisible();
    for (const p of players) {
      if (p !== reader) {
        await expect(p.page.getByRole('button', { name: m.reading.done, exact: true })).toHaveCount(
          0,
        );
      }
    }
    await done.click();
    await expect(done).toHaveCount(0);
  }

  // ช่วงคุย: กระดานกลอนมีประโยคของทุกคน รวมของสายลับ
  for (const p of players) {
    await expect(p.page.locator('[data-phase="discussion"]')).toBeVisible();
    await expect(p.page.getByTestId('poem-board')).toContainText(spy.line);
  }

  const host = players[0]?.page as Page;
  await host.getByRole('button', { name: m.discussion.button, exact: true }).click();
  await host.getByRole('button', { name: m.confirm, exact: true }).click();

  for (const c of cards) {
    const target = c === spy ? (villagers[0]?.player.name as string) : spy.player.name;
    const page = c.player.page;
    await page.getByTestId('vote-panel').getByRole('button').filter({ hasText: target }).click();
    await page.getByRole('button', { name: m.confirm, exact: true }).click();
    await expect(
      page.getByText(m.vote.voted(target)).or(page.getByTestId('reveal')).first(),
    ).toBeVisible();
  }

  for (const p of players) {
    await expect(p.page.getByTestId('reveal-winner')).toHaveText(m.reveal.safe);
    await expect(p.page.getByTestId('reveal-spy')).toHaveText(spy.player.name);
    await expect(p.page.getByTestId('reveal-figure')).toHaveText(villagers[0]?.figure as string);
    await expect(p.page.getByTestId('reveal-spy-figure')).toHaveText(spy.figure);
  }
});

test('รีเฟรชกลางเกมเห็นประโยคเดิม และ host ข้ามคนที่ถึงตาอ่านได้', async ({ browser }) => {
  players = await startPoets(browser);
  const guest = players[1] as Player;
  const before = await readCard(guest.page);
  await guest.page.reload();
  await expect(guest.page.locator('[data-phase="reading"]')).toBeVisible();
  expect(await readCard(guest.page)).toEqual(before);

  const host = players[0] as Player;
  const [first] = await readingOrder(host.page, players);
  if (first !== host) {
    await host.page.getByRole('button', { name: m.reading.skip(first?.name ?? '') }).click();
    // ประโยคของคนที่ถูกข้ามขึ้นกระดานให้ทุกคนเห็น
    const line = (await readCard(first?.page as Page)).line;
    await expect(guest.page.getByTestId('reading-panel')).toContainText(line);
  }
});
