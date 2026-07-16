#!/usr/bin/env node
/**
 * Generate Android launcher + splash assets from Studio PWA icons.
 * Logo is padded so adaptive-icon crop does not make the mark feel oversized.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");

const resDir = path.resolve(__dirname, "../android/app/src/main/res");
const source = path.join(root, "public/branding/yatishara-appicon-512.png");
const maskable = path.join(root, "public/branding/yatishara-appicon-maskable-512.png");

const densities = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
];

/** Logo occupies this fraction of the canvas (rest is transparent padding). */
const LEGACY_LOGO_RATIO = 0.72;
const ADAPTIVE_FOREGROUND_RATIO = 0.56;

async function writePaddedPng(input, outPath, size, logoRatio) {
  await mkdir(path.dirname(outPath), { recursive: true });
  const logoSize = Math.max(1, Math.round(size * logoRatio));
  const logo = await sharp(input)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(outPath);
}

async function writeBlackSplash(outPath, width, height, markSize) {
  const mark = await sharp(source)
    .resize(markSize, markSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(outPath);
}

async function main() {
  for (const [dir, size] of densities) {
    const base = path.join(resDir, dir);
    await writePaddedPng(source, path.join(base, "ic_launcher.png"), size, LEGACY_LOGO_RATIO);
    await writePaddedPng(source, path.join(base, "ic_launcher_round.png"), size, LEGACY_LOGO_RATIO);
    // Adaptive foreground uses extra inset — Android crops the outer ~33%.
    await writePaddedPng(
      maskable,
      path.join(base, "ic_launcher_foreground.png"),
      size,
      ADAPTIVE_FOREGROUND_RATIO,
    );
  }

  await writeFile(
    path.join(resDir, "values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#000000</color>
</resources>
`,
  );

  // Replace default Capacitor splash placeholders with black + smaller mark.
  const splashDirs = (await readdir(resDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name.startsWith("drawable"))
    .map((d) => d.name);

  for (const dir of splashDirs) {
    const splashPath = path.join(resDir, dir, "splash.png");
    try {
      const meta = await sharp(splashPath).metadata();
      const w = meta.width || 480;
      const h = meta.height || 800;
      const markSize = Math.round(Math.min(w, h) * 0.18);
      await writeBlackSplash(splashPath, w, h, markSize);
    } catch {
      // directory has no splash.png
    }
  }

  console.log("Android launcher + splash assets generated (padded logo).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
