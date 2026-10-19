'use client';

import { ROOM_CODE_LENGTH } from '@batonboard/protocol';
import { Button, buttonVariants, Card, CardTitle, Input } from '@batonboard/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { gameClients } from '@/games';
import { useLocale, useT } from '@/messages';

/** หน้าหลักของเว็บ: แนะนำแพลตฟอร์ม → ไปเลือกเกม หรือเข้าห้องด้วยรหัส */
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

  const steps = [
    [t.landing.step1Title, t.landing.step1Body],
    [t.landing.step2Title, t.landing.step2Body],
    [t.landing.step3Title, t.landing.step3Body],
  ] as const;

  return (
    <div className="flex flex-1 flex-col gap-8">
      <header className="pt-6 text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 grid size-16 grid-cols-2 gap-1.5 rounded-2xl bg-primary p-3 shadow-lg shadow-primary/30"
        >
          <span className="rounded-full bg-primary-foreground" />
          <span className="rounded-full bg-primary-foreground/40" />
          <span className="rounded-full bg-primary-foreground/40" />
          <span className="rounded-full bg-primary-foreground" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{t.appName}</h1>
        <p className="mt-2 text-balance text-muted-foreground">{t.tagline}</p>
        <Link
          href="/games"
          className={buttonVariants({ size: 'lg', block: true, className: 'mt-6' })}
        >
          {t.landing.cta}
        </Link>
      </header>

      <Card>
        <CardTitle className="mb-3 text-base">{t.home.joinTitle}</CardTitle>
        <form className="flex gap-2" onSubmit={join}>
          <Input
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder={t.home.codePlaceholder}
            aria-label={t.home.codePlaceholder}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase tracking-widest"
            onChange={(e) => setCode(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!ready}
            className="shrink-0 whitespace-nowrap"
          >
            {t.home.join}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t.landing.howTitle}</h2>
        <ol className="space-y-3">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t.landing.gamesTitle}</h2>
        {gameClients.map((g) => (
          <Link
            key={g.id}
            href={`/games?game=${g.id}`}
            className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-bold">{g.displayName[locale]}</span>
              <span className="text-xs text-muted-foreground">
                {t.home.players(g.minPlayers, g.maxPlayers)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{g.description[locale]}</p>
            <p className="mt-3 text-sm font-semibold text-primary">{t.landing.play} →</p>
          </Link>
        ))}
        <p className="text-center text-sm text-muted-foreground">{t.landing.moreSoon}</p>
      </section>
    </div>
  );
}
