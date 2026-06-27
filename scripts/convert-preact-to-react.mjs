#!/usr/bin/env node
/**
 * Convert legacy Preact desk .jsx → React .tsx (mechanical).
 */
import fs from "fs";
import path from "path";

const srcDir = path.resolve("src/desk/components");
const legacyDir = path.resolve(
  "/opt/mercuryos/08-archive/2026-06-12-legacy-capacitor-desk/desk/src/components",
);

function convert(content) {
  return content
    .replace(/from "preact\/hooks"/g, 'from "react"')
    .replace(/from 'preact\/hooks'/g, "from 'react'")
    .replace(/from "preact"/g, 'from "react"')
    .replace(/from 'preact'/g, "from 'react'")
    .replace(/\bclass=/g, "className=")
    .replace(/\.jsx/g, "")
    .replace(/@shared\//g, "@mos-app/")
    .replace(
      /from "\.\.\/lib\/([^"]+)\.js"/g,
      'from "@/desk/lib/$1"',
    )
    .replace(
      /from '\.\.\/lib\/([^']+)\.js'/g,
      "from '@/desk/lib/$1'",
    );
}

for (const file of fs.readdirSync(legacyDir)) {
  if (!file.endsWith(".jsx")) continue;
  const raw = fs.readFileSync(path.join(legacyDir, file), "utf8");
  const out = convert(raw);
  const base = file.replace(/\.jsx$/, "");
  fs.writeFileSync(path.join(srcDir, `${base}.tsx`), out);
  console.log("wrote", base + ".tsx");
}
