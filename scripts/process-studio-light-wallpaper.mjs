#!/usr/bin/env node
/** Upscale light scene PNG to 3840×2160 WebP — lift whites, no vignette crush. */
import sharp from "sharp";
import { stat } from "node:fs/promises";
import path from "node:path";

const TARGET_W = 3840;
const TARGET_H = 2160;
const WEBP_QUALITY = 92;

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/process-studio-light-wallpaper.mjs <input> <output.webp>");
  process.exit(1);
}

await sharp(inputPath)
  .resize(TARGET_W, TARGET_H, { fit: "cover", position: "centre", kernel: sharp.kernel.lanczos3 })
  .modulate({ brightness: 1.04, saturation: 0.9 })
  .linear(1.02, -6)
  .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
  .toFile(outputPath);

const info = await stat(outputPath);
const meta = await sharp(outputPath).metadata();
console.log(`${path.basename(outputPath)}: ${meta.width}x${meta.height}, ${Math.round(info.size / 1024)}KB`);
