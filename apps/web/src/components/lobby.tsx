'use client';

import type { RoomStateMessage } from '@batonboard/protocol';
import { Badge, Button, Card, CardTitle, PixelAvatar } from '@batonboard/ui';
import type { GameClient } from '@batonboard/ui';
import { useEffect, useState } from 'react';
import { getRoomClient } from '@/lib/room-client';
import { errorText, useLocale, useT } from '@/messages';

interface LobbyProps {
  room: RoomStateMessage;
  me: string;
  game: GameClient | undefined;
  onLeave(): void;
}

export function Lobby({ room, me, game, onLeave }: LobbyProps) {
  const t = useT();
  const locale = useLocale();
  const client = getRoomClient();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  // ปุ่มเพิ่มบอทซ่อนไว้ เปิดด้วย ?bots=1 ใน URL ของห้อง (ผู้เล่นทั่วไปไม่เห็น)
  const [showBots, setShowBots] = useState(false);

  useEffect(() => {
    setShowBots(new URLSearchParams(window.location.search).get('bots') === '1');
  }, []);

  const isHost = room.hostId === me;
  const minPlayers = game?.minPlayers ?? 1;
  const maxPlayers = game?.maxPlayers ?? room.players.length;
  // host ที่ดำเนินเกม (ไม่ได้เล่น) ไม่นับเป็นผู้เล่น
  const moderated = game?.hostModerates?.(room.options) === true;
  const playing = room.players.length - (moderated ? 1 : 0);
  const enough = playing >= minPlayers;
  const gameName = game?.displayName[locale] ?? room.gameId;
  const canAddBot = isHost && showBots && room.botsAllowed && playing < maxPlayers;

  function addBot() {
    const taken = new Set(room.players.map((p) => p.name.toLocaleLowerCase()));
    let n = 1;
    while (taken.has(t.room.botName(n).toLocaleLowerCase())) n++;
    void run(client.addBot(t.room.botName(n)));
  }

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const res = await p;
    if (!res.ok) setError(errorText(t, res.error ?? 'unknown'));
  }

  async function share() {
    const url = `${window.location.origin}/r/${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: gameName, text: t.room.shareText(gameName), url });
        return;
      } catch {
        // ผู้ใช้ยกเลิก — ลองคัดลอกแทน
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt(t.room.copyLink, url);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="text-center">
        <p className="text-sm text-muted-foreground">{gameName}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{t.room.code}</p>
        <p data-testid="room-code" className="font-mono text-5xl font-bold tracking-[0.2em]">
          {room.code}
        </p>
        <Button variant="secondary" className="mt-3" onClick={share}>
          {copied ? t.room.copied : t.room.share}
        </Button>
      </header>

      <Card>
        <CardTitle className="mb-3 text-base">{t.room.players(playing, maxPlayers)}</CardTitle>
        <ul className="divide-y divide-border">
          {room.players.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-2 py-2">
              <span className="relative">
                <PixelAvatar name={p.name} />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${p.online ? 'bg-success' : 'bg-muted-foreground/60'}`}
                  aria-hidden
                />
              </span>
              <span className="flex-1 truncate font-semibold">{p.name}</span>
              {p.bot && <Badge variant="outline">🤖 {t.room.bot}</Badge>}
              {p.id === room.hostId && (
                <Badge variant="secondary">{moderated ? t.room.moderator : t.room.host}</Badge>
              )}
              {p.id === me && <Badge variant="outline">{t.room.you}</Badge>}
              {!p.online && <Badge variant="outline">{t.room.offline}</Badge>}
              {isHost && p.id !== me && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmKick(p.id)}>
                  {t.room.kick}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canAddBot && (
          <Button block variant="outline" className="mt-3" onClick={addBot}>
            🤖 {t.room.addBot}
          </Button>
        )}
        {confirmKick && (
          <div className="mt-3 rounded-xl bg-muted p-3">
            <p className="mb-2 text-sm">
              {t.room.confirmKick(room.players.find((p) => p.id === confirmKick)?.name ?? '')}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  void run(client.kick(confirmKick));
                  setConfirmKick(null);
                }}
              >
                {t.common.confirm}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmKick(null)}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {game?.Settings && (
        <Card>
          <CardTitle className="mb-3 text-base">{t.room.settings}</CardTitle>
          <game.Settings
            options={room.options}
            locale={locale}
            editable={isHost}
            onChange={(options) => void run(client.updateSettings(options))}
          />
        </Card>
      )}

      <div className="mt-auto space-y-2 pt-2">
        {error && (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        {isHost ? (
          <>
            <Button block size="lg" disabled={!enough} onClick={() => void run(client.start())}>
              {t.room.start}
            </Button>
            {!enough && (
              <p className="text-center text-sm text-muted-foreground">
                {t.room.needPlayers(minPlayers)}
              </p>
            )}
          </>
        ) : (
          <p className="py-3 text-center text-muted-foreground">{t.room.waitingHost}</p>
        )}
        <Button block variant="ghost" onClick={onLeave}>
          {t.room.leave}
        </Button>
      </div>
    </div>
  );
}
