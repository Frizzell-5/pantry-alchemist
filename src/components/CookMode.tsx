import { useEffect, useRef, useState } from "react";
import { go, useWakeLock } from "../lib/hooks.ts";
import { playFanfare, unlockAudio } from "../lib/sound.ts";
import { actions, getState, useStore } from "../lib/store.ts";
import { fmtClock, timerActions, useTimers } from "../lib/timers.ts";
import type { Recipe } from "../lib/types.ts";
import { formatIngredient, renderStep } from "../lib/units.ts";
import { Confetti, Stars } from "./bits.tsx";
import { StepText } from "./RecipeDetail.tsx";

export const LEFTOVER_KEY = "pantry-alchemist:leftovers";

function TimerTray({ recipeId }: { recipeId: string }) {
  const timers = useTimers();
  if (!timers.length) return null;
  return (
    <div className="timer-tray" aria-label="Running timers">
      {timers.map((t) => {
        const pct = t.total ? 1 - t.remaining / t.total : 1;
        return (
          <div key={t.id} className={`timer ${t.done ? "ringing" : ""} ${!t.endsAt && !t.done ? "paused" : ""} ${t.recipeId !== recipeId ? "other" : ""}`}>
            <svg viewBox="0 0 36 36" className="ring" aria-hidden>
              <circle cx="18" cy="18" r="15" />
              <circle cx="18" cy="18" r="15" className="prog" style={{ strokeDasharray: `${pct * 94.2} 94.2` }} />
            </svg>
            <button className="timer-main" onClick={() => timerActions.toggle(t.id)} aria-label={t.endsAt ? `Pause ${t.label}` : `Resume ${t.label}`}>
              <span className="timer-time">{t.done ? "Done!" : fmtClock(t.remaining)}</span>
              <span className="timer-label">{t.label}{!t.endsAt && !t.done ? " · paused" : ""}</span>
            </button>
            <button className="timer-mini" onClick={() => timerActions.add(t.id, 60)} aria-label="Add a minute">+1m</button>
            <button className="timer-mini" onClick={() => timerActions.remove(t.id)} aria-label="Dismiss timer">×</button>
          </div>
        );
      })}
    </div>
  );
}

function FinishScreen({ recipe, onBack }: { recipe: Recipe; onBack: () => void }) {
  const entry = useStore((s) => s.cookbook[recipe.id]);
  const [left, setLeft] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const candidates = recipe.ingredients.filter((i) => !["salt", "black_pepper"].includes(i.ref ?? "") && i.unit !== "to taste");

  const remix = () => {
    const items = [...left, ...extra.split(",").map((s) => s.trim()).filter(Boolean)];
    try {
      sessionStorage.setItem(LEFTOVER_KEY, JSON.stringify({ items, from: recipe.title }));
    } catch { /* storage blocked: the leftovers page still opens */ }
    go("play/leftovers");
  };

  return (
    <div className="finish">
      <Confetti count={40} />
      <p className="eyebrow">Dish complete</p>
      <h1 className="display">You made {recipe.title}!</h1>
      <div className="card-paper">
        <h2 className="hand">How was it?</h2>
        <Stars
          value={entry?.rating ?? 0}
          size={40}
          onChange={(rating) => actions.updateEntry(recipe.id, { rating, cookedCount: Math.max(1, entry?.cookedCount ?? 1), lastCooked: Date.now() })}
        />
        <textarea
          className="hand-input"
          placeholder="Notes for next time…"
          value={entry?.notes ?? ""}
          onChange={(e) => actions.updateEntry(recipe.id, { notes: e.target.value, cookedCount: Math.max(1, entry?.cookedCount ?? 1) })}
          rows={2}
        />
        <p className="muted small">{entry ? "Saved to your cookbook ✓" : "Rating or a note saves it to your cookbook."}</p>
      </div>

      <div className="card-paper leftovers">
        <h2 className="hand">Anything left over?</h2>
        <div className="chips">
          {candidates.map((i) => {
            const label = (i.ref === "rice" ? "cooked rice" : i.name);
            const on = left.includes(label);
            return (
              <div key={i.key} className={`chip-wrap ${on ? "have" : ""}`}>
                <button className="chip" aria-pressed={on} onClick={() => setLeft((l) => (on ? l.filter((x) => x !== label) : [...l, label]))}>
                  <span className="check" aria-hidden><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg></span>
                  <span className="chip-label">{label}</span>
                </button>
              </div>
            );
          })}
        </div>
        <input className="text-input" placeholder={`Or type it: "half the ${recipe.title.toLowerCase()}"`} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <button className="btn btn-primary wide" disabled={!left.length && !extra.trim()} onClick={remix}>♻️ Plan tomorrow's remix</button>
      </div>

      <div className="action-row center">
        <button className="btn btn-ghost" onClick={onBack}>← Back to steps</button>
        <a className="btn btn-ghost" href="#/recipes">Done</a>
      </div>
    </div>
  );
}

