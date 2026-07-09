#!/usr/bin/env node
/**
 * Procedural 4K wallpapers for cinematic / spacey / scenic families.
 * Distinct from animated cartoon scenes — used when PNG sources are missing.
 */
import sharp from "sharp";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { studioWallpaperSpecsForFamily } from "./studio-wallpaper-prompts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, "../public");
const TARGET_W = 3840;
const TARGET_H = 2160;
const WEBP_QUALITY = 90;

const THEME_ACCENTS = {
  agent: "#22c55e",
  gold: "#c4a574",
  ocean: "#38bdf8",
  ember: "#fb923c",
  mint: "#4ade80",
  violet: "#c084fc",
  rose: "#fb7185",
  cobalt: "#60a5fa",
  coral: "#f472b6",
  sage: "#86efac",
  cherry: "#f87171",
  teal: "#2dd4bf",
  lime: "#a3e635",
  fuchsia: "#e879f9",
  copper: "#d97706",
  indigo: "#818cf8",
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const family = argv.find((arg) => arg.startsWith("--family="))?.split("=")[1] ?? "cinematic";
  const force = argv.includes("--force");
  const only = argv.find((arg) => !arg.startsWith("--"));
  return { family, force, only };
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStars(id, accent, light) {
  const rand = mulberry32(hashSeed(`${id}-stars`));
  const count = light ? 120 : 220;
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    const x = rand() * TARGET_W;
    const y = rand() * TARGET_H * (light ? 0.82 : 1);
    const r = light ? 0.8 + rand() * 1.8 : 0.5 + rand() * 2.2;
    const opacity = light ? 0.12 + rand() * 0.35 : 0.2 + rand() * 0.75;
    const tint = rand() > 0.82 ? accent : "#ffffff";
    stars.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${escapeXml(tint)}" opacity="${opacity.toFixed(3)}" />`,
    );
  }
  return stars.join("\n    ");
}

function buildCinematicSvg(id, accent, light) {
  const baseTop = light ? "#f4f4f6" : "#0a0b10";
  const baseBottom = light ? "#d8d9df" : "#010104";
  const glowOpacity = light ? 0.22 : 0.42;
  return `<svg width="${TARGET_W}" height="${TARGET_H}" viewBox="0 0 ${TARGET_W} ${TARGET_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="base" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${baseTop}" />
      <stop offset="100%" stop-color="${baseBottom}" />
    </linearGradient>
    <radialGradient id="practical" cx="72%" cy="38%" r="48%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="${glowOpacity}" />
      <stop offset="55%" stop-color="${escapeXml(accent)}" stop-opacity="${light ? 0.08 : 0.14}" />
      <stop offset="100%" stop-color="${escapeXml(accent)}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="haze" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="${light ? 0.05 : 0.12}" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${light ? 0.04 : 0.08} 0" />
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#base)" />
  <rect width="100%" height="100%" fill="url(#haze)" />
  <rect width="100%" height="55%" y="45%" fill="#000000" opacity="${light ? 0.04 : 0.55}" />
  <ellipse cx="78%" cy="78%" rx="42%" ry="18%" fill="#000000" opacity="${light ? 0.03 : 0.35}" />
  <rect width="100%" height="100%" fill="url(#practical)" />
  <rect width="100%" height="100%" filter="url(#grain)" opacity="${light ? 0.35 : 0.65}" />
</svg>`;
}

function buildSpaceySvg(id, accent, light) {
  const baseTop = light ? "#eef1f8" : "#02040c";
  const baseBottom = light ? "#c8d0e4" : "#000000";
  return `<svg width="${TARGET_W}" height="${TARGET_H}" viewBox="0 0 ${TARGET_W} ${TARGET_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="void" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${baseTop}" />
      <stop offset="100%" stop-color="${baseBottom}" />
    </linearGradient>
    <radialGradient id="nebula-a" cx="28%" cy="34%" r="42%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="${light ? 0.28 : 0.5}" />
      <stop offset="100%" stop-color="${escapeXml(accent)}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="nebula-b" cx="74%" cy="62%" r="36%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="${light ? 0.16 : 0.32}" />
      <stop offset="100%" stop-color="${escapeXml(accent)}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#void)" />
  <rect width="100%" height="100%" fill="url(#nebula-a)" />
  <rect width="100%" height="100%" fill="url(#nebula-b)" />
  ${buildStars(id, accent, light)}
</svg>`;
}

