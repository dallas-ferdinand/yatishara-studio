#!/usr/bin/env node
/** List wallpaper specs that still need PNG sources (for Cursor image gen batch). */
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { studioWallpaperSpecsForFamily } from "./studio-wallpaper-prompts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS =
  process.env.STUDIO_WALLPAPER_ASSETS ??
  "/root/.cursor/projects/opt-yatishara-studio/assets";
const PUBLIC = path.join(ROOT, "public");

const family = process.argv.find((a) => a.startsWith("--family="))?.split("=")[1] ?? "cinematic";
const variant = process.argv.find((a) => a.startsWith("--variant="))?.split("=")[1];
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0) || Infinity;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasSource(spec) {
  const assetDir = path.join(ASSETS, "wallpapers", family);
  const candidates = [
    path.join(assetDir, spec.png),
    path.join(ASSETS, spec.png),
    path.join(PUBLIC, spec.png),
    path.join(PUBLIC, spec.file.replace("-4k.webp", "-4k.png")),
    path.join(PUBLIC, spec.file.replace(".webp", ".png")),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return true;
  }
  return false;
}

let specs = studioWallpaperSpecsForFamily(family);
if (variant === "dark" || variant === "light") {
  specs = specs.filter((s) => s.variant === variant);
}

const pending = [];
for (const spec of specs) {
  if (!(await hasSource(spec))) pending.push(spec);
}

const slice = pending.slice(0, limit);
const out = slice.map((spec) => ({
  id: spec.id,
  family: spec.family,
  variant: spec.variant,
  png: spec.png,
  file: spec.file,
  dest: path.join(ASSETS, "wallpapers", family, spec.png),
  prompt: spec.prompt,
}));

console.log(JSON.stringify({ family, pending: pending.length, batch: out.length, items: out }, null, 2));
