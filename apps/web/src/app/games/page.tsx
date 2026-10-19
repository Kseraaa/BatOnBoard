'use client';

import { MAX_NAME_LENGTH } from '@batonboard/protocol';
import { Button, cn, Input } from '@batonboard/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { gameClients, getGameClient } from '@/games';
import { getRoomClient } from '@/lib/room-client';
import { storage } from '@/lib/storage';
import { errorText, useLocale, useT } from '@/messages';

/** เลือกเกม + ใส่ชื่อ แล้วสร้างห้อง (`/games?game=<id>` เลือกเกมให้ล่วงหน้า) */
export default function GamesPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState(gameClients[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ปุ่มกดได้หลัง hydrate เท่านั้น — มือถือช้า ๆ กดก่อน JS พร้อมแล้วปุ่มจะเงียบ
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setName(storage.getName());
    // อ่านจาก location แทน useSearchParams จะได้ไม่ต้องห่อ Suspense
    const wanted = new URLSearchParams(window.location.search).get('game');
    if (wanted && getGameClient(wanted)) setGameId(wanted);
    setReady(true);
  }, []);

  const trimmed = name.trim();

  async function create() {
    if (!trimmed) return setError(t.home.nameRequired);
    setBusy(true);
    setError(null);
    storage.setName(trimmed);
    const res = await getRoomClient().create(trimmed, gameId);
    if (res.ok) {
      router.push(`/r/${res.value.code}`);
    } else {
      setBusy(false);
      setError(errorText(t, res.error));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-3">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          ← {t.home.back}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{t.home.pickGame}</h1>
      </header>

      <section className="space-y-3">
        {gameClients.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={g.id === gameId}
            onClick={() => setGameId(g.id)}
            className={cn(
              'block w-full rounded-2xl border-2 p-4 text-left transition-colors',
              g.id === gameId ? 'border-primary bg-primary/5' : 'border-border bg-card',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-bold">{g.displayName[locale]}</span>
              <span className="text-xs text-muted-foreground">
                {t.home.players(g.minPlayers, g.maxPlayers)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{g.description[locale]}</p>
          </button>
        ))}
      </section>

      <label className="block space-y-2">
        <span className="text-sm font-semibold">{t.home.yourName}</span>
        <Input
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t.home.namePlaceholder}
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <Button block size="lg" disabled={busy || !ready} onClick={create}>
        {busy ? t.home.creating : t.home.createRoom}
      </Button>

      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
