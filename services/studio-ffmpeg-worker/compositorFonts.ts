import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";
import { downloadToFile } from "../../convex/lib/studioFfmpeg.ts";
import { isLegacySystemFont } from "../../src/studio/editor/loadGoogleFont.ts";

const DEJAVU = "/usr/share/fonts/truetype/dejavu";
const LIBERATION = "/usr/share/fonts/truetype/liberation";

const SYSTEM_FILES: Array<{ family: string; path: string }> = [
  { family: "system-ui", path: `${DEJAVU}/DejaVuSans.ttf` },
  { family: "Segoe UI", path: `${DEJAVU}/DejaVuSans.ttf` },
  { family: "Inter", path: `${DEJAVU}/DejaVuSans.ttf` },
  { family: "Helvetica Neue", path: `${DEJAVU}/DejaVuSans.ttf` },
  { family: "Helvetica", path: `${DEJAVU}/DejaVuSans.ttf` },
  { family: "Arial", path: `${DEJAVU}/DejaVuSans.ttf` },
  { family: "Georgia", path: `${DEJAVU}/DejaVuSerif.ttf` },
  { family: "Times New Roman", path: `${DEJAVU}/DejaVuSerif.ttf` },
  { family: "Times", path: `${DEJAVU}/DejaVuSerif.ttf` },
  { family: "ui-monospace", path: `${DEJAVU}/DejaVuSansMono.ttf` },
  { family: "SFMono-Regular", path: `${DEJAVU}/DejaVuSansMono.ttf` },
  { family: "Menlo", path: `${DEJAVU}/DejaVuSansMono.ttf` },
  { family: "Consolas", path: `${DEJAVU}/DejaVuSansMono.ttf` },
  { family: "Impact", path: `${LIBERATION}/LiberationSans-Bold.ttf` },
  { family: "Arial Black", path: `${LIBERATION}/LiberationSans-Bold.ttf` },
];

const registered = new Set<string>();

function registerPath(family: string, filePath: string): void {
  const key = `${family}::${filePath}`;
  if (registered.has(key)) return;
  try {
    GlobalFonts.registerFromPath(filePath, family);
    registered.add(key);
  } catch {
    /* missing distro font */
  }
}

export function registerSystemFonts(): void {
  for (const item of SYSTEM_FILES) registerPath(item.family, item.path);
}

async function downloadGoogleFont(
  family: string,
  destDir: string,
): Promise<string | null> {
  const cssFamily = family.trim().replace(/\s+/g, "+");
  const cssUrl = `https://fonts.googleapis.com/css2?family=${cssFamily}:wght@400;600;700&display=swap`;
  try {
    const res = await fetch(cssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const css = await res.text();
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    const fontUrl = match?.[1];
    if (!fontUrl) return null;
    const ext = fontUrl.includes(".otf") ? "otf" : fontUrl.includes(".woff") ? "woff" : "ttf";
    const safe = family.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);
    const dest = join(destDir, `gf_${safe}.${ext}`);
    await downloadToFile(fontUrl, dest);
    return dest;
  } catch {
    return null;
  }
}

export async function registerExportFonts(
  families: string[],
  destDir: string,
): Promise<void> {
  registerSystemFonts();
  await mkdir(destDir, { recursive: true });
  const unique = [...new Set(families.map((item) => item.trim()).filter(Boolean))];
  for (const family of unique) {
    if (isLegacySystemFont(family)) continue;
    if (registered.has(`gf:${family}`)) continue;
    const file = await downloadGoogleFont(family, destDir);
    if (!file) continue;
    try {
      GlobalFonts.registerFromPath(file, family);
      registered.add(`gf:${family}`);
    } catch {
      /* skip unreadable webfont */
    }
  }
}
