'use client';

import { play } from '@batonboard/ui';
import { useEffect, useRef } from 'react';
import type { BossView } from '../rules/types';
import { EVENT_CUE, eventsBetween } from './events';

/** เล่นเสียง/สั่นเมื่อ view ใหม่มีเหตุการณ์ (สูงสุด 2 เสียงต่อครั้ง เว้นช่วงไม่ให้ทับกัน) */
export function useGameSounds(view: BossView): void {
  const prev = useRef<BossView | null>(null);
  useEffect(() => {
    const cues = [...new Set(eventsBetween(prev.current, view).map((e) => EVENT_CUE[e]))];
    prev.current = view;
    const timers = cues.slice(0, 2).map((cue, i) => setTimeout(() => play(cue), i * 450));
    return () => timers.forEach(clearTimeout);
  }, [view]);
}
