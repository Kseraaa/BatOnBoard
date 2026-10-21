'use client';

import { MAX_NAME_LENGTH } from '@batonboard/protocol';
import { Button, Card, CardTitle, cn, Input } from '@batonboard/ui';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Lobby } from '@/components/lobby';
import { getGameClient } from '@/games';
import { storage } from '@/lib/storage';
import { useRoom } from '@/lib/use-room';
import { errorText, useLocale, useT } from '@/messages';

export default function RoomPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();
  const [snap, client] = useRoom();
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmLobby, setConfirmLobby] = useState(false);

  const join = useCallback(
    async (playerName: string) => {
      setError(null);
      const res = await client.join(code, playerName);
      if (res.ok) {
        setAskName(false);
        return;
      }
      if (res.error === 'room-not-found' || res.error === 'invalid-payload') {
        setNotFound(res.error === 'room-not-found');
        if (res.error === 'invalid-payload') setAskName(true);
      } else {
        setAskName(true);
      }
      setError(errorText(t, res.error));
    },
    [client, code, t],
  );

  useEffect(() => {
    if (snap.code === code) return;
    const saved = storage.getName();
    setName(saved);
    if (storage.getSession(code) || saved) void join(saved);
    else setAskName(true);
    // รันครั้งเดียวต่อรหัสห้อง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // เริ่มเกม/กลับล็อบบี้ = หน้าเปลี่ยนทั้งหน้า ปุ่มที่กดอยู่ล่างจอจึงต้องเลื่อนกลับบนสุดให้เห็นหน้าใหม่ตั้งแต่ต้น
  const status = snap.code === code ? snap.room?.status : undefined;
  const lastStatus = useRef(status);
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = status;
    if (prev !== undefined && status !== undefined && prev !== status) window.scrollTo(0, 0);
  }, [status]);

  function submitName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t.home.nameRequired);
    storage.setName(trimmed);
    void join(trimmed);
  }

  async function leave() {
    await client.leave();
    router.push('/');
  }

  if (notFound || (snap.lost && snap.code === code)) {
    return (
      <Centered>
        <p className="text-lg font-semibold">{t.room.notFound}</p>
        <HomeLink label={t.room.goHome} />
      </Centered>
    );
  }

  if (snap.kicked && snap.code === code) {
    return (
      <Centered>
        <p className="text-lg font-semibold">{t.room.kicked}</p>
        <HomeLink label={t.room.goHome} />
      </Centered>
    );
  }

  if (askName) {
    return (
      <Centered>
        <Card className="w-full">
          <CardTitle className="mb-1">{t.room.joinTitle}</CardTitle>
          <p className="mb-4 font-mono text-2xl font-bold tracking-widest">{code}</p>
          <form className="space-y-3" onSubmit={submitName}>
            <Input
              value={name}
              autoFocus
              maxLength={MAX_NAME_LENGTH}
              placeholder={t.home.namePlaceholder}
              aria-label={t.home.yourName}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" block>
              {t.home.join}
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
        </Card>
        <HomeLink label={t.room.goHome} />
      </Centered>
    );
  }

  const room = snap.code === code ? snap.room : null;
  if (!room || !snap.playerId) {
    return (
      <Centered>
        <p className="text-muted-foreground">{t.room.connecting}</p>
        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      </Centered>
    );
  }

  const game = getGameClient(room.gameId);
  const isHost = room.hostId === snap.playerId;

  return (
    <div className="flex flex-1 flex-col">
      {!snap.connected && (
        <p
          role="status"
          className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-center text-sm font-semibold text-destructive"
        >
          {t.room.reconnecting}
        </p>
      )}

      {room.status === 'lobby' || !game ? (
        <Lobby room={room} me={snap.playerId} game={game} onLeave={() => void leave()} />
      ) : (
        <div
          className={cn(
            'flex flex-1 flex-col gap-4',
            // เกมกว้าง: ออกนอกคอลัมน์ max-w-md ของ layout แล้วจำกัดกว้างเอง
            game.layout === 'wide' &&
              'relative left-1/2 w-[min(64rem,calc(100vw-2rem))] max-w-none -translate-x-1/2',
          )}
        >
          {snap.view !== null && (
            <game.Screen
              view={snap.view}
              players={room.players}
              options={room.options}
              me={snap.playerId}
              hostId={room.hostId}
              serverOffset={snap.serverOffset}
              locale={locale}
              sendAction={async (action) => {
                const res = await client.action(action);
                return res.ok ? null : res.error;
              }}
              platformError={(c) => errorText(t, c)}
            />
          )}
          {isHost && (
            <div className="mt-auto pt-4">
              {confirmLobby ? (
                <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
                  <span className="flex-1">{t.room.confirmBackToLobby}</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setConfirmLobby(false);
                      void client.backToLobby();
                    }}
                  >
                    {t.common.confirm}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmLobby(false)}>
                    {t.common.cancel}
                  </Button>
                </div>
              ) : (
                <Button block variant="ghost" onClick={() => setConfirmLobby(true)}>
                  {t.room.backToLobby}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      {children}
    </div>
  );
}

function HomeLink({ label }: { label: string }) {
  return (
    <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
      {label}
    </Link>
  );
}
