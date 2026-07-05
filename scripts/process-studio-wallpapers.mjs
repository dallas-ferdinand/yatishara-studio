#!/usr/bin/env node
/** Upscale illustrated scene PNGs to 3840×2160 WebP for Studio backgrounds. */
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDIO_SCENE_PROMPT_LIST,
  STUDIO_LIGHT_SCENE_PROMPT_LIST,
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
const only = process.argv[3];

function pickSpecs() {
  const dark = STUDIO_SCENE_PROMPT_LIST.map((spec) => ({ ...spec, variant: "dark" }));
  const light = STUDIO_LIGHT_SCENE_PROMPT_LIST.map((spec) => ({ ...spec, variant: "light" }));
  let specs = mode === "dark" ? dark : mode === "light" ? light : [...dark, ...light];
  if (only) {
    specs = specs.filter(
      (spec) =>
        spec.id === only ||
        spec.file.includes(only) ||
        spec.png.includes(only),
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

let processed = 0;
for (const spec of pickSpecs()) {
  const input = path.join(ASSETS, spec.png);
  const output = path.join(PUBLIC, spec.file);
  if (!(await exists(input))) {
    console.warn(`skip (missing): ${input}`);
    continue;
  }
  const processor = spec.variant === "light" ? PROCESS_LIGHT : PROCESS_DARK;
  const result = spawnSync("node", [processor, input, output], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  processed += 1;
}

if (!processed) {
  console.error(
    "No PNG sources found. Generate first:\n"
      + "  node scripts/generate-studio-wallpapers.mjs all\n"
      + `Assets dir: ${ASSETS}`,
  );
  process.exit(1);
}

console.log(`Processed ${processed} wallpaper(s).`);
