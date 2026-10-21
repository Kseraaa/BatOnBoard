'use client';

import { play } from '@batonboard/ui';
import type { Cue } from '@batonboard/ui';
import { useEffect, useRef, useState } from 'react';
import type { SpyfallView } from '../rules/types';
import { EVENT_CUE, eventsBetween, RESULT_EVENTS } from './events';

/**
 * เล่นเสียง/สั่นเมื่อ view ใหม่มีเหตุการณ์
 * เสียงผลชนะ/แพ้ไม่เล่นทันที แต่คืนเป็น `resultCue` ให้ฉากเฉลยเล่นตอนเปิดผล
 */
export function useGameSounds(view: SpyfallView): Cue | null {
  const prev = useRef<SpyfallView | null>(null);
  const [resultCue, setResultCue] = useState<Cue | null>(null);
  useEffect(() => {
    const events = eventsBetween(prev.current, view);
    prev.current = view;
    const result = events.find((e) => RESULT_EVENTS.includes(e));
    if (result) setResultCue(EVENT_CUE[result]);
    else if (view.phase !== 'reveal') setResultCue(null);
    const cue = events.find((e) => !RESULT_EVENTS.includes(e));
    if (cue) play(EVENT_CUE[cue]);
  }, [view]);
  return resultCue;
}
