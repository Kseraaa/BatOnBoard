'use client';

import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '@batonboard/protocol';
import { Button, Input, PixelIcon } from '@batonboard/ui';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getGameClient } from '@/games';
import { getRoomClient } from '@/lib/room-client';
import { storage } from '@/lib/storage';
import { errorText, useLocale, useT } from '@/messages';

/**
 * หน้าของเกมที่เลือกจากหน้าหลัก (เลือกเกมที่หน้าหลักที่เดียว):
 * ใส่ชื่อเล่นแล้วสร้างห้องใหม่ หรือใส่รหัสห้องที่เพื่อนสร้างไว้
 */
export default function PlayPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ game: string }>();
  const game = getGameClient(params.game ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  // ปุ่มกดได้หลัง hydrate เท่านั้น — มือถือช้า ๆ กดก่อน JS พร้อมแล้วปุ่มจะเงียบ
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setName(storage.getName());
    setReady(true);
  }, []);

  const back = (
    <Link href="/#games" className="text-sm text-muted-foreground underline underline-offset-4">
      ← {t.home.back}
    </Link>
  );

  if (!game) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg font-semibold">{t.home.gameNotFound}</p>
        {back}
      </div>
    );
  }

  const trimmed = name.trim();

  async function create() {
    if (!game) return;
    if (!trimmed) return setError(t.home.nameRequired);
    setBusy(true);
    setError(null);
    storage.setName(trimmed);
    const res = await getRoomClient().create(trimmed, game.id);
    if (res.ok) {
      router.push(`/r/${res.value.code}`);
    } else {
      setBusy(false);
      setError(errorText(t, res.error));
    }
  }

  /** เพื่อนสร้างห้องไว้แล้ว: ไปหน้าห้อง ถ้าใส่ชื่อไว้ หน้าห้องจะเข้าด้วยชื่อนี้เลยไม่ถามซ้ำ */
  function join() {
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== ROOM_CODE_LENGTH) return setJoinError(t.home.codeInvalid);
    if (trimmed) storage.setName(trimmed);
    router.push(`/r/${normalized}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-4">
        {back}
        <div className="flex items-center gap-4">
          <PixelIcon rows={game.icon} className="size-16 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{game.displayName[locale]}</h1>
            <p className="text-sm text-muted-foreground">
              {t.home.players(game.minPlayers, game.maxPlayers)} · {t.modes[game.mode]}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground">{game.description[locale]}</p>
      </header>

      <label className="block space-y-2" htmlFor="nickname">
        <span className="text-sm font-semibold">{t.home.yourName}</span>
        <Input
          id="nickname"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t.home.namePlaceholder}
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Button type="submit" block size="lg" disabled={busy || !ready}>
          {busy ? t.home.creating : t.home.createRoom}
        </Button>
        {error && (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
      </form>

      <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t.home.or}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <label htmlFor="join-code" className="text-sm font-semibold">
          {t.home.joinTitle}
        </label>
        <div className="flex gap-2">
          <Input
            id="join-code"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder={t.home.codePlaceholder}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" variant="outline" className="h-12 shrink-0" disabled={!ready}>
            {t.home.join}
          </Button>
        </div>
        {joinError && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {joinError}
          </p>
        )}
      </form>
    </div>
  );
}
