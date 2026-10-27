'use client';

/**
 * เพลงประกอบจาก YouTube — เล่นบนจอของ host เท่านั้น (จอที่ขึ้นโปรเจกเตอร์) ไม่งั้นมือถือทุกเครื่องดังพร้อมกัน
 * ใช้ YouTube IFrame Player API ตัวเล่นต้องมองเห็นได้ (เงื่อนไขของ YouTube) จึงแสดงเป็นกล่องเล็กท้ายจอ
 * ไม่ดาวน์โหลดหรือเก็บไฟล์เสียงไว้เอง
 */
import { Button, cn } from '@batonboard/ui';
import { useEffect, useRef, useState } from 'react';
import type { PoetsView } from '../rules/types';
import type { PoetsMessages } from './messages';

export type Track = 'reading' | 'discussion' | 'correct' | 'wrong';

/** id วิดีโอ YouTube ของแต่ละช่วง (ครูเลือกมา) */
export const TRACKS: Record<Track, { videoId: string; loop: boolean }> = {
  reading: { videoId: 'LVHDCxXbGHg', loop: true },
  discussion: { videoId: 'sY8CFUfItI8', loop: true },
  wrong: { videoId: 'Shxi-CD8-Vk', loop: false },
  correct: { videoId: 'm4mmFMF23gw', loop: false },
};

/** เพลงของช่วงนี้ — ช่วงเลือกหมู่บ้านและโหวตเงียบ */
export function trackFor(view: PoetsView): Track | null {
  switch (view.phase) {
    case 'reading':
      return 'reading';
    case 'discussion':
      return 'discussion';
    case 'reveal':
      if (view.result?.winner === 'village') return 'correct';
      if (view.result?.winner === 'spy') return 'wrong';
      return null;
    default:
      return null;
  }
}

const STORAGE_KEY = 'batonboard:poets:music';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // ไม่มี localStorage (โหมดส่วนตัว) — ใช้ค่าในหน่วยความจำต่อไป
  }
}

/** ส่วนที่ใช้จาก YouTube IFrame API (ไม่มี @types ใน repo) */
interface YtPlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YtApi {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      playerVars: Record<string, number>;
      events: {
        onReady(): void;
        onStateChange(event: { data: number }): void;
      };
    },
  ) => YtPlayer;
  PlayerState: { ENDED: number };
}

declare global {
  interface Window {
    YT?: YtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtApi> | null = null;

/** โหลด script ของ YouTube ครั้งเดียวต่อหน้า */
function loadApi(): Promise<YtApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function BackgroundMusic({ view, m }: { view: PoetsView; m: PoetsMessages }) {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => setEnabled(readEnabled()), []);
  const track = enabled ? trackFor(view) : null;

  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YtPlayer | null>(null);
  const ready = useRef(false);
  // track ล่าสุด ให้ callback ของ player (สร้างครั้งเดียว) อ่านค่าปัจจุบันได้
  const current = useRef<Track | null>(track);
  current.current = track;
  // เพลงที่ player กำลังเล่นอยู่
  const shown = useRef<Track | null>(null);

  // สร้าง player ครั้งแรกที่มีเพลงให้เล่น แล้วใช้ตัวเดิมตลอด
  const needed = enabled && track !== null;
  useEffect(() => {
    if (!needed || player.current || !host.current) return;
    let cancelled = false;
    const mount = document.createElement('div');
    host.current.appendChild(mount);
    void loadApi().then((YT) => {
      if (cancelled) return;
      const first = current.current;
      player.current = new YT.Player(mount, {
        width: '100%',
        height: '100%',
        videoId: first ? TRACKS[first].videoId : '',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady() {
            ready.current = true;
            const p = player.current;
            const now = current.current;
            shown.current = now;
            p?.setVolume(70);
            // ช่วงเปลี่ยนระหว่างโหลด player
            if (now && now !== first) p?.loadVideoById(TRACKS[now].videoId);
            else if (now) p?.playVideo();
            else p?.stopVideo();
          },
          onStateChange(event) {
            const now = current.current;
            if (event.data === YT.PlayerState.ENDED && now && TRACKS[now].loop) {
              player.current?.seekTo(0, true);
              player.current?.playVideo();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [needed]);

  // เปลี่ยนช่วง = เปลี่ยนเพลง หรือหยุด
  useEffect(() => {
    const p = player.current;
    if (!p || !ready.current || shown.current === track) return;
    shown.current = track;
    if (track) p.loadVideoById(TRACKS[track].videoId);
    else p.stopVideo();
  }, [track]);

  useEffect(
    () => () => {
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    saveEnabled(next);
  }

  return (
    <section data-testid="music" className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">
          🎵 {m.music.title}
          <span className="ml-1 font-normal text-muted-foreground">
            · {track ? m.music.tracks[track] : m.music.silent}
          </span>
        </p>
        <Button size="sm" variant="outline" onClick={toggle}>
          {enabled ? m.music.off : m.music.on}
        </Button>
      </div>
      {/* ตัวเล่นต้องมองเห็นได้ขณะเล่น (เงื่อนไขของ YouTube) ซ่อนเมื่อไม่มีเพลง */}
      <div
        ref={host}
        className={cn(
          'aspect-video w-full max-w-xs overflow-hidden rounded-lg bg-black',
          !track && 'hidden',
        )}
      />
    </section>
  );
}
