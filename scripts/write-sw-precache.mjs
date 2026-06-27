#!/usr/bin/env node
/** Generate out/sw-precache.json — version marker only (SW caches shell offline, not all chunks). */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = join(import.meta.dirname, "..", "out");

const versionPath = join(outDir, "version.json");
let version = "dev";
try {
  const raw = JSON.parse(await readFile(versionPath, "utf8"));
  version = String(raw.deskBuildId ?? raw.build ?? raw.version ?? "dev");
} catch {
  /* ok */
}

const manifest = {
  version,
  assets: ["./", "./index.html", "./version.json", "./manifest.webmanifest"],
};
await writeFile(join(outDir, "sw-precache.json"), JSON.stringify(manifest, null, 2));
console.log(`→ sw-precache.json (shell only, version ${version})`);
