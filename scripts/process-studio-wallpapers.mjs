#!/usr/bin/env node
/** Upscale wallpaper PNGs to 3840×2160 WebP for Studio backgrounds. */
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDIO_SCENE_PROMPT_LIST,
  STUDIO_LIGHT_SCENE_PROMPT_LIST,
  studioWallpaperSpecsForFamily,
} from "./studio-wallpaper-prompts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS =
  process.env.STUDIO_WALLPAPER_ASSETS ??
  "/root/.cursor/projects/opt-yatishara-studio/assets";
const PUBLIC = path.resolve(ROOT, "public");
const PROCESS_DARK = path.resolve(__dirname, "process-studio-wallpaper.mjs");
const PROCESS_LIGHT = path.resolve(__dirname, "process-studio-light-wallpaper.mjs");

const mode = process.argv[2] ?? "all";
const familyArg = process.argv.find((arg) => arg.startsWith("--family="))?.split("=")[1] ?? "animated";
const only = process.argv.find((arg) => !arg.startsWith("--") && arg !== mode && arg !== process.argv[2]);

function pickSpecs() {
  if (familyArg === "animated") {
    const dark = STUDIO_SCENE_PROMPT_LIST.map((spec) => ({ ...spec, variant: "dark", family: "animated" }));
    const light = STUDIO_LIGHT_SCENE_PROMPT_LIST.map((spec) => ({ ...spec, variant: "light", family: "animated" }));
    let specs = mode === "dark" ? dark : mode === "light" ? light : [...dark, ...light];
    if (only) {
      specs = specs.filter(
        (spec) => spec.id === only || spec.file.includes(only) || spec.png.includes(only),
      );
    }
    return specs;
  }

  const familySpecs = studioWallpaperSpecsForFamily(familyArg);
  let specs =
    mode === "dark"
      ? familySpecs.filter((spec) => spec.variant === "dark")
      : mode === "light"
        ? familySpecs.filter((spec) => spec.variant === "light")
        : familySpecs;
  if (only) {
    specs = specs.filter(
      (spec) => spec.id === only || spec.file.includes(only) || spec.png.includes(only),
    );
  }
  return specs;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const assetDir = path.join(ASSETS, "wallpapers", familyArg);
let processed = 0;
for (const spec of pickSpecs()) {
  const input = path.join(assetDir, spec.png);
  const fallbackInput = path.join(ASSETS, spec.png);
  const resolvedInput = (await exists(input)) ? input : fallbackInput;
  const output = path.join(PUBLIC, spec.file);
  if (!(await exists(resolvedInput))) {
    console.warn(`skip (missing): ${resolvedInput}`);
    continue;
  }
  const processor = spec.variant === "light" ? PROCESS_LIGHT : PROCESS_DARK;
  const result = spawnSync("node", [processor, resolvedInput, output], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  processed += 1;
}

if (!processed) {
  console.error(
    `No PNG sources found for family=${familyArg}. Generate first into:\n`
      + `  ${assetDir}/\n`
      + "  node scripts/process-studio-wallpapers.mjs all --family=cinematic",
  );
  process.exit(1);
}

console.log(`Processed ${processed} wallpaper(s) for family=${familyArg}.`);
