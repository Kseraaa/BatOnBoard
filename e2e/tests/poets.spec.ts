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

/** host (ครู) สร้างห้อง นักเรียนเข้าผ่านลิงก์ — ค่าเริ่มต้น host ดำเนินเกม ไม่ได้เล่น */
async function startPoets(browser: Browser, hostPlays = false) {
  const [hostName, ...others] = NAMES as [string, ...string[]];
  const { host, code } = await createRoom(browser, hostName, 'poets');
  const list = [host];
  for (const name of others) list.push(await joinRoom(browser, code, name));
  if (hostPlays) {
    await host.page
      .getByTestId('host-plays')
      .getByRole('radio', { name: m.settings.hostPlays, exact: true })
      .click();
  }
  const playing = hostPlays ? NAMES.length : NAMES.length - 1;
  await expect(host.page.getByText(t.room.players(playing, 6))).toBeVisible();
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
  const cards: ({ player: Player } & Awaited<ReturnType<typeof readCard>>)[] = [];
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

test('host ดำเนินเกม: เห็นไพ่ทุกคน → นักเรียนอ่าน → โหวตถูก → หมู่บ้านปลอดภัย', async ({
  browser,
}) => {
  players = await startPoets(browser);
  const [host, ...kids] = players as [Player, ...Player[]];
  const { spy, villagers, cards } = await sides(kids);
  expect(new Set(villagers.map((v) => v.figure)).size).toBe(1);

  // host ไม่ได้ไพ่ แต่เปิดดูไพ่ทุกคนได้ และรู้ว่าใครเป็นสายลับ
  await expect(host.page.getByTestId('poet-card')).toHaveCount(0);
  const panel = host.page.getByTestId('moderator-panel');
  await expect(panel.getByTestId('moderator-card')).toHaveCount(0);
  await panel.getByRole('button', { name: m.moderator.show, exact: true }).click();
  await expect(panel.getByTestId('moderator-card')).toHaveCount(kids.length);
  for (const c of cards) await expect(panel).toContainText(c.line);
  await expect(panel.locator('[data-spy="true"]')).toContainText(spy.player.name);

  // อ่านตามลำดับ: คนที่ถึงตากดเอง หรือ host กด "… อ่านจบแล้ว" ให้
  const order = await readingOrder(host.page, kids);
  for (const [i, reader] of order.entries()) {
    if (i === 0) {
      await host.page
        .getByRole('button', { name: m.moderator.doneFor(reader.name), exact: true })
        .click();
    } else {
      await reader.page.getByRole('button', { name: m.reading.done, exact: true }).click();
    }
  }

  for (const p of players) {
    await expect(p.page.locator('[data-phase="discussion"]')).toBeVisible();
    await expect(p.page.getByTestId('poem-board')).toContainText(spy.line);
  }

  await host.page.getByRole('button', { name: m.discussion.button, exact: true }).click();
  await host.page.getByRole('button', { name: m.confirm, exact: true }).click();
  await expect(host.page.getByText(m.moderator.noVote)).toBeVisible();

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
    await expect(p.page.getByTestId('reveal-spy-figure')).toHaveText(spy.figure);
  }
});

test('รีเฟรชกลางเกมเห็นประโยคเดิม', async ({ browser }) => {
  players = await startPoets(browser);
  const kid = players[1] as Player;
  const before = await readCard(kid.page);
  await kid.page.reload();
  await expect(kid.page.locator('[data-phase="reading"]')).toBeVisible();
  expect(await readCard(kid.page)).toEqual(before);
});

test('ตั้งให้ host เล่นด้วย: host ได้ไพ่และข้ามคนที่ถึงตาอ่านได้', async ({ browser }) => {
  players = await startPoets(browser, true);
  const host = players[0] as Player;
  const { cards } = await sides(players);
  expect(cards).toHaveLength(NAMES.length);
  await expect(host.page.getByTestId('moderator-panel')).toHaveCount(0);

  const [first] = await readingOrder(host.page, players);
  if (first !== host) {
    await host.page.getByRole('button', { name: m.reading.skip(first?.name ?? '') }).click();
    const line = cards.find((c) => c.player === first)?.line ?? '';
    await expect((players[1] as Player).page.getByTestId('reading-panel')).toContainText(line);
  }
});
