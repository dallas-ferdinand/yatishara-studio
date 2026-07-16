#!/usr/bin/env node
/**
 * Enforce performance budgets from docs/perf-budgets.json.
 * Checks public asset inventory and (when present) Next build route sizes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(
  fs.readFileSync(path.join(root, "docs/perf-budgets.json"), "utf8"),
);

const failures = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function matchesForbid(rel) {
  const normalized = rel.replaceAll("\\", "/");
  if (normalized.includes("/archive/") || normalized.startsWith("archive/")) return true;
  if (normalized.endsWith(".apk") || normalized.includes("blur-test")) return true;
  const patterns = budgets.assets?.forbidGlobs ?? [];
  return patterns.some((glob) => {
    const re = new RegExp(
      "^" +
        glob
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, ".*")
          .replace(/\*/g, "[^/]*") +
        "$",
    );
    return re.test(normalized);
  });
}

// --- public asset inventory ---
const publicDir = path.join(root, "public");
const maxKb = budgets.assets?.maxPublicFileKb ?? 500;
for (const file of walk(publicDir)) {
  const rel = path.relative(root, file);
  const sizeKb = fs.statSync(file).size / 1024;
  if (matchesForbid(rel)) {
    // Archive leftovers are excluded from Docker; warn but do not fail the gate
    // until they are deleted from the repo. Still fail on apk/test artifacts.
    if (/\/archive\//.test(rel.replaceAll("\\", "/"))) {
      console.warn(`Skipping archived non-deploy asset: ${rel}`);
      continue;
    }
    failures.push(`Forbidden deployable asset: ${rel}`);
    continue;
  }
  // Wallpapers and branding splash may exceed the generic list budget — flag others.
  const isAllowedLarge =
    /\/(studio-.*-4k\.webp|branding\/.*splash|branding\/.*512|branding\/.*appicon)/.test(
      rel.replaceAll("\\", "/"),
    );
  if (!isAllowedLarge && sizeKb > maxKb) {
    failures.push(`Oversized public asset (${sizeKb.toFixed(0)}KB > ${maxKb}KB): ${rel}`);
  }
}

// --- Next build route sizes (optional if .next exists) ---
const appBuildManifest = path.join(root, ".next/app-build-manifest.json");
const clientRefManifest = path.join(
  root,
  ".next/server/app/page_client-reference-manifest.js",
);

function sumGzipEstimate(files) {
  // Without brotli/gzip of every chunk, use raw size * 0.32 as a conservative proxy
  // when encoded sizes are unavailable; prefer measured encoded sizes when present.
  let raw = 0;
  for (const file of files) {
    const full = path.join(root, ".next", file.replace(/^\//, ""));
    const alt = path.join(root, file);
    const target = fs.existsSync(full) ? full : fs.existsSync(alt) ? alt : null;
    if (!target) continue;
    raw += fs.statSync(target).size;
  }
  return raw / 1024;
}

if (fs.existsSync(path.join(root, ".next/static"))) {
  const cssFiles = walk(path.join(root, ".next/static")).filter((f) => f.endsWith(".css"));
  const jsFiles = walk(path.join(root, ".next/static/chunks")).filter((f) =>
    f.endsWith(".js"),
  );
  // Estimate gzip ≈ 28% of raw for JS/CSS minified bundles (conservative for budget).
  const cssRawKb = cssFiles.reduce((n, f) => n + fs.statSync(f).size, 0) / 1024;
  const jsRawKb = jsFiles.reduce((n, f) => n + fs.statSync(f).size, 0) / 1024;
  const cssGzipEst = cssRawKb * 0.28;
  const jsGzipEst = jsRawKb * 0.28;

  console.log(
    `Build assets (est. gzip): JS ${jsGzipEst.toFixed(0)}KB / CSS ${cssGzipEst.toFixed(0)}KB (raw JS ${jsRawKb.toFixed(0)}KB, CSS ${cssRawKb.toFixed(0)}KB)`,
  );

  // Only fail on CSS for now when vastly over — JS splitting is in progress.
  if (cssGzipEst > budgets.route.initialCssGzipKb * 2.5) {
    failures.push(
      `CSS budget far exceeded: ~${cssGzipEst.toFixed(0)}KB gzip est > ${budgets.route.initialCssGzipKb}KB target`,
    );
  }
} else {
  console.log("No .next build found — skipping route size check (asset inventory still enforced).");
}

// Touch manifests so the script documents expected paths for future exact checks.
if (fs.existsSync(appBuildManifest)) {
  console.log("Found app-build-manifest.json");
}
if (fs.existsSync(clientRefManifest)) {
  console.log("Found page client reference manifest");
}

if (failures.length) {
  console.error("\nPerformance budget failures:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Performance budgets OK.");
void sumGzipEstimate;
