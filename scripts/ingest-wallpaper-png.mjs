#!/usr/bin/env node
/** Move a generated PNG into assets + upscale to 4K WebP in public/. */
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { studioWallpaperSpecsForFamily } from "./studio-wallpaper-prompts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS =
  process.env.STUDIO_WALLPAPER_ASSETS ??
  "/root/.cursor/projects/opt-yatishara-studio/assets";
const PUBLIC = path.join(ROOT, "public");

const [srcPath, family, specId, variantArg] = process.argv.slice(2);
if (!srcPath || !family) {
  console.error("Usage: node scripts/ingest-wallpaper-png.mjs <src.png> <family> [themeId] [dark|light]");
  process.exit(1);
}

const basename = path.basename(srcPath);
const specs = studioWallpaperSpecsForFamily(family);
let spec = specs.find((s) => s.png === basename);
if (!spec && specId) {
  const variant = variantArg === "light" || variantArg === "dark" ? variantArg : basename.includes("-light") ? "light" : "dark";
  spec = specs.find((s) => s.id === specId && s.variant === variant);
}
if (!spec) {
  console.error(`No spec for family=${family} id=${specId}`);
  process.exit(1);
}

const destDir = path.join(ASSETS, "wallpapers", family);
await mkdir(destDir, { recursive: true });
const destPng = path.join(destDir, spec.png);
await copyFile(srcPath, destPng);

const output = path.join(PUBLIC, spec.file);
const processor =
  spec.variant === "light"
    ? path.resolve(__dirname, "process-studio-light-wallpaper.mjs")
    : path.resolve(__dirname, "process-studio-wallpaper.mjs");
const result = spawnSync("node", [processor, destPng, output], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`OK ${spec.file}`);
