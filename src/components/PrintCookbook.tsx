import { useEffect } from "react";
import { RecipeArt, paletteFor } from "../lib/art.tsx";
import { dietOf } from "../lib/match.ts";
import { useStore } from "../lib/store.ts";
import { formatIngredient, renderStep } from "../lib/units.ts";
import { difficultyLabel } from "./bits.tsx";
import { CHAPTERS, cookbookRecipes } from "./CookbookView.tsx";
import { StepText } from "./RecipeDetail.tsx";

export function PrintCookbook() {
  const settings = useStore((s) => s.settings);
  const cookbook = useStore((s) => s.cookbook);
  const chapters = cookbookRecipes();
  const numbered = chapters.flatMap((c) => c.recipes);
  const num = (id: string) => String(numbered.findIndex((r) => r.id === id) + 1).padStart(2, "0");
  const coverArt = numbered.slice(0, 9);
  const year = new Date().getFullYear();

  useEffect(() => {
    const prev = document.title;
    document.title = `${settings.cookbookTitle || "My Cookbook"}${settings.name ? ` by ${settings.name}` : ""}`;
    return () => void (document.title = prev);
  }, [settings.cookbookTitle, settings.name]);

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <a className="btn btn-ghost" href="#/cookbook">← Back</a>
        <div>
          <strong>{numbered.length} recipes · {chapters.length} chapters</strong>
          <span className="muted small">In the print dialog, choose “Save as PDF” and turn on “Background graphics.”</span>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>🖨 Print / Save PDF</button>
      </div>

      <div className="book">
        <section className="page cover">
          <div className="cover-frame">
            <p className="cover-eyebrow">A personal cookbook · {year}</p>
            <h1 className="cover-title">{settings.cookbookTitle || "My Cookbook"}</h1>
            <p className="cover-by">{settings.name ? `by ${settings.name}` : "from my kitchen"}</p>
            <div className={`cover-collage n${coverArt.length}`}>
              {coverArt.map((r, i) => (
                <div key={r.id} className="cover-tile" style={{ transform: `rotate(${((i * 37) % 9) - 4}deg)` }}><RecipeArt recipe={r} size="medium" eager /></div>
              ))}
            </div>
            <p className="cover-foot">Pantry Alchemist · {numbered.length} recipes made from what I had</p>
          </div>
        </section>

        <section className="page toc">
          <h2 className="page-title">Contents</h2>
          {chapters.map(({ meal, recipes }) => (
            <div key={meal} className="toc-chapter">
              <h3>{CHAPTERS[meal].title}</h3>
              <ol>
                {recipes.map((r) => (
                  <li key={r.id}>
                    <span className="toc-num">No. {num(r.id)}</span>
                    <span className="toc-name">{r.title}</span>
                    <span className="toc-dots" aria-hidden />
                    <span className="toc-meta">{r.time} min</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        {chapters.map(({ meal, recipes }) => (
          <div key={meal}>
            <section className="page chapter-page" style={{ ["--ch" as string]: paletteFor(recipes[0].id).bg }}>
              <div className="chapter-art"><RecipeArt recipe={recipes[0]} size="medium" eager /></div>
              <p className="cover-eyebrow">Chapter {chapters.findIndex((c) => c.meal === meal) + 1}</p>
              <h2 className="chapter-name">{CHAPTERS[meal].title}</h2>
              <p className="chapter-blurb-print">{CHAPTERS[meal].blurb}</p>
            </section>
            {recipes.map((r) => {
              const e = cookbook[r.id];
              const diet = dietOf(r);
              const pal = paletteFor(r.id);
              return (
                <section key={r.id} className="page recipe-page" style={{ ["--accent-r" as string]: pal.a }}>
                  <header className="rp-head">
                    <div>
                      <p className="rp-num">No. {num(r.id)} · {CHAPTERS[meal].title}</p>
                      <h2 className="rp-title">{r.title}</h2>
                      <p className="rp-desc">{r.description}</p>
                      <p className="rp-meta">
                        Serves {r.servings} · {r.time} min · {difficultyLabel[r.difficulty]} · {r.cuisine}
                        {diet.vegan ? " · Vegan" : diet.vegetarian ? " · Vegetarian" : ""}
                      </p>
                    </div>
                    <div className="rp-art"><RecipeArt recipe={r} size="medium" eager /></div>
                  </header>
                  <div className="rp-body">
                    <div className="rp-ings">
                      <h3>You'll need</h3>
                      <ul>
                        {r.ingredients.map((i) => {
                          const f = formatIngredient(i, 1, settings.units);
                          return <li key={i.key}>{f.qty ? <><b>{f.qty}</b> {f.name}</> : <>{f.name}, to taste</>}{i.optional && <em> (optional)</em>}</li>;
                        })}
                      </ul>
                    </div>
                    <div className="rp-steps">
                      <h3>Method</h3>
                      <ol>{r.steps.map((s, idx) => <li key={idx}><StepText parts={renderStep(s, r, 1, settings.units)} /></li>)}</ol>
                      {r.tips.length > 0 && <div className="rp-tips"><h4>Tips</h4>{r.tips.map((t, k) => <p key={k}>{t}</p>)}</div>}
                    </div>
                  </div>
                  <footer className="rp-notes">
                    <div className="rp-stars">{"★".repeat(e?.rating ?? 0)}<span>{"★".repeat(5 - (e?.rating ?? 0))}</span></div>
                    <p className="rp-note-text">{e?.notes || "Notes:"}</p>
                    {e?.cookedCount ? <p className="rp-cooked">Cooked {e.cookedCount}×</p> : null}
                  </footer>
                </section>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
