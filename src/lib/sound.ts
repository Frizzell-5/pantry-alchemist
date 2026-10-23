import { getState } from "./store.ts";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture (e.g. starting a timer) so iOS lets us play later. */
export function unlockAudio() {
  audio();
}

function tone(freq: number, start: number, dur: number, gain = 0.25, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  osc.connect(g).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + dur + 0.05);
}

/** A kitchen-timer "ding-ding-ding" that's hard to miss. */
export function playTimerDone() {
  for (let rep = 0; rep < 3; rep++) {
    const t = rep * 0.9;
    tone(1046.5, t, 0.6, 0.3, "triangle");
    tone(1318.5, t + 0.18, 0.6, 0.25, "triangle");
    tone(1568, t + 0.36, 0.8, 0.2, "triangle");
  }
  navigator.vibrate?.([300, 120, 300, 120, 500]);
}

export function playPop() {
  if (!getState().settings.sound) return;
  tone(660, 0, 0.09, 0.08, "sine");
  tone(990, 0.04, 0.08, 0.05, "sine");
}

export function playSpinTick() {
  if (!getState().settings.sound) return;
  tone(1400, 0, 0.03, 0.04, "square");
}

export function playFanfare() {
  if (!getState().settings.sound) return;
  [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.35, 0.15, "triangle"));
}
