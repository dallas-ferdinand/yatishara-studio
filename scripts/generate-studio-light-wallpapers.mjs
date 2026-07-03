#!/usr/bin/env node
/** Procedural 4K light-mode spatial Studio backgrounds — fallback only. Prefer Cursor image gen. */
import sharp from "sharp";
import { writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STUDIO_LIGHT_SCENE_SPECS } from "./studio-wallpaper-prompts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const TARGET_W = 3840;
const TARGET_H = 2160;
const WEBP_QUALITY = 92;

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function buildSvg({ accent, baseTop, baseBottom, glows, floor }) {
  const glowMarkup = glows
    .map(
      (glow) => `
    <radialGradient id="${glow.id}" cx="${glow.cx}%" cy="${glow.cy}%" r="${glow.r}%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="${glow.o0}" />
      <stop offset="42%" stop-color="${escapeXml(accent)}" stop-opacity="${glow.o1}" />
      <stop offset="100%" stop-color="${escapeXml(accent)}" stop-opacity="0" />
    </radialGradient>`,
    )
    .join("");

  const glowRects = glows
    .map((glow) => `<rect width="100%" height="100%" fill="url(#${glow.id})" />`)
    .join("\n    ");

  return `<svg width="${TARGET_W}" height="${TARGET_H}" viewBox="0 0 ${TARGET_W} ${TARGET_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="base" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${baseTop}" />
      <stop offset="100%" stop-color="${baseBottom}" />
    </linearGradient>
    <linearGradient id="floor" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="0" />
      <stop offset="${floor.start}%" stop-color="${escapeXml(accent)}" stop-opacity="${floor.mid}" />
      <stop offset="100%" stop-color="${escapeXml(accent)}" stop-opacity="${floor.end}" />
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="46%" r="78%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
      <stop offset="100%" stop-color="#d8d8de" stop-opacity="${floor.vignette}" />
    </radialGradient>
    ${glowMarkup}
  </defs>
  <rect width="100%" height="100%" fill="url(#base)" />
  ${glowRects}
  <rect width="100%" height="100%" fill="url(#floor)" />
  <rect width="100%" height="100%" fill="url(#vignette)" />
</svg>`;
}

async function renderTheme(spec) {
  const svg = buildSvg(spec);
  const outputPath = path.join(PUBLIC_DIR, spec.file);
  await sharp(Buffer.from(svg))
    .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toFile(outputPath);
  const info = await stat(outputPath);
  return { file: spec.file, kb: Math.round(info.size / 1024) };
}

const only = process.argv[2];
const specs = only
  ? STUDIO_LIGHT_SCENE_SPECS.filter((spec) => spec.id === only || spec.file.includes(only))
  : STUDIO_LIGHT_SCENE_SPECS;

if (!specs.length) {
  console.error(`No matching light scene spec for "${only ?? ""}"`);
  process.exit(1);
}

console.log(`Generating ${specs.length} light spatial wallpaper(s)...`);
for (const spec of specs) {
  const result = await renderTheme(spec);
  console.log(`  ${result.file} (${result.kb} KB)`);
}
console.log("Done.");
