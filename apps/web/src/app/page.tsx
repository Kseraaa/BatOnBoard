'use client';

import { ROOM_CODE_LENGTH } from '@batonboard/protocol';
import { PixelIcon } from '@batonboard/ui';
import type { GameClient, GameMode } from '@batonboard/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { gameClients } from '@/games';
import { useLocale, useT } from '@/messages';

const LOGO = [
  '############',
  '#..........#',
  '#.##....##.#',
  '#.##....##.#',
  '#..........#',
  '#....##....#',
  '#....##....#',
  '#..........#',
  '#.##....##.#',
  '#.##....##.#',
  '#..........#',
  '############',
];

const SOON = [
  '..#####..',
  '.##...##.',
  '.##...##.',
  '.....##..',
  '....##...',
  '...##....',
  '...##....',
  '.........',
  '...##....',
  '...##....',
];

/** ตารางมี 4 คอลัมน์ตั้งแต่จอแท็บเล็ต เติมช่อง "เร็ว ๆ นี้" ให้เต็มแถว */
const GRID_COLUMNS = 4;

/** หน้าหลัก: แนะนำแพลตฟอร์ม + ตารางเกมแยกตามวิธีสื่อสาร → ไปเลือกเกม หรือเข้าห้องด้วยรหัส */
export default function LandingPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // ปุ่มกดได้หลัง hydrate เท่านั้น — มือถือช้า ๆ กดก่อน JS พร้อมแล้วปุ่มจะเงียบ
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  // ชื่อเล่นถามที่หน้าห้อง (/r/<code>) อยู่แล้ว ที่นี่จึงรับแค่รหัส
  function join(e: FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== ROOM_CODE_LENGTH) return setError(t.home.codeInvalid);
    router.push(`/r/${normalized}`);
  }

  const sections = (
    [
      { mode: 'in-app', title: t.landing.inAppTitle, body: t.landing.inAppBody },
      { mode: 'together', title: t.landing.togetherTitle, body: t.landing.togetherBody },
    ] satisfies { mode: GameMode; title: string; body: string }[]
  )
    .map((s) => ({ ...s, games: gameClients.filter((g) => g.mode === s.mode) }))
    // หมวดที่มีเกมขึ้นก่อน
    .sort((a, b) => b.games.length - a.games.length);

  return (
    <div className="min-h-dvh bg-landing-bg font-mono text-landing-ink selection:bg-landing-ink selection:text-landing-bg">
      <div className="mx-auto max-w-6xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-landing-ink py-4 text-sm">
          <Link href="/" className="font-semibold underline underline-offset-4">
            {t.appName}
          </Link>
          <span className="hidden sm:inline">✦✦✦ {t.landing.topCenter} ✦✦✦</span>
          <a href="#join" className="underline underline-offset-4">
            {t.landing.haveCode}
          </a>
        </header>

        <section className="grid gap-8 py-8 text-sm leading-relaxed sm:grid-cols-2 lg:grid-cols-4">
          <div className="hidden lg:block">
            <PixelIcon rows={LOGO} className="w-28" />
          </div>
          <div>
            <h1 className="font-semibold">{t.landing.aboutTitle}</h1>
            <p className="mt-1">{t.landing.aboutBody}</p>
          </div>
          <div>
            <h2 className="font-semibold">{t.landing.howTitle}</h2>
            <ol className="mt-1 space-y-1">
              {[t.landing.step1, t.landing.step2, t.landing.step3].map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span>{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-6 sm:col-span-2 sm:flex-row sm:items-start lg:col-span-1 lg:flex-col lg:items-center">
            <a
              href="#games"
              className="inline-flex h-14 items-center justify-center border-2 border-landing-ink px-10 text-xl font-semibold tracking-widest shadow-[4px_4px_0_0_var(--landing-ink)] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              {t.landing.play}
            </a>
            <form id="join" className="w-full max-w-xs scroll-mt-4" onSubmit={join}>
              <label htmlFor="join-code" className="font-semibold">
                {t.home.joinTitle}
              </label>
              <div className="mt-2 flex">
                <input
                  id="join-code"
                  value={code}
                  maxLength={ROOM_CODE_LENGTH}
                  placeholder={t.home.codePlaceholder}
                  aria-label={t.home.codePlaceholder}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="h-12 w-full min-w-0 border-2 border-r-0 border-landing-ink bg-transparent px-3 text-base uppercase tracking-widest outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-landing-ink/60 focus:bg-landing-ink/10"
                  onChange={(e) => setCode(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!ready}
                  className="h-12 shrink-0 whitespace-nowrap border-2 border-landing-ink bg-landing-ink px-4 font-semibold text-landing-bg disabled:opacity-50"
                >
                  {t.home.join}
                </button>
              </div>
              {error && (
                <p role="alert" className="mt-2 font-semibold">
                  {error}
                </p>
              )}
            </form>
          </div>
        </section>

        {sections.map((s, i) => (
          <section
            key={s.mode}
            // ปุ่ม "เล่นเลย!" เลื่อนลงมาที่ตารางเกม (เลือกเกมที่นี่ที่เดียว)
            id={i === 0 ? 'games' : undefined}
            className="scroll-mt-4 pb-10"
            aria-labelledby={`mode-${s.mode}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
              <h2 id={`mode-${s.mode}`} className="text-lg font-semibold">
                {s.title}
              </h2>
              <span className="text-sm">{t.landing.gameCount(s.games.length)}</span>
              <p className="w-full text-sm">{s.body}</p>
            </div>
            <div className="grid grid-cols-2 border-l border-t border-landing-ink sm:grid-cols-4">
              {s.games.map((g) => (
                <GameTile
                  key={g.id}
                  game={g}
                  name={g.displayName[locale]}
                  players={t.home.players(g.minPlayers, g.maxPlayers)}
                />
              ))}
              {Array.from({ length: placeholders(s.games.length) }, (_, i) => (
                <div
                  key={i}
                  className="flex aspect-square flex-col items-center border-b border-r border-landing-ink p-4"
                >
                  <div className="grid w-full flex-1 place-items-center">
                    <PixelIcon rows={SOON} className="w-1/3 max-w-24 opacity-30" />
                  </div>
                  <span className="text-sm opacity-60">{t.landing.comingSoon}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer className="py-6 text-center text-sm">
          {t.landing.footer(new Date().getFullYear())}
        </footer>
      </div>
    </div>
  );
}

function placeholders(count: number): number {
  const total = Math.max(GRID_COLUMNS, Math.ceil(count / GRID_COLUMNS) * GRID_COLUMNS);
  return total - count;
}

function GameTile({ game, name, players }: { game: GameClient; name: string; players: string }) {
  return (
    <Link
      href={`/play/${game.id}`}
      className="group flex aspect-square flex-col items-center border-b border-r border-landing-ink p-4 transition-colors hover:bg-landing-ink hover:text-landing-bg focus-visible:bg-landing-ink focus-visible:text-landing-bg focus-visible:outline-none"
    >
      <div className="grid w-full flex-1 place-items-center">
        <PixelIcon
          rows={game.icon}
          className="w-1/2 max-w-36 transition-transform group-hover:scale-105"
        />
      </div>
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-xs opacity-70">{players}</span>
    </Link>
  );
}
