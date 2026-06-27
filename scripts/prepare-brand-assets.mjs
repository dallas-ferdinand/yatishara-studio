#!/usr/bin/env node
/** Regenerate public/branding logo sizes (PNG + WebP) from assets/branding/mercury_logo-source.png */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const source = join(root, "assets/branding/mercury_logo-source.png");
const outDir = join(root, "public/branding");

if (!existsSync(source)) {
  console.warn("skip: no assets/branding/mercury_logo-source.png");
  process.exit(0);
}

const sizes = [
  ["mercury_logo-32", 32],
  ["mercury_logo-96", 96],
  ["mercury_logo-192", 192],
  ["mercury_logo-384", 384],
  ["mercury_logo", 512],
];

for (const [base, px] of sizes) {
  const png = join(outDir, `${base}.png`);
  const webp = join(outDir, `${base}.webp`);
  execSync(
    `convert "${source}" -strip -filter Lanczos -resize ${px}x${px} "${png}"`,
    { stdio: "inherit" },
  );
  execSync(`convert "${png}" -quality 92 -define webp:method=6 "${webp}"`, { stdio: "inherit" });
}

console.log("✓ brand assets → public/branding/ (PNG + WebP)");
