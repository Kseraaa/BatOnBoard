'use client';

/**
 * เสียงและการสั่นที่ทุกเกมใช้ร่วมกัน
 * - เสียงสังเคราะห์ด้วย Web Audio (ไม่มีไฟล์เสียงให้โหลด) การสั่นใช้ `navigator.vibrate` (Android; iOS ไม่มี)
 * - ปิด/เปิดที่เดียวทั้งแพลตฟอร์ม จำไว้ใน localStorage `batonboard:sound`
 * - เบราว์เซอร์ยอมให้เล่นเสียงหลังผู้ใช้แตะจอครั้งแรกเท่านั้น `useFeedback` จึงปลุก AudioContext ตอนแตะครั้งแรก
 */
import { useEffect, useSyncExternalStore } from 'react';

export type Cue = 'tap' | 'dice' | 'coins' | 'alert' | 'turn' | 'win' | 'lose';

type Note = [freq: number, at: number, dur: number, wave?: OscillatorType];

const CUES: Record<Cue, { notes: Note[]; vibrate: number | number[] }> = {
  tap: { notes: [[660, 0, 0.05, 'triangle']], vibrate: 10 },
  dice: {
    notes: [
      [320, 0, 0.03, 'square'],
      [440, 0.07, 0.03, 'square'],
      [360, 0.15, 0.03, 'square'],
      [520, 0.24, 0.03, 'square'],
      [400, 0.34, 0.04, 'square'],
    ],
    vibrate: [15, 50, 15, 60, 25],
  },
  coins: {
    notes: [
      [1319, 0, 0.08, 'triangle'],
      [1760, 0.08, 0.1, 'triangle'],
      [2093, 0.18, 0.22, 'triangle'],
    ],
    vibrate: [30, 30, 60],
  },
  alert: {
    notes: [
      [880, 0, 0.12, 'square'],
      [660, 0.15, 0.14, 'square'],
    ],
    vibrate: [80, 50, 80],
  },
  turn: {
    notes: [
      [523, 0, 0.1],
      [784, 0.1, 0.2],
    ],
    vibrate: 40,
  },
  win: {
    notes: [
      [523, 0, 0.12],
      [659, 0.12, 0.12],
      [784, 0.24, 0.12],
      [1047, 0.36, 0.45],
    ],
    vibrate: [60, 40, 60, 40, 160],
  },
  lose: {
    notes: [
      [392, 0, 0.22],
      [311, 0.22, 0.35],
    ],
    vibrate: 70,
  },
};

const KEY = 'batonboard:sound';
const listeners = new Set<() => void>();
let audio: AudioContext | null = null;

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return typeof window === 'undefined' ? true : readMuted();
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? 'off' : 'on');
  } catch {
    // จำไม่ได้ก็ใช้ได้เฉพาะหน้านี้
  }
  for (const l of listeners) l();
}

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audio === null) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  return audio;
}

/** เล่นเสียงและสั่นตาม cue (ไม่ทำอะไรถ้าปิดไว้ หรือเบราว์เซอร์ไม่รองรับ) */
export function play(cue: Cue): void {
  if (isMuted()) return;
  const { notes, vibrate } = CUES[cue];
  try {
    navigator.vibrate?.(vibrate);
  } catch {
    // บางเบราว์เซอร์โยน error ถ้ายังไม่มีการแตะจอ
  }
  const ctx = context();
  if (ctx === null || ctx.state !== 'running') return;
  const start = ctx.currentTime + 0.01;
  for (const [freq, at, dur, wave = 'sine'] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    // ขึ้นเร็วลงนุ่ม ไม่ให้มีเสียงคลิก
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.12, start + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + dur + 0.02);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** สถานะปิดเสียง + ปลุกเสียงตอนแตะจอครั้งแรก */
export function useFeedback(): { muted: boolean; toggle(): void } {
  const muted = useSyncExternalStore(subscribe, readMuted, () => true);
  useEffect(() => {
    const unlock = () => context();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  return {
    muted,
    toggle() {
      setMuted(!muted);
      // เปิดเสียงด้วยการแตะ = ได้ยินทันทีว่าเปิดแล้ว
      if (muted) {
        context();
        play('tap');
      }
    },
  };
}
