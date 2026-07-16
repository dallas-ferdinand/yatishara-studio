#!/usr/bin/env node
/**
 * Generate Android launcher + splash assets from Studio PWA icons.
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

async function writePng(input, outPath, size) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(input).resize(size, size).png().toFile(outPath);
}

async function writeBlackSplash(outPath, width, height, markSize) {
  const mark = await sharp(source).resize(markSize, markSize).png().toBuffer();
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
    await writePng(source, path.join(base, "ic_launcher.png"), size);
    await writePng(source, path.join(base, "ic_launcher_round.png"), size);
    await writePng(maskable, path.join(base, "ic_launcher_foreground.png"), size);
  }

  await writeFile(
    path.join(resDir, "values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#000000</color>
</resources>
`,
  );

  // Android notification icons are monochrome alpha masks. Convert the
  // existing black/white app mark into a transparent white status icon.
  const notificationSize = 96;
  const alpha = await sharp(source)
    .resize(notificationSize, notificationSize)
    .greyscale()
    .threshold(96)
    .raw()
    .toBuffer();
  await sharp({
    create: {
      width: notificationSize,
      height: notificationSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .joinChannel(alpha, { raw: { width: notificationSize, height: notificationSize, channels: 1 } })
    .png()
    .toFile(path.join(resDir, "drawable/ic_stat_studio.png"));

  // Replace default Capacitor splash placeholders with black + mark.
  const splashDirs = (await readdir(resDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name.startsWith("drawable"))
    .map((d) => d.name);

  for (const dir of splashDirs) {
    const splashPath = path.join(resDir, dir, "splash.png");
    try {
      const meta = await sharp(splashPath).metadata();
      const w = meta.width || 480;
      const h = meta.height || 800;
      const markSize = Math.round(Math.min(w, h) * 0.28);
      await writeBlackSplash(splashPath, w, h, markSize);
    } catch {
      // directory has no splash.png
    }
  }

  console.log("Android launcher + splash assets generated from Studio branding.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
