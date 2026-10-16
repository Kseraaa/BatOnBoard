'use client';

import { ROOM_CODE_LENGTH, MAX_NAME_LENGTH } from '@batonboard/protocol';
import { Button, Card, CardTitle, cn, Input } from '@batonboard/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { gameClients } from '@/games';
import { getRoomClient } from '@/lib/room-client';
import { storage } from '@/lib/storage';
import { errorText, useLocale, useT } from '@/messages';

export default function HomePage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState(gameClients[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ปุ่มกดได้หลัง hydrate เท่านั้น — มือถือช้า ๆ กดก่อน JS พร้อมแล้วปุ่มจะเงียบ
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setName(storage.getName());
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

  function join(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) return setError(t.home.nameRequired);
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== ROOM_CODE_LENGTH) return setError(t.home.codeInvalid);
    storage.setName(trimmed);
    router.push(`/r/${normalized}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="pt-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t.appName}</h1>
        <p className="mt-2 text-muted-foreground">{t.tagline}</p>
      </header>

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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.home.pickGame}</h2>
        {gameClients.map((g) => (
          <button
            key={g.id}
            type="button"
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
        <Button block size="lg" disabled={busy || !ready} onClick={create}>
          {busy ? t.home.creating : t.home.createRoom}
        </Button>
      </section>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {t.home.or}
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card>
        <CardTitle className="mb-3 text-base">{t.home.joinTitle}</CardTitle>
        <form className="flex gap-2" onSubmit={join}>
          <Input
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder={t.home.codePlaceholder}
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
      </Card>

      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
