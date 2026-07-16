/** Sample a wallpaper image and derive accent (+ dark surfaces) for the desk palette. */

export type ExtractedWallpaperPalette = {
  accent: string;
  bg?: string;
  surface?: string;
  raised?: string;
};

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function loadImage(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load wallpaper for palette extraction"));
    img.src = url;
  });
}

/**
 * Extract a vivid mid-tone accent and optional dark surfaces from an image URL.
 * Returns null when the canvas is tainted (CORS) or the image fails to load.
 */
export async function extractWallpaperPalette(
  url: string,
  opts?: { crossOrigin?: boolean },
): Promise<ExtractedWallpaperPalette | null> {
  if (typeof document === "undefined" || !url) return null;

  const tryExtract = async (crossOrigin: boolean): Promise<ExtractedWallpaperPalette | null> => {
    try {
      const img = await loadImage(url, crossOrigin);
      const size = 48;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, size, size);
      let data: ImageData;
      try {
        data = ctx.getImageData(0, 0, size, size);
      } catch {
        return null;
      }

      type Bucket = { r: number; g: number; b: number; count: number; score: number };
      const accentBuckets: Bucket[] = [];
      const darkBuckets: Bucket[] = [];

      for (let i = 0; i < data.data.length; i += 4) {
        const a = data.data[i + 3] ?? 0;
        if (a < 128) continue;
        const r = data.data[i] ?? 0;
        const g = data.data[i + 1] ?? 0;
        const b = data.data[i + 2] ?? 0;
        const lum = luminance(r, g, b);
        const sat = saturation(r, g, b);

        if (lum >= 0.12 && lum <= 0.78 && sat >= 0.12) {
          const score = sat * (1 - Math.abs(lum - 0.48) * 1.4);
          accentBuckets.push({ r, g, b, count: 1, score });
        }
        if (lum <= 0.35) {
          darkBuckets.push({ r, g, b, count: 1, score: 1 - lum });
        }
      }

      const pickWeighted = (buckets: Bucket[]): { r: number; g: number; b: number } | null => {
        if (buckets.length === 0) return null;
        // Quantize into 16-level bins and pick highest weight.
        const map = new Map<string, { r: number; g: number; b: number; w: number }>();
        for (const px of buckets) {
          const key = `${px.r >> 4},${px.g >> 4},${px.b >> 4}`;
          const prev = map.get(key);
          const w = px.score;
          if (prev) {
            prev.r += px.r;
            prev.g += px.g;
            prev.b += px.b;
            prev.w += w;
          } else {
            map.set(key, { r: px.r, g: px.g, b: px.b, w });
          }
        }
        let best: { r: number; g: number; b: number; w: number } | null = null;
        for (const entry of map.values()) {
          if (!best || entry.w > best.w) best = entry;
        }
        if (!best || best.w <= 0) return null;
        const n = buckets.filter((px) => {
          const key = `${px.r >> 4},${px.g >> 4},${px.b >> 4}`;
          const bkey = `${best!.r >> 4},${best!.g >> 4},${best!.b >> 4}`;
          return key === bkey;
        }).length || 1;
        return {
          r: best.r / n,
          g: best.g / n,
          b: best.b / n,
        };
      };

      // Simpler: average top-scoring accent pixels
      accentBuckets.sort((a, b) => b.score - a.score);
      const top = accentBuckets.slice(0, Math.max(8, Math.floor(accentBuckets.length * 0.15)));
      let accent: { r: number; g: number; b: number } | null = null;
      if (top.length > 0) {
        const sum = top.reduce(
          (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
          { r: 0, g: 0, b: 0 },
        );
        accent = { r: sum.r / top.length, g: sum.g / top.length, b: sum.b / top.length };
      } else {
        accent = pickWeighted(accentBuckets);
      }

      if (!accent) {
        // Fallback: mean of all non-extreme pixels
        let count = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < data.data.length; i += 4) {
          const rr = data.data[i] ?? 0;
          const gg = data.data[i + 1] ?? 0;
          const bb = data.data[i + 2] ?? 0;
          const lum = luminance(rr, gg, bb);
          if (lum < 0.08 || lum > 0.92) continue;
          r += rr;
          g += gg;
          b += bb;
          count += 1;
        }
        if (count === 0) return null;
        accent = { r: r / count, g: g / count, b: b / count };
      }

      const result: ExtractedWallpaperPalette = {
        accent: toHex(accent.r, accent.g, accent.b),
      };

      darkBuckets.sort((a, b) => b.score - a.score);
      const darkTop = darkBuckets.slice(0, Math.max(12, Math.floor(darkBuckets.length * 0.2)));
      if (darkTop.length > 0) {
        const sum = darkTop.reduce(
          (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
          { r: 0, g: 0, b: 0 },
        );
        const bg = {
          r: sum.r / darkTop.length,
          g: sum.g / darkTop.length,
          b: sum.b / darkTop.length,
        };
        // Ensure bg is dark enough for chrome
        const lum = luminance(bg.r, bg.g, bg.b);
        const scale = lum > 0.22 ? 0.22 / lum : 1;
        const bgHex = toHex(bg.r * scale, bg.g * scale, bg.b * scale);
        const surface = toHex(
          Math.min(255, bg.r * scale + 18),
          Math.min(255, bg.g * scale + 18),
          Math.min(255, bg.b * scale + 22),
        );
        const raised = toHex(
          Math.min(255, bg.r * scale + 32),
          Math.min(255, bg.g * scale + 32),
          Math.min(255, bg.b * scale + 38),
        );
        result.bg = bgHex;
        result.surface = surface;
        result.raised = raised;
      }

      return result;
    } catch {
      return null;
    }
  };

  const preferCors = opts?.crossOrigin !== false;
  if (preferCors) {
    const withCors = await tryExtract(true);
    if (withCors) return withCors;
  }
  // Same-origin presets may work without CORS attribute
  return tryExtract(false);
}
