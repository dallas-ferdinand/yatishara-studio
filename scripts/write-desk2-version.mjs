#!/usr/bin/env node
/** Stamp desk out/version.json after Next.js static export. */
import { writeDeskWebVersion } from "../../../_system/lib/client-version.mjs";

const meta = writeDeskWebVersion();
console.log("→ desk version:", meta.versionName, `build ${meta.deskBuildId}`);
