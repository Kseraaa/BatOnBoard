import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  closeAll,
  guess,
  m,
  otherLocation,
  readRole,
  rolesOf,
  startGame,
  startVoting,
  t,
  vote,
} from './helpers';
import type { Player } from './helpers';

let players: Player[] = [];

test.afterEach(async () => {
  await closeAll(players);
  players = [];
});

/** อ่านบทบาททุกคนแล้วแยกสายลับกับคนอื่น */
async function sides(list: Player[]) {
  const roles = await rolesOf(list);
  const spy = roles.find((r) => r.role.spy)?.player as Player;
  const agents = roles.filter((r) => !r.role.spy).map((r) => r.player) as [Player, Player, Player];
  const agentRole = roles.find((r) => !r.role.spy)?.role;
  const location = agentRole && !agentRole.spy ? agentRole.location : '';
  return { spy, agents, location };
}

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

  // หน้าจอของสายลับไม่มีชื่อสถานที่ในการ์ด และยังเปิดตัวทายไม่ได้
  const spyPage = spies[0]?.player.page as Page;
  await expect(spyPage.getByTestId('role-location')).toHaveCount(0);
  await expect(spyPage.getByTestId('spy-guess')).toHaveCount(0);
  // เฉพาะ host เห็นปุ่มเริ่มโหวต
  for (const [i, p] of players.entries()) {
    await expect(p.page.getByRole('button', { name: m.startVote.button, exact: true })).toHaveCount(
      i === 0 ? 1 : 0,
    );
  }
});

test('โหวตจับสายลับได้ → สายลับทายผิด → เฉพาะคนที่โหวตถูกชนะ', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const { spy, agents, location } = await sides(players);
  const [a, b, c] = agents;

  await startVoting(players[0]?.page as Page);
  for (const p of players) await expect(p.page.locator('[data-phase="voting"]')).toBeVisible();

  // ฝ่ายผู้เล่นทั้ง 3 คนโหวตสายลับ สายลับโหวต a → สายลับได้ 3 เสียง
  await vote(a.page, spy.name);
  await vote(b.page, spy.name);
  await vote(c.page, spy.name);
  await vote(spy.page, a.name);

  for (const p of players) {
    await expect(p.page.locator('[data-phase="guessing"]')).toBeVisible();
    await expect(p.page.getByTestId('vote-chosen')).toHaveText(m.result.chosen(spy.name));
  }
  // คนที่ไม่ใช่สายลับรอ สายลับเห็นแผงทาย
  await expect(a.page.getByText(m.guess.waiting)).toBeVisible();
  await expect(spy.page.getByText(m.guess.caughtHelp)).toBeVisible();

  await guess(spy.page, await otherLocation(spy.page, location));

  for (const p of players) {
    await expect(p.page.getByTestId('reveal-winner')).toHaveText(m.reveal.votersWin);
    await expect(p.page.getByTestId('reveal-spy')).toHaveText(spy.name);
    await expect(p.page.getByText(m.reveal.reasons.caught)).toBeVisible();
    for (const winner of [a, b, c]) {
      await expect(p.page.getByTestId('reveal-winners')).toContainText(winner.name);
    }
  }
});

test('โหวตผิดคน → สายลับทายถูก → สายลับชนะ', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const { spy, agents, location } = await sides(players);
  const [a, b, c] = agents;

  await startVoting(players[0]?.page as Page);
  await vote(a.page, b.name);
  await vote(b.page, a.name);
  await vote(c.page, a.name);
  await vote(spy.page, a.name);

  for (const p of players) {
    await expect(p.page.getByTestId('vote-chosen')).toHaveText(m.result.chosen(a.name));
  }
  await expect(spy.page.getByText(m.guess.missedHelp)).toBeVisible();
  await guess(spy.page, location);

  for (const p of players) {
    await expect(p.page.getByTestId('reveal-winner')).toHaveText(m.reveal.spyWins);
    await expect(p.page.getByText(m.reveal.spyGuessed(location))).toBeVisible();
  }
});

test('คะแนนเสมอ → โหวตใหม่เฉพาะคนที่เสมอ', async ({ browser }) => {
  ({ players } = await startGame(browser));
  const { spy, agents } = await sides(players);
  const [a, b, c] = agents;

  await startVoting(players[0]?.page as Page);
  // a 2 เสียง (b, c) และ b 2 เสียง (a, สายลับ)
  await vote(a.page, b.name);
  await vote(b.page, a.name);
  await vote(c.page, a.name);
  await vote(spy.page, b.name);

  for (const p of players) await expect(p.page.getByText(m.vote.revoteTitle)).toBeVisible();
  // c เลือกได้แค่ a กับ b, a เลือกได้แค่ b
  await expect(c.page.getByTestId('vote-panel').getByRole('button')).toHaveCount(2);
  await expect(a.page.getByTestId('vote-panel').getByRole('button')).toHaveCount(1);

  await vote(a.page, b.name);
  await vote(b.page, a.name);
  await vote(c.page, b.name);
  await vote(spy.page, b.name);
  for (const p of players) {
    await expect(p.page.getByTestId('vote-chosen')).toHaveText(m.result.chosen(b.name));
  }
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

  // รีเฟรชหลังโหวตไปแล้ว: ยังจำว่าโหวตใคร และคนอื่นโหวตต่อได้
  const { spy, agents } = await sides(players);
  await startVoting(host.page);
  await vote(agents[0].page, spy.name);
  await agents[0].page.reload();
  await expect(agents[0].page.getByText(m.vote.voted(spy.name))).toBeVisible();
  await vote(agents[1].page, spy.name);
  await vote(agents[2].page, spy.name);
  await vote(spy.page, agents[0].name);
  for (const p of players) await expect(p.page.locator('[data-phase="guessing"]')).toBeVisible();
});
