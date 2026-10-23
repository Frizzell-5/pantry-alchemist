import { useSyncExternalStore } from "react";
import { playTimerDone } from "./sound.ts";

// Kitchen timers live outside React so they keep running while you swipe
// between steps (or leave cook mode to check something).

export interface Timer {
  id: number;
  label: string;
  recipeId: string;
  total: number;
  /** Epoch ms when it ends; null while paused. */
  endsAt: number | null;
  /** Seconds left, frozen while paused. */
  remaining: number;
  done: boolean;
}

let timers: Timer[] = [];
let seq = 0;
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function emit() {
  timers = [...timers];
  listeners.forEach((l) => l());
}

function tick() {
  const now = Date.now();
  let changed = false;
  for (const t of timers) {
    if (t.endsAt && !t.done) {
      const rem = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
      if (rem !== t.remaining) {
        t.remaining = rem;
        changed = true;
      }
      if (rem === 0) {
        t.done = true;
        t.endsAt = null;
        changed = true;
        playTimerDone();
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
          new Notification("⏰ Timer done", { body: t.label });
        }
      }
    }
  }
  if (changed) emit();
  if (!timers.some((t) => t.endsAt) && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function ensureTicker() {
  ticker ??= setInterval(tick, 250);
}

export const timerActions = {
  start(label: string, seconds: number, recipeId: string) {
    timers.push({ id: ++seq, label, recipeId, total: seconds, remaining: seconds, endsAt: Date.now() + seconds * 1000, done: false });
    ensureTicker();
    emit();
  },
  toggle(id: number) {
    const t = timers.find((x) => x.id === id);
    if (!t || t.done) return;
    if (t.endsAt) {
      t.remaining = Math.ceil((t.endsAt - Date.now()) / 1000);
      t.endsAt = null;
    } else {
      t.endsAt = Date.now() + t.remaining * 1000;
      ensureTicker();
    }
    emit();
  },
  add(id: number, seconds: number) {
    const t = timers.find((x) => x.id === id);
    if (!t) return;
    if (t.done) {
      t.done = false;
      t.remaining = seconds;
      t.endsAt = Date.now() + seconds * 1000;
    } else if (t.endsAt) t.endsAt += seconds * 1000;
    else t.remaining += seconds;
    t.total += seconds;
    ensureTicker();
    emit();
  },
  remove(id: number) {
    timers = timers.filter((t) => t.id !== id);
    emit();
  },
};

export const useTimers = () => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => timers);

export const fmtClock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
