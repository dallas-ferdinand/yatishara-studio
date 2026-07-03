#!/usr/bin/env node
/** Upscale Cursor-generated light scene PNGs to 3840×2160 WebP. */
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STUDIO_LIGHT_SCENE_PROMPT_LIST } from "./studio-wallpaper-prompts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = process.env.STUDIO_WALLPAPER_ASSETS
  ?? "/root/.cursor/projects/opt-yatishara-studio/assets";
const PUBLIC = path.resolve(ROOT, "public");
const PROCESS = path.resolve(__dirname, "process-studio-light-wallpaper.mjs");

const only = process.argv[2];
const specs = only
  ? STUDIO_LIGHT_SCENE_PROMPT_LIST.filter(
      (spec) => spec.id === only || spec.file.includes(only) || spec.png.includes(only),
    )
  : STUDIO_LIGHT_SCENE_PROMPT_LIST;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let processed = 0;
for (const spec of specs) {
  const input = path.join(ASSETS, spec.png);
  const output = path.join(PUBLIC, spec.file);
  if (!(await exists(input))) {
    console.warn(`skip (missing): ${input}`);
    continue;
  }
  const result = spawnSync("node", [PROCESS, input, output], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  processed += 1;
}

if (!processed) {
  console.error(
    "No PNG sources found. Generate with Cursor image gen into:\n"
    + `  ${ASSETS}\n`
    + "Filenames: studio-scene-{theme}-light.png (see studio-wallpaper-prompts.mjs)",
  );
  process.exit(1);
}

console.log(`Processed ${processed} light wallpaper(s).`);
