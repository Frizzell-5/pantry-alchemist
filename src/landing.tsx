import { StrictMode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { SEED_RECIPES } from "./data/recipes.ts";
import { RecipeArt } from "./lib/art.tsx";
import { registerServiceWorker, useInstall } from "./lib/install.ts";
import "./styles.css";
import "./landing.css";

const REPO = "https://github.com/Frizzell-5/pantry-alchemist";
const recipe = (id: string) => SEED_RECIPES.find((r) => r.id === id)!;

const PHRASES = ["potatoes & random stuff", "three sad eggs", "half an onion & rice", "that jar of gochujang", "a can of beans & hope"];
const DEMO_CHIPS = ["Potatoes", "Eggs", "Onion", "Cheddar", "Rice", "Gochujang", "Tortillas", "Butter"];
const MARQUEE = ["potatoes", "eggs", "rice", "cheddar", "gochujang", "tortillas", "black beans", "garlic", "frozen peas", "pasta", "lemons", "soy sauce", "feta", "spinach", "peanut butter", "canned tomatoes"];
const FLOATERS = ["shakshuka", "egg-fried-rice", "peanut-noodles", "mug-brownie", "black-bean-quesadillas", "chickpea-coconut-curry"];
const GALLERY = ["skillet-smashed-potatoes", "aglio-e-olio", "crispy-tofu-bowl", "burrito-bowl", "banana-oat-pancakes", "lentil-soup", "tomato-egg-stir-fry", "honey-garlic-chicken"];

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { threshold: 0.15 },
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useScrollVar() {
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => document.documentElement.style.setProperty("--sy", String(window.scrollY)));
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
}

function RotatingPhrase() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="rotator" aria-live="polite">
      <span key={i} className="rotator-word"><span>{PHRASES[i]}</span></span>
    </span>
  );
}

/** A looping, self-playing mini version of the app inside a phone frame. */
function PhoneDemo() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((n) => (n + 1) % 26), 520);
    return () => clearInterval(id);
  }, []);
  const checked = Math.min(DEMO_CHIPS.length, Math.max(0, t - 1));
  const scene = t < 11 ? "pantry" : t < 18 ? "match" : "cook";
  const timerLeft = Math.max(0, 300 - (t - 18) * 37);
  return (
    <div className="phone" aria-hidden>
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="demo-top"><img className="demo-logo" src="/favicon.svg" alt="" width="16" height="16" /> Pantry <em>Alchemist</em></div>
        {scene === "pantry" && (
          <div className="demo-scene" key="p">
            <p className="demo-h">What's in your kitchen?</p>
            <div className="demo-chips">
              {DEMO_CHIPS.map((c, i) => (
                <span key={c} className={`demo-chip ${i < checked ? "on" : ""}`}><i>{i < checked ? "✓" : ""}</i>{c}</span>
              ))}
            </div>
            <div className="demo-cta">See what I can cook <b>{[0, 0, 1, 2, 3, 5, 6, 8, 11][checked]} ready →</b></div>
          </div>
        )}
        {scene === "match" && (
          <div className="demo-scene" key="m">
            <p className="demo-h">You can make <span>11</span> things</p>
            {["skillet-smashed-potatoes", "potato-egg-hash", "egg-fried-rice"].map((id, i) => (
              <div key={id} className="demo-card" style={{ animationDelay: `${i * 120}ms` }}>
                <div className="demo-art"><RecipeArt recipe={recipe(id)} /></div>
                <div>
                  <b>{recipe(id).title}</b>
                  <small>⏱ {recipe(id).time} min · you have {[6, 7, 7][i]}/{[6, 7, 7][i]}</small>
                </div>
              </div>
            ))}
          </div>
        )}
        {scene === "cook" && (
          <div className="demo-scene demo-cook" key="c">
            <p className="demo-step">Step 4 <span>of 6</span></p>
            <p className="demo-big">Fry without touching until <mark>deeply golden</mark>, then flip.</p>
            <div className="demo-timer">
              <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><circle cx="18" cy="18" r="15" className="p" style={{ strokeDasharray: `${(1 - timerLeft / 300) * 94} 94` }} /></svg>
              <span>{Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, "0")}</span>
            </div>
            <div className="demo-next">Next →</div>
          </div>
        )}
      </div>
    </div>
  );
}

