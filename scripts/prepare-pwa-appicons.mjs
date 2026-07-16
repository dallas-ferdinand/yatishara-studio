#!/usr/bin/env node
/**
 * Build opaque PWA / home-screen icons: black background + white Yatishara logo
 * (matches splash-light). Requires: sharp or ImageMagick `convert`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const outDir = join(root, "public/branding");
const source = join(outDir, "yatishara-logo-light.png");

if (!existsSync(source)) {
  console.warn("skip: missing public/branding/yatishara-logo-light.png");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const jobs = [
  { name: "yatishara-appicon-180.png", size: 180, scale: 0.72 },
  { name: "yatishara-appicon-192.png", size: 192, scale: 0.72 },
  { name: "yatishara-appicon-512.png", size: 512, scale: 0.72 },
  { name: "yatishara-appicon-maskable-192.png", size: 192, scale: 0.55 },
  { name: "yatishara-appicon-maskable-512.png", size: 512, scale: 0.55 },
];

for (const job of jobs) {
  const out = join(outDir, job.name);
  const logoPx = Math.round(job.size * job.scale);
  // Trim transparent padding, resize logo, center on solid black canvas.
  execFileSync(
    "convert",
    [
      "-size",
      `${job.size}x${job.size}`,
      "xc:black",
      "(",
      source,
      "-trim",
      "+repage",
      "-resize",
      `${logoPx}x${logoPx}`,
      ")",
      "-gravity",
      "center",
      "-compose",
      "over",
      "-composite",
      "-strip",
      out,
    ],
    { stdio: "inherit" },
  );
}

console.log("✓ PWA app icons → public/branding/yatishara-appicon-*.png");
