import { useId, useState, type ReactNode } from "react";
import { thumb } from "./library.ts";
import type { Recipe } from "./types.ts";

// Each recipe gets a deterministic illustration: a palette, a background
// pattern, a plate, and doodles chosen from its main ingredients, drawn as SVG.
// World-library dishes show their real photo instead (see RecipeArt below).

export interface Palette { bg: string; ink: string; a: string; b: string; c: string }

const PALETTES: Palette[] = [
  { bg: "#f4d6a0", ink: "#3b2418", a: "#c8553d", b: "#588b8b", c: "#fbf3e4" },
  { bg: "#cfe0c3", ink: "#2f3a2a", a: "#e07a5f", b: "#3d405b", c: "#fbf3e4" },
  { bg: "#f2c6b4", ink: "#3d1f1a", a: "#7a9e7e", b: "#d1495b", c: "#fff6ea" },
  { bg: "#ffe8a3", ink: "#2d2a26", a: "#ef8354", b: "#4f5d75", c: "#fffaf0" },
  { bg: "#c9d7e8", ink: "#1f2a3a", a: "#f28f3b", b: "#c8553d", c: "#fdf6e3" },
  { bg: "#e8d5f0", ink: "#2e1f3a", a: "#ff9f1c", b: "#2a9d8f", c: "#fff8f0" },
  { bg: "#f6bd60", ink: "#3a2a10", a: "#84a59d", b: "#f28482", c: "#f7ede2" },
  { bg: "#d8e2dc", ink: "#2b2b2b", a: "#ffb703", b: "#e76f51", c: "#ffffff" },
  { bg: "#f7cad0", ink: "#3a1d24", a: "#6d9773", b: "#f9a03f", c: "#fff5f6" },
  { bg: "#b8dbd9", ink: "#1d3331", a: "#f4a259", b: "#bc4b51", c: "#fbfaf4" },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const paletteFor = (id: string) => PALETTES[hash(id) % PALETTES.length];

type Rand = () => number;
type Motif = (x: number, y: number, s: number, r: Rand, ink: string) => ReactNode;

const blob = (cx: number, cy: number, rx: number, ry: number, r: Rand, wobble = 0.18) => {
  const pts = 9;
  const coords = Array.from({ length: pts }, (_, i) => {
    const a = (i / pts) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * wobble * 2;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  let d = `M${coords[0][0]},${coords[0][1]}`;
  for (let i = 0; i < pts; i++) {
    const p1 = coords[(i + 1) % pts];
    const p0 = coords[i];
    d += ` Q${p0[0] + (p1[0] - p0[0]) / 2 + (r() - 0.5) * 2},${p0[1] + (p1[1] - p0[1]) / 2 + (r() - 0.5) * 2} ${p1[0]},${p1[1]}`;
  }
  return d + "Z";
};

const M: Record<string, Motif> = {
  egg: (x, y, s, r, ink) => (
    <g>
      <path d={blob(x, y, s, s * 0.85, r, 0.22)} fill="#fffdf6" stroke={ink} strokeWidth={1.6} />
      <circle cx={x + s * 0.1} cy={y - s * 0.05} r={s * 0.38} fill="#ffb703" stroke={ink} strokeWidth={1.4} />
      <circle cx={x + s * 0.0} cy={y - s * 0.15} r={s * 0.1} fill="#fff" opacity={0.7} />
    </g>
  ),
  noodles: (x, y, s, _r, ink) => (
    <g fill="none" stroke="#f3c969" strokeWidth={s * 0.16} strokeLinecap="round">
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${x - s},${y - s * 0.5 + i * s * 0.35} q${s * 0.25},-${s * 0.3} ${s * 0.5},0 t${s * 0.5},0 t${s * 0.5},0 t${s * 0.5},0`} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <path key={"o" + i} stroke={ink} strokeWidth={0.9} opacity={0.5} d={`M${x - s},${y - s * 0.5 + i * s * 0.35} q${s * 0.25},-${s * 0.3} ${s * 0.5},0 t${s * 0.5},0 t${s * 0.5},0 t${s * 0.5},0`} />
      ))}
    </g>
  ),
  macaroni: (x, y, s, r, ink) => (
    <g fill="none" strokeLinecap="round">
      {Array.from({ length: 6 }, (_, i) => {
        const px = x + (r() - 0.5) * s * 1.6, py = y + (r() - 0.5) * s * 1.4, rot = r() * 360;
        return (
          <g key={i} transform={`rotate(${rot} ${px} ${py})`}>
            <path d={`M${px - s * 0.28},${py} a${s * 0.28},${s * 0.28} 0 0 1 ${s * 0.56},0`} stroke="#f3c969" strokeWidth={s * 0.18} />
            <path d={`M${px - s * 0.28},${py} a${s * 0.28},${s * 0.28} 0 0 1 ${s * 0.56},0`} stroke={ink} strokeWidth={0.8} opacity={0.5} />
          </g>
        );
      })}
    </g>
  ),
  grains: (x, y, s, r, ink) => (
    <g>
      <path d={blob(x, y, s, s * 0.75, r)} fill="#fffaf0" stroke={ink} strokeWidth={1.4} />
      {Array.from({ length: 16 }, (_, i) => {
        const a = r() * Math.PI * 2, d = r() * s * 0.7;
        return <ellipse key={i} cx={x + Math.cos(a) * d} cy={y + Math.sin(a) * d * 0.7} rx={s * 0.09} ry={s * 0.04} transform={`rotate(${r() * 180} ${x + Math.cos(a) * d} ${y + Math.sin(a) * d * 0.7})`} fill="none" stroke={ink} strokeWidth={0.7} opacity={0.55} />;
      })}
    </g>
  ),
  potato: (x, y, s, r, ink) => (
    <g>
      <path d={blob(x, y, s, s * 0.72, r, 0.15)} fill="#d9a35b" stroke={ink} strokeWidth={1.6} />
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={x + (r() - 0.5) * s} cy={y + (r() - 0.5) * s * 0.8} r={1.4} fill={ink} opacity={0.6} />)}
      <path d={`M${x - s * 0.5},${y - s * 0.25} q${s * 0.3},-${s * 0.25} ${s * 0.6},-${s * 0.1}`} stroke="#fff" strokeWidth={1.4} fill="none" opacity={0.5} strokeLinecap="round" />
    </g>
  ),
  tomato: (x, y, s, r, ink) => (
    <g>
      <path d={blob(x, y, s * 0.9, s * 0.82, r, 0.08)} fill="#e63946" stroke={ink} strokeWidth={1.6} />
      <path d={`M${x},${y - s * 0.8} l${s * 0.3},-${s * 0.15} M${x},${y - s * 0.8} l-${s * 0.3},-${s * 0.12} M${x},${y - s * 0.8} l0,-${s * 0.3}`} stroke="#4c8c4a" strokeWidth={2.4} strokeLinecap="round" />
      <ellipse cx={x - s * 0.35} cy={y - s * 0.25} rx={s * 0.15} ry={s * 0.08} fill="#fff" opacity={0.5} />
    </g>
  ),
  leaf: (x, y, s, r, ink) => (
    <g>
      {[0, 1, 2].map((i) => {
        const rot = -40 + i * 40 + (r() - 0.5) * 20;
        return (
          <g key={i} transform={`rotate(${rot} ${x} ${y + s * 0.6})`}>
            <path d={`M${x},${y + s * 0.6} C${x - s * 0.5},${y} ${x - s * 0.3},${y - s * 0.6} ${x},${y - s * 0.8} C${x + s * 0.3},${y - s * 0.6} ${x + s * 0.5},${y} ${x},${y + s * 0.6}Z`} fill="#5a9e5a" stroke={ink} strokeWidth={1.3} />
            <path d={`M${x},${y + s * 0.6} L${x},${y - s * 0.6}`} stroke={ink} strokeWidth={0.8} opacity={0.6} />
          </g>
        );
      })}
    </g>
  ),
  chili: (x, y, s, _r, ink) => (
    <g transform={`rotate(-25 ${x} ${y})`}>
      <path d={`M${x - s},${y - s * 0.1} C${x - s * 0.4},${y - s * 0.5} ${x + s * 0.5},${y - s * 0.4} ${x + s},${y + s * 0.4} C${x + s * 0.2},${y + s * 0.1} ${x - s * 0.4},${y + s * 0.2} ${x - s},${y - s * 0.1}Z`} fill="#d62828" stroke={ink} strokeWidth={1.5} />
      <path d={`M${x - s},${y - s * 0.1} q-${s * 0.2},-${s * 0.2} -${s * 0.1},-${s * 0.4}`} stroke="#4c8c4a" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </g>
  ),
  citrus: (x, y, s, _r, ink) => (
    <g>
      <circle cx={x} cy={y} r={s * 0.85} fill="#f4d35e" stroke={ink} strokeWidth={1.6} />
      <circle cx={x} cy={y} r={s * 0.68} fill="#fff4b8" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <line key={i} x1={x} y1={y} x2={x + Math.cos(a) * s * 0.68} y2={y + Math.sin(a) * s * 0.68} stroke="#f4d35e" strokeWidth={1.6} />;
      })}
      <circle cx={x} cy={y} r={s * 0.68} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.4} />
    </g>
  ),
  lime: (x, y, s, r, ink) => <g>{M.citrus(x, y, s, r, ink)}<circle cx={x} cy={y} r={s * 0.85} fill="#9bc53d" opacity={0.55} /></g>,
  cheese: (x, y, s, _r, ink) => (
    <g>
      <path d={`M${x - s},${y + s * 0.6} L${x + s},${y + s * 0.6} L${x + s * 0.8},${y - s * 0.5} Z`} fill="#ffd166" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x + s * 0.3} cy={y + s * 0.25} r={s * 0.12} fill="#e9b949" />
      <circle cx={x + s * 0.65} cy={y - s * 0.05} r={s * 0.08} fill="#e9b949" />
      <circle cx={x - s * 0.2} cy={y + s * 0.42} r={s * 0.07} fill="#e9b949" />
    </g>
  ),
  beans: (x, y, s, r, ink) => (
    <g>
      {Array.from({ length: 7 }, (_, i) => {
        const px = x + (r() - 0.5) * s * 1.6, py = y + (r() - 0.5) * s * 1.2;
        return <ellipse key={i} cx={px} cy={py} rx={s * 0.22} ry={s * 0.14} transform={`rotate(${r() * 180} ${px} ${py})`} fill="#7b3f2a" stroke={ink} strokeWidth={0.9} />;
      })}
    </g>
  ),
  chickpeas: (x, y, s, r, ink) => (
    <g>
      {Array.from({ length: 7 }, (_, i) => <circle key={i} cx={x + (r() - 0.5) * s * 1.6} cy={y + (r() - 0.5) * s * 1.2} r={s * 0.2} fill="#e0b973" stroke={ink} strokeWidth={0.9} />)}
    </g>
  ),
  bread: (x, y, s, r, ink) => (
    <g>
      <path d={`M${x - s * 0.8},${y + s * 0.7} L${x - s * 0.8},${y - s * 0.2} C${x - s * 1.1},${y - s * 0.9} ${x + s * 1.1},${y - s * 0.9} ${x + s * 0.8},${y - s * 0.2} L${x + s * 0.8},${y + s * 0.7} Z`} fill="#e9b872" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
      <path d={`M${x - s * 0.6},${y + s * 0.55} L${x - s * 0.6},${y - s * 0.1} C${x - s * 0.8},${y - s * 0.65} ${x + s * 0.8},${y - s * 0.65} ${x + s * 0.6},${y - s * 0.1} L${x + s * 0.6},${y + s * 0.55}Z`} fill="#fbe3b4" />
      {[0, 1, 2].map((i) => <circle key={i} cx={x + (r() - 0.5) * s} cy={y + (r() - 0.3) * s * 0.6} r={1} fill={ink} opacity={0.4} />)}
    </g>
  ),
  tortilla: (x, y, s, r, ink) => (
    <g>
      <path d={blob(x, y, s, s * 0.95, r, 0.05)} fill="#f1d39a" stroke={ink} strokeWidth={1.5} />
      {Array.from({ length: 6 }, (_, i) => <circle key={i} cx={x + (r() - 0.5) * s * 1.4} cy={y + (r() - 0.5) * s * 1.4} r={s * 0.08} fill="#c9853f" opacity={0.7} />)}
    </g>
  ),
  mushroom: (x, y, s, _r, ink) => (
    <g>
      <path d={`M${x - s * 0.25},${y} L${x - s * 0.3},${y + s * 0.7} Q${x},${y + s * 0.85} ${x + s * 0.3},${y + s * 0.7} L${x + s * 0.25},${y}Z`} fill="#f1e3c6" stroke={ink} strokeWidth={1.4} />
      <path d={`M${x - s},${y + s * 0.05} C${x - s},${y - s * 0.8} ${x + s},${y - s * 0.8} ${x + s},${y + s * 0.05} Z`} fill="#b08968" stroke={ink} strokeWidth={1.6} />
    </g>
  ),
  carrot: (x, y, s, _r, ink) => (
    <g transform={`rotate(30 ${x} ${y})`}>
      <path d={`M${x - s * 0.28},${y - s * 0.7} L${x + s * 0.28},${y - s * 0.7} L${x},${y + s}Z`} fill="#f77f00" stroke={ink} strokeWidth={1.5} strokeLinejoin="round" />
      <path d={`M${x},${y - s * 0.7} l-${s * 0.2},-${s * 0.4} M${x},${y - s * 0.7} l0,-${s * 0.45} M${x},${y - s * 0.7} l${s * 0.2},-${s * 0.4}`} stroke="#4c8c4a" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  ),
  broccoli: (x, y, s, r, ink) => (
    <g>
      <path d={`M${x - s * 0.18},${y} L${x - s * 0.25},${y + s * 0.8} L${x + s * 0.25},${y + s * 0.8} L${x + s * 0.18},${y}Z`} fill="#8bb174" stroke={ink} strokeWidth={1.3} />
      {[[-0.45, -0.1], [0, -0.4], [0.45, -0.1], [-0.15, 0.05], [0.2, 0.05]].map(([dx, dy], i) => (
        <path key={i} d={blob(x + dx * s, y + dy * s, s * 0.38, s * 0.34, r, 0.15)} fill="#4c8c4a" stroke={ink} strokeWidth={1.2} />
      ))}
    </g>
  ),
  berries: (x, y, s, r, ink) => (
    <g>
      {Array.from({ length: 6 }, (_, i) => {
        const px = x + (r() - 0.5) * s * 1.4, py = y + (r() - 0.5) * s * 1.2;
        return <g key={i}><circle cx={px} cy={py} r={s * 0.24} fill={i % 2 ? "#6a4c93" : "#d1495b"} stroke={ink} strokeWidth={1} /><circle cx={px - s * 0.07} cy={py - s * 0.07} r={s * 0.05} fill="#fff" opacity={0.6} /></g>;
      })}
    </g>
  ),
  chocolate: (x, y, s, r, ink) => (
    <g>
      <rect x={x - s * 0.8} y={y - s * 0.55} width={s * 1.6} height={s * 1.1} rx={s * 0.1} fill="#5b3a29" stroke={ink} strokeWidth={1.5} transform={`rotate(${(r() - 0.5) * 20} ${x} ${y})`} />
      <path d={`M${x},${y - s * 0.5} V${y + s * 0.5} M${x - s * 0.75},${y} H${x + s * 0.75}`} stroke="#7d5240" strokeWidth={1.4} transform={`rotate(${(r() - 0.5) * 20} ${x} ${y})`} />
    </g>
  ),
  avocado: (x, y, s, _r, ink) => (
    <g>
      <path d={`M${x},${y - s} C${x + s * 0.5},${y - s} ${x + s * 0.8},${y + s * 0.2} ${x + s * 0.6},${y + s * 0.6} C${x + s * 0.3},${y + s * 1.1} ${x - s * 0.3},${y + s * 1.1} ${x - s * 0.6},${y + s * 0.6} C${x - s * 0.8},${y + s * 0.2} ${x - s * 0.5},${y - s} ${x},${y - s}Z`} fill="#4f772d" stroke={ink} strokeWidth={1.6} />
      <path d={`M${x},${y - s * 0.75} C${x + s * 0.4},${y - s * 0.75} ${x + s * 0.6},${y + s * 0.2} ${x + s * 0.45},${y + s * 0.5} C${x + s * 0.2},${y + s * 0.9} ${x - s * 0.2},${y + s * 0.9} ${x - s * 0.45},${y + s * 0.5} C${x - s * 0.6},${y + s * 0.2} ${x - s * 0.4},${y - s * 0.75} ${x},${y - s * 0.75}Z`} fill="#c5e08b" />
      <circle cx={x} cy={y + s * 0.3} r={s * 0.3} fill="#8b5e3c" stroke={ink} strokeWidth={1.2} />
    </g>
  ),
  meat: (x, y, s, r, ink) => (
    <g>
      <path d={blob(x - s * 0.15, y, s * 0.75, s * 0.6, r, 0.12)} fill="#c97b63" stroke={ink} strokeWidth={1.6} />
      <path d={`M${x + s * 0.4},${y + s * 0.2} L${x + s},${y + s * 0.6}`} stroke="#fffaf0" strokeWidth={s * 0.18} strokeLinecap="round" />
      <circle cx={x + s * 1.02} cy={y + s * 0.55} r={s * 0.14} fill="#fffaf0" stroke={ink} strokeWidth={1} />
      <path d={`M${x - s * 0.6},${y - s * 0.1} q${s * 0.4},-${s * 0.3} ${s * 0.8},0`} stroke="#a65d48" strokeWidth={1.4} fill="none" />
    </g>
  ),
  fish: (x, y, s, _r, ink) => (
    <g>
      <path d={`M${x - s},${y} C${x - s * 0.5},${y - s * 0.6} ${x + s * 0.4},${y - s * 0.6} ${x + s * 0.6},${y} C${x + s * 0.4},${y + s * 0.6} ${x - s * 0.5},${y + s * 0.6} ${x - s},${y}Z`} fill="#f4a261" stroke={ink} strokeWidth={1.5} />
      <path d={`M${x + s * 0.55},${y} L${x + s},${y - s * 0.4} L${x + s},${y + s * 0.4}Z`} fill="#f4a261" stroke={ink} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x - s * 0.6} cy={y - s * 0.08} r={1.6} fill={ink} />
    </g>
  ),
  tofu: (x, y, s, r, ink) => (
    <g>
      {[[-0.4, -0.3], [0.35, -0.25], [0, 0.35]].map(([dx, dy], i) => (
        <rect key={i} x={x + dx * s - s * 0.3} y={y + dy * s - s * 0.3} width={s * 0.6} height={s * 0.6} rx={s * 0.08} fill="#f1e3c6" stroke={ink} strokeWidth={1.3} transform={`rotate(${(r() - 0.5) * 30} ${x + dx * s} ${y + dy * s})`} />
      ))}
    </g>
  ),
  banana: (x, y, s, _r, ink) => (
    <g>
      <path d={`M${x - s},${y - s * 0.5} C${x - s * 0.6},${y + s * 0.6} ${x + s * 0.6},${y + s * 0.6} ${x + s},${y - s * 0.3} C${x + s * 0.4},${y + s * 0.15} ${x - s * 0.4},${y + s * 0.1} ${x - s},${y - s * 0.5}Z`} fill="#ffd23f" stroke={ink} strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  ),
  onion: (x, y, s, _r, ink) => (
    <g>
      <path d={`M${x},${y - s} C${x + s * 0.2},${y - s * 0.6} ${x + s * 0.9},${y - s * 0.4} ${x + s * 0.8},${y + s * 0.3} C${x + s * 0.7},${y + s * 0.8} ${x - s * 0.7},${y + s * 0.8} ${x - s * 0.8},${y + s * 0.3} C${x - s * 0.9},${y - s * 0.4} ${x - s * 0.2},${y - s * 0.6} ${x},${y - s}Z`} fill="#b5838d" stroke={ink} strokeWidth={1.5} />
      <path d={`M${x},${y - s * 0.7} C${x + s * 0.4},${y - s * 0.3} ${x + s * 0.4},${y + s * 0.4} ${x},${y + s * 0.62} M${x},${y - s * 0.7} C${x - s * 0.4},${y - s * 0.3} ${x - s * 0.4},${y + s * 0.4} ${x},${y + s * 0.62}`} stroke={ink} strokeWidth={0.8} fill="none" opacity={0.45} />
    </g>
  ),
  generic: (x, y, s, r, ink) => (
    <g>
      <path d={blob(x, y, s * 0.8, s * 0.7, r, 0.25)} fill="#f28482" stroke={ink} strokeWidth={1.5} />
      {[0, 1, 2].map((i) => <circle key={i} cx={x + (r() - 0.5) * s} cy={y + (r() - 0.5) * s * 0.8} r={s * 0.1} fill="#fff" opacity={0.6} />)}
    </g>
  ),
};

const REF_MOTIF: Record<string, string> = {
  eggs: "egg", pasta: "noodles", ramen: "noodles", rice_noodles: "noodles", short_pasta: "macaroni",
  rice: "grains", quinoa: "grains", couscous: "grains", oats: "grains", granola: "grains",
  potato: "potato", sweet_potato: "potato", tomato: "tomato", cherry_tomato: "tomato", canned_tomatoes: "tomato", pasta_sauce: "tomato", tomato_paste: "tomato", salsa: "tomato",
  basil: "leaf", parsley: "leaf", cilantro: "leaf", spinach: "leaf", kale: "leaf", lettuce: "leaf", green_onion: "leaf", frozen_spinach: "leaf", cabbage: "leaf", pesto: "leaf",
  chili_flakes: "chili", jalapeno: "chili", sriracha: "chili", gochujang: "chili", hot_sauce: "chili", bell_pepper: "chili",
  lemon: "citrus", lime: "lime", cheddar: "cheese", mozzarella: "cheese", parmesan: "cheese", feta: "cheese",
  black_beans: "beans", kidney_beans: "beans", lentils: "beans", chickpeas: "chickpeas", frozen_peas: "chickpeas",
  bread: "bread", pita: "tortilla", tortilla: "tortilla", mushroom: "mushroom", carrot: "carrot", broccoli: "broccoli", cauliflower: "broccoli", frozen_veg: "broccoli",
  berries: "berries", frozen_berries: "berries", cocoa: "chocolate", chocolate_chips: "chocolate", avocado: "avocado",
  chicken_breast: "meat", chicken_thigh: "meat", ground_beef: "meat", ground_turkey: "meat", sausage: "meat", bacon: "meat", ham: "meat",
  salmon: "fish", shrimp: "fish", tuna: "fish", tofu: "tofu", banana: "banana", onion: "onion", red_onion: "onion", peanut_butter: "chocolate",
};

function motifsFor(recipe: Recipe): string[] {
  const out: string[] = [];
  for (const i of recipe.ingredients) {
    const m = (i.ref && REF_MOTIF[i.ref]) || Object.entries(REF_MOTIF).find(([k]) => i.name.includes(k.replace(/_/g, " ")))?.[1];
    if (m && !out.includes(m)) out.push(m);
  }
  return out.length ? out.slice(0, 5) : ["generic"];
}

function GeneratedArt({ recipe, className, rounded = true }: { recipe: Recipe; className?: string; rounded?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const seed = hash(recipe.id);
  const r = rng(seed);
  const p = paletteFor(recipe.id);
  const motifs = motifsFor(recipe);
  const pattern = seed % 4;
  const plateR = 62 + r() * 8;
  const cx = 100 + (r() - 0.5) * 16;
  const cy = 104 + (r() - 0.5) * 10;

  const bg: ReactNode[] = [];
  if (pattern === 0) {
    for (let y = 10; y < 200; y += 18) for (let x = (y / 18) % 2 ? 19 : 10; x < 200; x += 18) bg.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} fill={p.ink} opacity={0.14} />);
  } else if (pattern === 1) {
    for (let i = -200; i < 200; i += 16) bg.push(<line key={i} x1={i} y1={0} x2={i + 200} y2={200} stroke={p.c} strokeWidth={5} opacity={0.35} />);
  } else if (pattern === 2) {
    for (let i = 0; i < 14; i++) {
      const x = r() * 200, y = r() * 200, s = 3 + r() * 4;
      bg.push(<path key={i} d={`M${x},${y - s} L${x + s * 0.3},${y - s * 0.3} L${x + s},${y} L${x + s * 0.3},${y + s * 0.3} L${x},${y + s} L${x - s * 0.3},${y + s * 0.3} L${x - s},${y} L${x - s * 0.3},${y - s * 0.3}Z`} fill={p.c} opacity={0.7} />);
    }
  } else {
    for (let y = 0; y < 200; y += 25) bg.push(<path key={y} d={`M0,${y} q12.5,-8 25,0 t25,0 t25,0 t25,0 t25,0 t25,0 t25,0 t25,0`} fill="none" stroke={p.ink} strokeWidth={1.2} opacity={0.12} />);
  }

  const placed: ReactNode[] = [];
  const n = motifs.length;
  motifs.forEach((m, i) => {
    if (i === 0) {
      placed.push(<g key={m}>{M[m](cx, cy, n === 1 ? 34 : 26, r, p.ink)}</g>);
      return;
    }
    const a = -Math.PI / 2 + ((i - 1) / Math.max(1, n - 1)) * Math.PI * 2 + r() * 0.5;
    const d = plateR * 0.58;
    placed.push(<g key={m}>{M[m](cx + Math.cos(a) * d, cy + Math.sin(a) * d, 13 + r() * 3, r, p.ink)}</g>);
  });

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={`Illustration for ${recipe.title}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id={`w${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed={seed % 97} />
          <feDisplacementMap in="SourceGraphic" scale="3.2" />
        </filter>
        <filter id={`g${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed={3} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width="200" height="200" fill={p.bg} rx={rounded ? 0 : 0} />
      <g>{bg}</g>
      <g filter={`url(#w${uid})`}>
        <circle cx={cx + 5} cy={cy + 6} r={plateR} fill={p.a} />
        <circle cx={cx} cy={cy} r={plateR} fill={p.c} stroke={p.ink} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={plateR * 0.8} fill="none" stroke={p.b} strokeWidth={1.2} strokeDasharray="3 5" opacity={0.7} />
        {placed}
      </g>
      <rect width="200" height="200" fill="#000" filter={`url(#g${uid})`} opacity={0.6} />
    </svg>
  );
}

/** Real photo for world-library dishes (falls back to generated art offline); hand-drawn art for everything else. */
export function RecipeArt({ recipe, className, rounded = true, size = "small", eager = false }: { recipe: Recipe; className?: string; rounded?: boolean; size?: "small" | "medium" | "large"; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (recipe.image && !failed) {
    return <img className={`recipe-photo ${className ?? ""}`} src={thumb(recipe.image, size)} alt="" crossOrigin="anonymous" loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />;
  }
  return <GeneratedArt recipe={recipe} className={className} rounded={rounded} />;
}
