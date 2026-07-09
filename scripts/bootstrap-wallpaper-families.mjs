#!/usr/bin/env node
/**
 * Stub cinematic / spacey / scenic wallpapers from animated scene WebPs.
 * Copies only (never hardlink — shared inodes would corrupt all families on rewrite).
 *   node scripts/process-studio-wallpapers.mjs all --family=cinematic
 */
import { access, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, "..", "public");
const SOURCE_PREFIX = "studio-scene-";
const TARGET_PREFIXES = ["studio-cinematic-", "studio-space-", "studio-scenic-"];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function linkOrCopy(src, dest) {
  if (await exists(dest)) return "skip";
  await copyFile(src, dest);
  return "copy";
}

const files = (await readdir(PUBLIC)).filter(
  (name) => name.startsWith(SOURCE_PREFIX) && name.endsWith("-4k.webp"),
);

if (!files.length) {
  console.error(`No ${SOURCE_PREFIX}*-4k.webp files in ${PUBLIC}`);
  process.exit(1);
}

let created = 0;
for (const file of files) {
  const suffix = file.slice(SOURCE_PREFIX.length);
  const src = path.join(PUBLIC, file);
  for (const prefix of TARGET_PREFIXES) {
    const dest = path.join(PUBLIC, prefix + suffix);
    const result = await linkOrCopy(src, dest);
    if (result !== "skip") created += 1;
  }
}

console.log(
  `Wallpaper family bootstrap: ${created} stub file(s) from ${files.length} animated scene(s) × ${TARGET_PREFIXES.length} families.`,
);
