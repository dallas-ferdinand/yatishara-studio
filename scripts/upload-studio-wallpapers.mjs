#!/usr/bin/env node
/**
 * Recompress registry wallpapers and upload to Bunny CDN.
 *
 * Usage:
 *   node scripts/upload-studio-wallpapers.mjs
 *   node scripts/upload-studio-wallpapers.mjs --skip-upload
 *   node scripts/upload-studio-wallpapers.mjs --skip-recompress
 *
 * Env (from .env.local or process):
 *   BUNNY_STORAGE_ZONE, BUNNY_STORAGE_ACCESS_KEY, BUNNY_STORAGE_REGION?
 *   BUNNY_PULL_ZONE_HOSTNAME
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const OUT_DIR = join(ROOT, ".tmp", "studio-wallpapers-v1");
const VERSION = "v1";
const STORAGE_PREFIX = `studio/wallpapers/${VERSION}`;
const MAX_WIDTH = 3840;
const QUALITY = 90;

const THEMES = [
  "agent-genesis",
  "gold-archive",
  "ocean-depth",
  "ember-forge",
  "mint-meadow",
  "violet-dusk",
  "rose-bloom",
  "cobalt-skyline",
  "coral-reef",
  "sage-grove",
  "cherry-pulse",
  "teal-lagoon",
  "lime-canopy",
  "fuchsia-neon",
  "copper-foundry",
  "indigo-midnight",
];
const PREFIXES = ["studio-scene", "studio-cinematic"];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile("/tmp/bunny.env");

const skipUpload = process.argv.includes("--skip-upload");
const skipRecompress = process.argv.includes("--skip-recompress");

function expectedNames() {
  const names = [];
  for (const prefix of PREFIXES) {
    for (const theme of THEMES) {
      names.push(`${prefix}-${theme}-4k.webp`);
      names.push(`${prefix}-${theme}-light-4k.webp`);
    }
  }
  return names;
}

function recompress(src, dest) {
  const result = spawnSync(
    "convert",
    [src, "-resize", `${MAX_WIDTH}x>`, "-quality", String(QUALITY), dest],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`convert failed for ${src}: ${result.stderr || result.stdout}`);
  }
}

function storageHost() {
  const region = process.env.BUNNY_STORAGE_REGION?.trim();
  return region ? `${region}.storage.bunnycdn.com` : "storage.bunnycdn.com";
}

async function putBunny(path, body, contentType) {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const key = process.env.BUNNY_STORAGE_ACCESS_KEY;
  if (!zone || !key) throw new Error("Missing BUNNY_STORAGE_ZONE / BUNNY_STORAGE_ACCESS_KEY");
  const url = `https://${storageHost()}/${zone}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: key,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bunny PUT ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const names = expectedNames();
  const missing = names.filter((n) => !existsSync(join(PUBLIC, n)));
  if (missing.length) {
    throw new Error(`Missing source wallpapers:\n${missing.join("\n")}`);
  }

  let totalIn = 0;
  let totalOut = 0;
  const manifest = [];

  for (const name of names) {
    const src = join(PUBLIC, name);
    const dest = join(OUT_DIR, name);
    const inSize = statSync(src).size;
    totalIn += inSize;

    if (!skipRecompress || !existsSync(dest)) {
      recompress(src, dest);
    }
    const outSize = statSync(dest).size;
    totalOut += outSize;
    const sha = createHash("sha256").update(readFileSync(dest)).digest("hex").slice(0, 12);
    manifest.push({ name, inBytes: inSize, outBytes: outSize, sha });
    const ratio = ((outSize / inSize) * 100).toFixed(0);
    console.log(`${name}: ${(inSize / 1024).toFixed(0)}KB → ${(outSize / 1024).toFixed(0)}KB (${ratio}%)`);
  }

  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify({ version: VERSION, files: manifest }, null, 2));
  console.log(
    `\nTotal: ${(totalIn / 1024 / 1024).toFixed(1)}MB → ${(totalOut / 1024 / 1024).toFixed(1)}MB`,
  );

  if (skipUpload) {
    console.log("Skip upload.");
    return;
  }

  for (const { name } of manifest) {
    const body = readFileSync(join(OUT_DIR, name));
    const path = `${STORAGE_PREFIX}/${name}`;
    await putBunny(path, body, "image/webp");
    console.log(`uploaded ${path}`);
  }

  const host = (process.env.BUNNY_PULL_ZONE_HOSTNAME || "").replace(/\/$/, "");
  if (!host) throw new Error("Missing BUNNY_PULL_ZONE_HOSTNAME");
  const base = `https://${host}/${STORAGE_PREFIX}`;
  console.log(`\nCDN base: ${base}`);
  console.log(`Set NEXT_PUBLIC_STUDIO_BG_CDN=${base}`);

  // smoke one file
  const probe = `${base}/${names[0]}`;
  const head = await fetch(probe, { method: "HEAD" });
  console.log(`probe ${probe} → ${head.status} (${head.headers.get("content-type")})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
