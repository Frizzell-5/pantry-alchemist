import { getState } from "./store.ts";
import type { Recipe } from "./types.ts";

export interface GeneratePayload {
  mode: "pantry" | "chaos" | "leftover";
  pantry: { id: string; label: string }[];
  focus?: string[];
  mood?: string | null;
  constraints?: string[];
  servings?: number;
  count?: number;
  avoidTitles?: string[];
  context?: string;
}

let statusPromise: Promise<{ ai: boolean; needsCode?: boolean }> | null = null;
export function aiStatus() {
  statusPromise ??= fetch("/api/status")
    .then((r) => (r.ok ? r.json() : { ai: false }))
    .catch(() => ({ ai: false }));
  return statusPromise;
}

export async function generateRecipes(payload: GeneratePayload, signal?: AbortSignal): Promise<Recipe[]> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-code": getState().settings.accessCode.trim() },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  if (!Array.isArray(data.recipes)) throw new Error("Unexpected response from server");
  return data.recipes as Recipe[];
}