function InstallButton({ big = false }: { big?: boolean }) {
  const install = useInstall();
  const [help, setHelp] = useState(false);
  const [done, setDone] = useState(false);

  if (install.standalone || done) {
    return <a className={`btn btn-primary ${big ? "big" : ""}`} href="/app">Open Pantry Alchemist →</a>;
  }
  return (
    <>
      <button
        className={`btn btn-primary install-btn ${big ? "big" : ""}`}
        onClick={async () => {
          if (install.canPrompt) setDone(await install.prompt());
          else setHelp(true);
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Install the app
      </button>
      {/* Portaled: the animated hero creates a containing block that would trap position: fixed. */}
      {help && createPortal(<InstallHelp platform={install.platform} onClose={() => setHelp(false)} />, document.body)}
    </>
  );
}

function InstallHelp({ platform, onClose }: { platform: ReturnType<typeof useInstall>["platform"]; onClose: () => void }) {
  const steps =
    platform === "ios"
      ? [["Open this page in Safari", "Other iPhone browsers can't install web apps."], ["Tap the Share button", "The square with an arrow, at the bottom of Safari."], ["Choose “Add to Home Screen”", "Scroll down the share sheet if you don't see it."], ["Tap “Add”", "Pantry Alchemist lands on your home screen and opens full-screen."]]
      : platform === "android"
        ? [["Open the browser menu", "The ⋮ in Chrome's top-right corner."], ["Tap “Install app” or “Add to Home screen”", ""], ["Confirm", "It opens full-screen from your app drawer, even offline."]]
        : [["Look for the install icon", "Chrome & Edge show a little monitor-with-arrow in the address bar."], ["Click “Install”", "It opens in its own window, like a native app."], ["On Safari (Mac)", "File → Add to Dock."]];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet install-sheet" role="dialog" aria-label="How to install" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="display">Install in {steps.length} taps</h2>
        <ol className="install-steps">
          {steps.map(([title, detail], i) => (
            <li key={i}><span className="step-n">{i + 1}</span><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span></li>
          ))}
        </ol>
        <div className="action-row">
          <a className="btn btn-ghost" href="/app">Just open it in the browser</a>
          <button className="btn btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { emoji: "🧺", title: "Tap what you've got", body: "~150 ingredients across 9 shelves, a search bar, quick-add for the weird stuff, and “running low” flags. It remembers everything." },
  { emoji: "🔎", title: "Search 800+ dishes", body: "Craving something specific? Search dishes from 40+ cuisines, with photos. Each one shows what you already have and the exact list of what to buy." },
  { emoji: "💾", title: "Never loses your stuff", body: "Pantry, saved recipes, notes, badges, even the step you were on in cook mode: all saved on your phone, there when you come back. Back up with one tap." },
  { emoji: "🎯", title: "Ranked by what you'd have to buy", body: "Every card says “you have 8/9” and exactly what's missing. Usually nothing." },
  { emoji: "🔁", title: "Swaps from your own shelf", body: "No butter? Use ¾ the olive oil. No lemon? Half as much vinegar. Suggested automatically." },
  { emoji: "✨", title: "AI alchemy", body: "Claude invents brand-new recipes from your exact pantry, or writes any dish you search for that isn't in the library. Checked and validated before you see them." },
  { emoji: "🔥", title: "Cook mode for a propped-up phone", body: "One giant step at a time, amounts inline, several timers with a loud ding, and the screen stays awake." },
  { emoji: "📖", title: "Your own printable cookbook", body: "Save, rate, scribble notes, then export a designed PDF with your name on the cover and chapters by meal." },
];

const GAMES = [
  { emoji: "🎡", title: "Fridge Roulette", body: "Can't decide? Spin a wheel of things you can make right now." },
  { emoji: "🌀", title: "Chaos Mode", body: "Pick three weird things to use up. Get a real dish built around them." },
  { emoji: "♻️", title: "Leftover Remix", body: "Tell it what's left after dinner; get tomorrow's lunch, not a sad reheat." },
  { emoji: "🧣", title: "Mood picker", body: "Cozy, need energy, lazy, impress someone, broke. Suggestions change to match." },
];

function Landing() {
  useReveal();
  useScrollVar();
  const heroRef = useRef<HTMLDivElement>(null);

  return (
    <div className="landing">
      <nav className="lnav">
        <a href="/" className="brand"><img className="brand-mark" src="/favicon.svg" alt="" width="34" height="34" /><span className="display">Pantry <em>Alchemist</em></span></a>
        <div className="lnav-links">
          <a href="#features">Features</a>
          <a href="#install">Install</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a className="btn btn-ghost lnav-open" href="/app">Open app</a>
        </div>
      </nav>

      <header className="hero" ref={heroRef}>
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
        {FLOATERS.map((id, i) => (
          <div key={id} className={`floater f${i}`}><RecipeArt recipe={recipe(id)} /></div>
        ))}
        <div className="hero-copy">
          <p className="hero-pill">Free · Works offline · No account · Made for tiny kitchens</p>
          <h1 className="display hero-title">
            Turn <RotatingPhrase /> into dinner.
          </h1>
          <p className="hero-sub">Check off what's actually in your kitchen. Pantry Alchemist finds what you can cook <em>right now</em>, walks you through it on your phone, and builds a cookbook that's yours.</p>
          <div className="hero-ctas">
            <InstallButton big />
            <a className="btn btn-ghost big" href="/app">Open in browser</a>
          </div>
          <p className="hero-note hand">↑ works on iPhone, Android & laptop</p>
        </div>
        <div className="hero-demo"><PhoneDemo /></div>
      </header>

      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>✓ {m}</span>)}
        </div>
      </div>

      <section className="lsection how">
        <p className="eyebrow reveal">How it works</p>
        <h2 className="display reveal">Three taps from “nothing to eat” to dinner.</h2>
        <div className="how-grid">
          {[
            ["Check it off", "Tap the ingredients you have. Flag what's running low."],
            ["Get matched", "Recipes ranked by fewest extra ingredients, with swaps for the gaps."],
            ["Cook it", "Full-screen steps, inline amounts, timers that actually ring."],
          ].map(([t, b], i) => (
            <div key={t} className="how-card reveal" style={{ transitionDelay: `${i * 120}ms` }}>
              <span className="how-n hand">{i + 1}</span>
              <h3 className="display">{t}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lsection" id="features">
        <p className="eyebrow reveal">The good stuff</p>
        <h2 className="display reveal">Everything a broke, busy cook needs. Nothing they don't.</h2>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <article key={f.title} className="feature reveal" style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
              <span className="feature-emoji" aria-hidden>{f.emoji}</span>
              <h3 className="display">{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lsection games">
        <div className="games-copy">
          <p className="eyebrow reveal">Play with your food</p>
          <h2 className="display reveal">Deciding what to eat should be the fun part.</h2>
          <div className="games-list">
            {GAMES.map((g, i) => (
              <div key={g.title} className="game reveal" style={{ transitionDelay: `${i * 90}ms` }}>
                <span aria-hidden>{g.emoji}</span>
                <div><strong>{g.title}</strong><p>{g.body}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="mini-wheel reveal" aria-hidden>
          <svg viewBox="0 0 200 200">
            {Array.from({ length: 8 }, (_, i) => {
              const a0 = (i * 45 * Math.PI) / 180, a1 = ((i + 1) * 45 * Math.PI) / 180;
              return <path key={i} d={`M100,100 L${100 + 90 * Math.sin(a0)},${100 - 90 * Math.cos(a0)} A90,90 0 0 1 ${100 + 90 * Math.sin(a1)},${100 - 90 * Math.cos(a1)} Z`} fill={["#c8553d", "#f2c6b4", "#e9a23b", "#cfe0c3", "#588b8b", "#ffe8a3", "#7d5a8c", "#f6bd60"][i]} stroke="#2b1d14" strokeWidth="2" />;
            })}
            <circle cx="100" cy="100" r="18" fill="#fbf3e4" stroke="#2b1d14" strokeWidth="3" />
          </svg>
          <span className="mini-pointer">▼</span>
        </div>
      </section>

      <section className="lsection gallery-sec">
        <p className="eyebrow reveal">Hand-made feel, zero stock photos</p>
        <h2 className="display reveal">Every recipe gets its own little illustration.</h2>
        <div className="gallery">
          {GALLERY.map((id, i) => (
            <figure key={id} className="tile reveal" style={{ transitionDelay: `${i * 60}ms`, ["--r" as string]: `${((i * 53) % 9) - 4}deg` }}>
              <RecipeArt recipe={recipe(id)} />
              <figcaption className="hand">{recipe(id).title}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="lsection install-sec" id="install">
        <div className="install-card reveal">
          <div className="install-icon" aria-hidden><img src="/icons/icon-192.png" alt="" width="96" height="96" /></div>
          <h2 className="display">Put it on your home screen.</h2>
          <p>It installs like a real app: its own icon, full-screen, and it works offline in the kitchen. No app store, no account, no ads.</p>
          <div className="hero-ctas center"><InstallButton big /><a className="btn btn-ghost big" href="/app">Use it in the browser</a></div>
          <div className="platforms">
            <span>📱 iPhone: Share → Add to Home Screen</span>
            <span>🤖 Android: Install app</span>
            <span>💻 Laptop: install icon in the address bar</span>
          </div>
        </div>
      </section>

      <footer className="lfoot">
        <span className="display">Pantry <em>Alchemist</em></span>
        <span className="muted">Made for tiny kitchens and big appetites.</span>
        <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub ↗</a>
      </footer>
    </div>
  );
}

// Installed users skip the brochure and land in the app.
if (matchMedia("(display-mode: standalone)").matches) location.replace("/app");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);
registerServiceWorker();
