import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accuse, closeAll, m, readRole, rolesOf, startGame, t } from './helpers';
import type { Player } from './helpers';

let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

test('4 คน: สร้างห้อง → เข้าผ่านลิงก์ → เริ่มเกม → มีหน้าจอเดียวที่เป็นสายลับ', async ({
  browser,
}) => {
  ({ players } = await startGame(browser));
  const roles = await rolesOf(players);

  const spies = roles.filter((r) => r.role.spy);
  expect(spies).toHaveLength(1);

  const agents = roles.flatMap((r) => (r.role.spy ? [] : [r.role]));
  expect(agents).toHaveLength(3);
  // ทุกคนที่ไม่ใช่สายลับได้สถานที่เดียวกัน แต่บทบาทไม่ซ้ำกัน
  expect(new Set(agents.map((a) => a.location)).size).toBe(1);
  expect(new Set(agents.map((a) => a.role)).size).toBe(3);

  // หน้าจอของสายลับไม่มีชื่อสถานที่ในการ์ด (รายชื่ออ้างอิงมีทุกที่อยู่แล้ว จึงเช็กแค่การ์ด)
  const spyPage = spies[0]?.player.page as Page;
  await expect(spyPage.getByTestId('role-location')).toHaveCount(0);
});

test('กล่าวหาสายลับ → ทุกคนเห็นด้วย → หน้า reveal ถูกต้องทุกจอ', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const roles = await rolesOf(players);
  const spy = roles.find((r) => r.role.spy)?.player as Player;
  const [accuser, ...voters] = roles.filter((r) => !r.role.spy).map((r) => r.player) as [
    Player,
    ...Player[],
  ];

  await accuse(accuser.page, spy.name);

  // ทุกจอเข้าช่วงโหวต ผู้ถูกกล่าวหาโหวตไม่ได้
  for (const p of players) await expect(p.page.locator('[data-phase="voting"]')).toBeVisible();
  await expect(spy.page.getByText(m.vote.youAreAccused)).toBeVisible();
  await expect(spy.page.getByRole('button', { name: m.vote.agree, exact: true })).toHaveCount(0);
  await expect(accuser.page.getByText(m.vote.waiting)).toBeVisible();

  for (const v of voters)
    await v.page.getByRole('button', { name: m.vote.agree, exact: true }).click();

  for (const p of players) {
    await expect(p.page.getByTestId('reveal-winner')).toHaveText(m.reveal.agentsWin);
    await expect(p.page.getByTestId('reveal-spy')).toHaveText(spy.name);
    await expect(p.page.getByText(m.reveal.reasons['spy-caught'])).toBeVisible();
  }
});

test('กล่าวหาผิดคน → ทุกคนเห็นด้วย → สายลับชนะ', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const roles = await rolesOf(players);
  const spy = roles.find((r) => r.role.spy)?.player as Player;
  const [accuser, innocent, other] = roles.filter((r) => !r.role.spy).map((r) => r.player) as [
    Player,
    Player,
    Player,
  ];

  await accuse(accuser.page, innocent.name);
  await other.page.getByRole('button', { name: m.vote.agree, exact: true }).click();
  await spy.page.getByRole('button', { name: m.vote.agree, exact: true }).click();

  for (const p of players) {
    await expect(p.page.getByTestId('reveal-winner')).toHaveText(m.reveal.spyWins);
    await expect(p.page.getByTestId('reveal-spy')).toHaveText(spy.name);
  }
});

test('โหวตไม่ผ่าน → กลับช่วงถามตอบ และผู้กล่าวหาใช้สิทธิ์ไม่ได้อีก', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const roles = await rolesOf(players);
  const [accuser, target, disagree] = roles.filter((r) => !r.role.spy).map((r) => r.player) as [
    Player,
    Player,
    Player,
  ];

  await accuse(accuser.page, target.name);
  await disagree.page.getByRole('button', { name: m.vote.disagree, exact: true }).click();

  for (const p of players) await expect(p.page.locator('[data-phase="questioning"]')).toBeVisible();
  await expect(accuser.page.getByRole('button', { name: m.accuse, exact: true })).toHaveCount(0);
  await expect(disagree.page.getByRole('button', { name: m.accuse, exact: true })).toHaveCount(3);
});

test('รีเฟรชกลางเกมแล้วกลับมาเห็น view เดิม', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const before = await rolesOf(players);

  // รีเฟรชทุกคน (รวม host) ระหว่างช่วงถามตอบ
  for (const p of players) await p.page.reload();
  for (const [i, p] of players.entries()) {
    await expect(p.page.locator('[data-phase="questioning"]')).toBeVisible();
    expect(await readRole(p.page)).toEqual(before[i]?.role);
  }

  // host ยังเป็น host (เห็นปุ่มกลับล็อบบี้) และทุกคนยังออนไลน์ครบ
  const host = players[0] as Player;
  await expect(
    host.page.getByRole('button', { name: t.room.backToLobby, exact: true }),
  ).toBeVisible();
  await expect(host.page.getByText(m.offline)).toHaveCount(0);

  // รีเฟรชระหว่างโหวต: กลับมายังเห็นแผงโหวตและโหวตต่อได้
  const agents = before.filter((r) => !r.role.spy).map((r) => r.player) as [Player, Player, Player];
  const spy = before.find((r) => r.role.spy)?.player as Player;
  await accuse(agents[0].page, spy.name);
  await agents[1].page.reload();
  await expect(agents[1].page.locator('[data-phase="voting"]')).toBeVisible();
  await agents[1].page.getByRole('button', { name: m.vote.agree, exact: true }).click();
  await agents[2].page.getByRole('button', { name: m.vote.agree, exact: true }).click();
  for (const p of players) {
    await expect(p.page.getByTestId('reveal-winner')).toHaveText(m.reveal.agentsWin);
  }
});

test('สายลับเดาสถานที่ถูก → สายลับชนะ', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const roles = await rolesOf(players);
  const spy = roles.find((r) => r.role.spy)?.player as Player;
  const agentRole = roles.find((r) => !r.role.spy)?.role;
  const location = agentRole && !agentRole.spy ? agentRole.location : '';

  await spy.page.getByRole('button', { name: m.spy.guess, exact: true }).click();
  await spy.page
    .getByTestId('spy-guess')
    .getByRole('button', { name: location, exact: true })
    .click();
  await expect(spy.page.getByText(m.spy.confirmGuess(location))).toBeVisible();
  await spy.page.getByRole('button', { name: m.confirm, exact: true }).click();

  for (const p of players) {
    await expect(p.page.getByTestId('reveal-winner')).toHaveText(m.reveal.spyWins);
    await expect(p.page.getByText(m.reveal.spyGuessed(location))).toBeVisible();
  }
});