export function CookMode({ recipe, servings }: { recipe: Recipe; servings?: number }) {
  const units = useStore((s) => s.settings.units);
  const total = recipe.steps.length;
  // Pick up where you left off if you closed the app mid-recipe (within 12 hours).
  const [step, setStep] = useState(() => {
    const p = getState().cookProgress;
    return p && p.recipeId === recipe.id && Date.now() - p.at < 12 * 3600_000 && p.step < total ? p.step : 0;
  });
  const [showIngs, setShowIngs] = useState(false);
  const [prepped, setPrepped] = useState<Set<string>>(new Set());
  const [dir, setDir] = useState<"next" | "prev">("next");
  const logged = useRef(false);
  const wake = useWakeLock(true);
  const factor = (servings ?? recipe.servings) / recipe.servings;
  const finished = step >= total;
  const timers = useTimers();

  const goTo = (n: number) => {
    setDir(n > step ? "next" : "prev");
    setStep(Math.max(0, Math.min(total, n)));
  };

  useEffect(() => {
    if (!finished) actions.setCookProgress({ recipeId: recipe.id, step, servings: servings ?? recipe.servings, at: Date.now() });
  }, [step, finished, recipe, servings]);

  useEffect(() => {
    if (finished && !logged.current) {
      logged.current = true;
      actions.logCook(recipe);
      playFanfare();
    }
  }, [finished, recipe]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input")) return;
      if (e.key === "ArrowRight" || e.key === " ") goTo(step + 1);
      if (e.key === "ArrowLeft") goTo(step - 1);
      if (e.key === "Escape") go(`recipe/${recipe.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(step + (dx < 0 ? 1 : -1));
    touch.current = null;
  };

  const current = recipe.steps[step];
  const ringing = timers.some((t) => t.done);

  return (
    <div className={`cook-mode ${ringing ? "alarm" : ""}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="cook-top">
        <button className="icon-btn" onClick={() => go(`recipe/${recipe.id}`)} aria-label="Exit cook mode">✕</button>
        <div className="cook-title">
          <span className="hand">{recipe.title}</span>
          <span className="muted small">{wake.locked ? "☀︎ screen stays awake" : wake.supported ? "" : "tip: turn off auto-lock while cooking"}</span>
        </div>
        <button className={`icon-btn ${showIngs ? "on" : ""}`} onClick={() => setShowIngs((v) => !v)} aria-expanded={showIngs} aria-label="Ingredients">🧺</button>
      </header>

      <div className="progress" aria-hidden>
        {recipe.steps.map((_, i) => <button key={i} className={i < step ? "done" : i === step ? "now" : ""} onClick={() => goTo(i)} tabIndex={-1} />)}
      </div>

      {showIngs && (
        <aside className="ing-drawer">
          <h2 className="hand">Mise en place</h2>
          <ul>
            {recipe.ingredients.map((i) => {
              const f = formatIngredient(i, factor, units);
              const on = prepped.has(i.key);
              return (
                <li key={i.key}>
                  <label className={on ? "struck" : ""}>
                    <input type="checkbox" checked={on} onChange={() => setPrepped((p) => { const n = new Set(p); n.has(i.key) ? n.delete(i.key) : n.add(i.key); return n; })} />
                    <span>{f.text}{i.optional ? " (optional)" : ""}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      <main className="cook-stage">
        {finished ? (
          <FinishScreen recipe={recipe} onBack={() => goTo(total - 1)} />
        ) : (
          <div className={`step-card slide-${dir}`} key={step}>
            <p className="step-num">Step {step + 1} <span>of {total}</span></p>
            <p className="step-text"><StepText parts={renderStep(current, recipe, factor, units)} /></p>
            <div className="step-actions">
              {current.timer && (
                <button
                  className="btn btn-timer"
                  onClick={() => {
                    unlockAudio();
                    timerActions.start(current.timer!.label, current.timer!.seconds, recipe.id);
                    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
                  }}
                >
                  ⏱ Start {fmtClock(current.timer.seconds)} timer
                </button>
              )}
              <details className="quick-timer">
                <summary>+ quick timer</summary>
                {[1, 3, 5, 10].map((m) => (
                  <button key={m} className="pill" onClick={() => { unlockAudio(); timerActions.start(`${m} min timer`, m * 60, recipe.id); }}>{m} min</button>
                ))}
              </details>
            </div>
          </div>
        )}
      </main>

      <TimerTray recipeId={recipe.id} />

      {!finished && (
        <footer className="cook-nav">
          <button className="btn btn-ghost big" onClick={() => goTo(step - 1)} disabled={step === 0}>← Back</button>
          <button className="btn btn-primary big" onClick={() => goTo(step + 1)}>{step === total - 1 ? "Finish 🎉" : "Next →"}</button>
        </footer>
      )}
    </div>
  );
}