function buildScenicSvg(id, accent, light) {
  const skyTop = light ? "#e8eef8" : "#0b1220";
  const skyBottom = light ? "#f8fafc" : "#1a2740";
  const land = light ? "#8a9aaf" : "#060a0f";
  const accentGlow = light ? 0.35 : 0.55;
  return `<svg width="${TARGET_W}" height="${TARGET_H}" viewBox="0 0 ${TARGET_W} ${TARGET_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${skyTop}" />
      <stop offset="62%" stop-color="${skyBottom}" />
      <stop offset="100%" stop-color="${escapeXml(accent)}" stop-opacity="${accentGlow}" />
    </linearGradient>
    <linearGradient id="hills" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${land}" stop-opacity="0" />
      <stop offset="100%" stop-color="${land}" stop-opacity="${light ? 0.55 : 0.92}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)" />
  <path d="M0 ${TARGET_H * 0.58} C ${TARGET_W * 0.2} ${TARGET_H * 0.5}, ${TARGET_W * 0.38} ${TARGET_H * 0.66}, ${TARGET_W * 0.55} ${TARGET_H * 0.56} S ${TARGET_W * 0.92} ${TARGET_H * 0.62}, ${TARGET_W} ${TARGET_H * 0.54} L ${TARGET_W} ${TARGET_H} L 0 ${TARGET_H} Z" fill="url(#hills)" />
  <path d="M0 ${TARGET_H * 0.72} C ${TARGET_W * 0.25} ${TARGET_H * 0.66}, ${TARGET_W * 0.5} ${TARGET_H * 0.78}, ${TARGET_W} ${TARGET_H * 0.7} L ${TARGET_W} ${TARGET_H} L 0 ${TARGET_H} Z" fill="${land}" opacity="${light ? 0.45 : 0.85}" />
</svg>`;
}

function buildSvg(family, id, accent, light) {
  if (family === "cinematic") return buildCinematicSvg(id, accent, light);
  if (family === "spacey") return buildSpaceySvg(id, accent, light);
  if (family === "scenic") return buildScenicSvg(id, accent, light);
  throw new Error(`Unsupported family: ${family}`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePngInput(spec, family) {
  const assetDir = path.join("/root/.cursor/projects/opt-yatishara-studio/assets/wallpapers", family);
  const candidates = [
    path.join(assetDir, spec.png),
    path.join(PUBLIC, spec.png),
    path.join(PUBLIC, spec.file.replace("-4k.webp", "-4k.png")),
    path.join(PUBLIC, spec.file.replace(".webp", ".png")),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function renderSpec(spec, family, force) {
  const output = path.join(PUBLIC, spec.file);
  if (!force && (await exists(output))) {
    const pngInput = await resolvePngInput(spec, family);
    if (pngInput) {
      // Prefer real PNG sources when present (e.g. spacey AI art).
      const processor = spec.variant === "light"
        ? path.resolve(__dirname, "process-studio-light-wallpaper.mjs")
        : path.resolve(__dirname, "process-studio-wallpaper.mjs");
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("node", [processor, pngInput, output], { stdio: "inherit" });
      if (result.status === 0) return { file: spec.file, source: "png" };
    }
    return null;
  }

  const pngInput = await resolvePngInput(spec, family);
  if (pngInput) {
    const processor = spec.variant === "light"
      ? path.resolve(__dirname, "process-studio-light-wallpaper.mjs")
      : path.resolve(__dirname, "process-studio-wallpaper.mjs");
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("node", [processor, pngInput, output], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
    return { file: spec.file, source: "png" };
  }

  const accent = THEME_ACCENTS[spec.id] ?? "#66e8ff";
  const light = spec.variant === "light";
  const svg = buildSvg(family, spec.id, accent, light);
  await sharp(Buffer.from(svg))
    .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toFile(output);
  const info = await stat(output);
  return { file: spec.file, source: "procedural", kb: Math.round(info.size / 1024) };
}

const { family, force, only } = parseArgs();
if (!["cinematic", "spacey", "scenic"].includes(family)) {
  console.error("Use --family=cinematic|spacey|scenic");
  process.exit(1);
}

let specs = studioWallpaperSpecsForFamily(family);
if (only) {
  specs = specs.filter(
    (spec) => spec.id === only || spec.file.includes(only) || spec.png.includes(only),
  );
}

if (!specs.length) {
  console.error(`No specs for family=${family}`);
  process.exit(1);
}

let rendered = 0;
for (const spec of specs) {
  const result = await renderSpec(spec, family, force);
  if (result) {
    rendered += 1;
    const extra = result.kb ? ` (${result.kb} KB)` : "";
    console.log(`  ${result.file} [${result.source}]${extra}`);
  }
}

console.log(`Generated ${rendered}/${specs.length} wallpaper(s) for family=${family}.`);
