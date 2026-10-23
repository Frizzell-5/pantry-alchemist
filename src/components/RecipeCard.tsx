import { RecipeArt } from "../lib/art.tsx";
import type { Match } from "../lib/match.ts";
import { actions, ingredientLabel, useStore } from "../lib/store.ts";
import { difficultyLabel, HaveMeter, SOURCE_BADGE } from "./bits.tsx";

export function StarButton({ id }: { id: string }) {
  const starred = useStore((s) => s.starred.includes(id));
  return (
    <button
      className={`star-btn ${starred ? "on" : ""}`}
      aria-pressed={starred}
      aria-label={starred ? "Unstar (remove from shopping list)" : "Star (add missing items to shopping list)"}
      title={starred ? "Starred: missing items are on your list" : "Star to add missing items to your shopping list"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleStar(id);
      }}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}

export function RecipeCard({ match, index = 0 }: { match: Match; index?: number }) {
  const { recipe, needToBuy, swaps, haveCount, required } = match;
  const ready = needToBuy.length === 0 && swaps.length === 0;
  return (
    <a href={`#/recipe/${recipe.id}`} className="recipe-card" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
      <div className="card-art">
        <RecipeArt recipe={recipe} />
        {ready && <span className="ready-stamp">ready!</span>}
      </div>
      <div className="card-body">
        {SOURCE_BADGE[recipe.source] && <span className="source-badge">{SOURCE_BADGE[recipe.source]}</span>}
        <h3>{recipe.title}</h3>
        <p className="meta">
          <span>⏱ {recipe.time} min</span>
          <span>{difficultyLabel[recipe.difficulty]}</span>
          <span>{recipe.cuisine}</span>
        </p>
        <HaveMeter have={haveCount} total={required} />
        {needToBuy.length > 0 && (
          <p className="missing"><span className="tag-miss">need</span> {needToBuy.map((m) => m.name).join(", ")}</p>
        )}
        {swaps.length > 0 && (
          <p className="swaps">
            <span className="tag-swap">swap</span>{" "}
            {swaps.map((s, i) => (
              <span key={s.missing.key}>{i > 0 && " · "}{s.missing.name} → {s.use.map((u) => ingredientLabel(u).toLowerCase()).join(" + ")}</span>
            ))}
          </p>
        )}
      </div>
      <StarButton id={recipe.id} />
    </a>
  );
}
