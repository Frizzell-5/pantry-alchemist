import { useState } from "react";
import { RecipeArt, paletteFor } from "../lib/art.tsx";
import { go } from "../lib/hooks.ts";
import { dietOf, hasIngredient, matchRecipe, uniqueNames } from "../lib/match.ts";
import { actions, ingredientLabel, pantrySet, useStore } from "../lib/store.ts";
import type { Recipe } from "../lib/types.ts";
import { formatIngredient, renderStep, type StepPart } from "../lib/units.ts";
import { difficultyLabel, HaveMeter, ServingsStepper, SOURCE_BADGE, Stars, UnitToggle } from "./bits.tsx";
import { StarButton } from "./RecipeCard.tsx";

const EQUIP_LABEL = { stovetop: "🔥 Stovetop", microwave: "📡 Microwave", oven: "♨️ Oven", onePot: "🍲 One pot", noCook: "🥣 No cook" } as const;

export function StepText({ parts }: { parts: StepPart[] }) {
  return (
    <>
      {parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <mark key={i} className={`amt ${p.optional ? "opt" : ""}`}>{p.text}</mark>))}
    </>
  );
}

export function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const pantry = useStore((s) => s.pantry);
  const units = useStore((s) => s.settings.units);
  const entry = useStore((s) => s.cookbook[recipe.id]);
  const starred = useStore((s) => s.starred.includes(recipe.id));
  const [servings, setServings] = useState(recipe.servings);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const factor = servings / recipe.servings;
  const set = pantrySet();
  const match = matchRecipe(recipe, set);
  const diet = dietOf(recipe);
  const need = uniqueNames(match.needToBuy);
  const pal = paletteFor(recipe.id);
  void pantry; // re-render when the pantry changes

  return (
    <article className="view detail" style={{ ["--card-accent" as string]: pal.a }}>
      <button className="back link" onClick={() => history.length > 1 ? history.back() : go("recipes")}>← Back</button>

      <div className="detail-hero">
        <div className="detail-art"><RecipeArt recipe={recipe} size="large" eager /></div>
        <div className="detail-head">
          {SOURCE_BADGE[recipe.source] && <span className="source-badge">{SOURCE_BADGE[recipe.source]}</span>}
          <h1 className="display">{recipe.title}</h1>
          <p className="lede">{recipe.description}</p>
          <p className="meta">
            <span title={recipe.approxTime ? "Estimated from the method" : undefined}>⏱ {recipe.approxTime ? "~" : ""}{recipe.time} min</span>
            <span>{difficultyLabel[recipe.difficulty]}</span>
            <span>{recipe.cuisine}</span>
            <span className="cap">{recipe.mealType}</span>
          </p>
          <p className="tags">
            {recipe.equipment.map((e) => <span key={e} className="tag">{EQUIP_LABEL[e]}</span>)}
            {diet.vegan ? <span className="tag green">🌱 Vegan</span> : diet.vegetarian ? <span className="tag green">🥕 Vegetarian</span> : diet.noMeat ? <span className="tag">🐟 No meat</span> : null}
          </p>
          <HaveMeter have={match.haveCount} total={match.required} />
          {(recipe.video || recipe.sourceUrl) && (
            <p className="tags">
              {recipe.video && <a className="tag link-tag" href={recipe.video} target="_blank" rel="noreferrer">▶ Watch it made</a>}
              {recipe.sourceUrl && <a className="tag link-tag" href={recipe.sourceUrl} target="_blank" rel="noreferrer">Original recipe ↗</a>}
            </p>
          )}
        </div>
      </div>

      <div className={`need-box ${match.needToBuy.length ? "" : "ready"}`}>
        {match.needToBuy.length === 0 ? (
          <p><strong>You have everything you need.</strong>{match.swaps.length > 0 && ` (with ${match.swaps.length} easy swap${match.swaps.length > 1 ? "s" : ""})`} Let's cook!</p>
        ) : (
          <>
            <p><strong>You need {need.length} thing{need.length > 1 ? "s" : ""}:</strong> {need.join(", ")}</p>
            <button className={`btn ${starred ? "btn-ghost on" : "btn-primary"}`} onClick={() => actions.toggleStar(recipe.id)}>
              {starred ? "✓ On your shopping list" : "🛒 Add to shopping list"}
            </button>
          </>
        )}
      </div>

      <div className="action-row">
        <button className="btn btn-primary big" onClick={() => go(`cook/${recipe.id}/${servings}`)}>▶ Start cooking</button>
        {entry ? (
          <button className="btn btn-ghost on" onClick={() => actions.removeFromCookbook(recipe.id)} title="Remove from cookbook">📖 In cookbook ✓</button>
        ) : (
          <button className="btn btn-ghost" onClick={() => actions.saveToCookbook(recipe.id)}>📖 Save to cookbook</button>
        )}
        <StarButton id={recipe.id} />
      </div>

      <div className="detail-cols">
        <section className="card-paper ingredients">
          <div className="section-head">
            <h2 className="display">Ingredients</h2>
            <UnitToggle />
          </div>
          <ServingsStepper value={servings} onChange={setServings} />
          <ul className="ing-list">
            {recipe.ingredients.map((ing) => {
              const f = formatIngredient(ing, factor, units);
              const have = hasIngredient(ing, set);
              const swap = match.swaps.find((s) => s.missing.key === ing.key);
              return (
                <li key={ing.key} className={have ? "have" : ing.optional ? "optional" : "missing"}>
                  <span className="ing-mark" aria-label={have ? "you have this" : "missing"}>{have ? "✓" : ing.optional ? "○" : "✗"}</span>
                  <span className="ing-text">
                    {f.qty && <strong>{f.qty}</strong>} {f.name}
                    {!f.qty && !ing.note && <em> to taste</em>}
                    {ing.optional && <em className="opt"> (optional)</em>}
                    {ing.note && <em className="note"> · {ing.note}</em>}
                    {swap && <span className="swap-hint">swap: {swap.use.map((u) => ingredientLabel(u).toLowerCase()).join(" + ")} ({swap.note})</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card-paper steps-preview">
          <h2 className="display">Method</h2>
          <ol>
            {recipe.steps.map((s, i) => (
              <li key={i}>
                <StepText parts={renderStep(s, recipe, factor, units)} />
                {s.timer && <span className="timer-chip">⏱ {Math.round(s.timer.seconds / 60) || "<1"} min</span>}
              </li>
            ))}
          </ol>
          {recipe.source === "library" && <p className="muted small credit">From TheMealDB community recipe library. Amounts are as the original cook wrote them.</p>}
          {recipe.tips.length > 0 && (
            <div className="tips">
              <h3 className="hand">Tips from the margins</h3>
              <ul>{recipe.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </section>
      </div>

      {entry && (
        <section className="card-paper my-notes">
          <h2 className="display">My notes</h2>
          <Stars value={entry.rating} onChange={(rating) => actions.updateEntry(recipe.id, { rating })} />
          <textarea
            className="hand-input"
            placeholder="Used extra garlic. Would make again…"
            value={entry.notes}
            onChange={(e) => actions.updateEntry(recipe.id, { notes: e.target.value })}
            rows={3}
          />
          {entry.cookedCount > 0 && <p className="muted">Cooked {entry.cookedCount}×</p>}
        </section>
      )}

      {recipe.source !== "seed" && recipe.source !== "library" && !entry && (
        <p className="discard">
          {confirmDiscard ? (
            <>Toss this recipe? <button className="link danger" onClick={() => { actions.discardAiRecipe(recipe.id); go("recipes"); }}>Yes, toss it</button> <button className="link" onClick={() => setConfirmDiscard(false)}>Keep</button></>
          ) : (
            <button className="link" onClick={() => setConfirmDiscard(true)}>Not feeling it? Toss this recipe</button>
          )}
        </p>
      )}
    </article>
  );
}
