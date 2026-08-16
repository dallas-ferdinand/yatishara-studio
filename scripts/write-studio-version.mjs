#!/usr/bin/env node
/**
 * Stamp Studio public/version.json so open tabs can poll for a new deploy.
 * Uses NEXT_PUBLIC_DESK_BUILD when set (fast-deploy / Coolify), else package version.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const versionName = String(pkg.version ?? "0.0.0");
const m = versionName.match(/^(\d+)\.(\d+)\.(\d+)/);
const versionCode = m
  ? Number(m[1]) * 10_000 + Number(m[2]) * 100 + Number(m[3])
  : 0;
const envBuild = String(process.env.NEXT_PUBLIC_DESK_BUILD ?? "").trim();
const buildId = envBuild || `local-${versionName}`;
const builtAt = new Date().toISOString();
const meta = {
  versionName,
  versionCode,
  deskBuildId: buildId,
  studioBuildId: buildId,
  builtAt,
  channel: "web",
};

const targets = [];
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
if (outArg) {
  targets.push(outArg.slice("--out=".length));
} else {
  targets.push(join(root, "public"));
  const standalonePublic = join(root, ".next", "standalone", "public");
  if (existsSync(join(root, ".next", "standalone"))) {
    targets.push(standalonePublic);
  }
}

const json = `${JSON.stringify(meta, null, 2)}\n`;
for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "version.json"), json);
  console.log(`→ studio version: ${versionName} build ${buildId} → ${dir}/version.json`);
}
