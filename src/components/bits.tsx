import { useMemo } from "react";
import { actions, useStore } from "../lib/store.ts";

export function Confetti({ count = 18 }: { count?: number }) {
  const bits = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      dx: (Math.random() - 0.5) * 160,
      rot: Math.random() * 720 - 360,
      color: ["var(--accent)", "var(--mustard)", "var(--sage)", "var(--plum)"][i % 4],
    })),
    [count],
  );
  return (
    <span className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, background: b.color, ["--dx" as string]: `${b.dx}px`, ["--rot" as string]: `${b.rot}deg` }} />
      ))}
    </span>
  );
}

export function Stars({ value, onChange, size = 26 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="stars" role={onChange ? "radiogroup" : undefined} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role={onChange ? "radio" : undefined}
          aria-checked={onChange ? value === n : undefined}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={!onChange}
          className={n <= value ? "on" : ""}
          onClick={() => onChange?.(value === n ? 0 : n)}
          style={{ fontSize: size }}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export function ServingsStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper" aria-label="Servings">
      <button aria-label="Fewer servings" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>−</button>
      <span><strong>{value}</strong> {value === 1 ? "serving" : "servings"}</span>
      <button aria-label="More servings" onClick={() => onChange(Math.min(24, value + 1))}>+</button>
    </div>
  );
}

export function UnitToggle() {
  const units = useStore((s) => s.settings.units);
  return (
    <div className="segmented small" role="group" aria-label="Units">
      <button className={units === "us" ? "on" : ""} onClick={() => actions.setSettings({ units: "us" })}>US</button>
      <button className={units === "metric" ? "on" : ""} onClick={() => actions.setSettings({ units: "metric" })}>Metric</button>
    </div>
  );
}

/** A row of little jars: filled for ingredients you have. */
export function HaveMeter({ have, total }: { have: number; total: number }) {
  return (
    <span className="meter" aria-label={`You have ${have} of ${total} ingredients`}>
      <span className="meter-dots" aria-hidden>
        {Array.from({ length: Math.min(total, 14) }, (_, i) => <i key={i} className={i < Math.round((have / total) * Math.min(total, 14)) ? "on" : ""} />)}
      </span>
      <span className="meter-label">you have <strong>{have}/{total}</strong></span>
    </span>
  );
}

export function Cauldron({ label }: { label: string }) {
  return (
    <div className="cauldron" role="status">
      <svg viewBox="0 0 120 110" width="120" aria-hidden>
        <g className="bubbles">
          <circle cx="45" cy="40" r="6" /><circle cx="62" cy="34" r="8" /><circle cx="78" cy="42" r="5" /><circle cx="55" cy="22" r="4" /><circle cx="72" cy="18" r="3" />
        </g>
        <ellipse cx="60" cy="52" rx="40" ry="8" fill="var(--sage)" />
        <path d="M18 52h84c0 26-16 44-42 44S18 78 18 52z" fill="var(--ink)" />
        <path d="M30 96l-6 10M90 96l6 10" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
        <path d="M40 62c4 10 10 16 20 18" stroke="var(--paper)" strokeWidth="3" fill="none" opacity=".35" strokeLinecap="round" />
      </svg>
      <p className="hand">{label}</p>
    </div>
  );
}

export const difficultyLabel = { easy: "Easy", medium: "Medium", hard: "Ambitious" } as const;

export const MOOD_META = {
  cozy: { emoji: "🧣", label: "Cozy" },
  energy: { emoji: "⚡", label: "Need energy" },
  lazy: { emoji: "🛋️", label: "Lazy" },
  impress: { emoji: "✨", label: "Impress someone" },
  broke: { emoji: "🪙", label: "Broke" },
} as const;

export const SOURCE_BADGE: Record<string, string> = { ai: "✦ AI original", chaos: "🌀 Chaos creation", remix: "♻️ Leftover remix", offline: "📦 Pantry template", library: "🌍 World library", seed: "" };
