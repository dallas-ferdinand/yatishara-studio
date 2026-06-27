/** MercuryOS logo paths (static export, basePath /desk). */

const BASE = "/branding";

export const MERCURY_LOGO_SIDEBAR = `${BASE}/mercury_logo-32.webp`;
export const MERCURY_LOGO_BOOT = `${BASE}/mercury_logo-192.webp`;

type LogoFormat = "webp" | "png";

function logoPath(px: number, format: LogoFormat) {
  const name = px >= 512 ? "mercury_logo" : `mercury_logo-${px}`;
  return `${BASE}/${name}.${format}`;
}

/** Pick raster bucket + srcSet for a CSS display size. */
export function mercuryLogoAssets(cssPx: number) {
  const base = cssPx <= 36 ? 32 : cssPx <= 80 ? 96 : cssPx <= 160 ? 192 : 384;
  const retinaByBase: Record<number, number> = { 32: 96, 96: 192, 192: 384, 384: 512 };
  const retina = retinaByBase[base] ?? base;
  const webp1 = logoPath(base, "webp");
  const webp2 = logoPath(retina, "webp");
  return {
    src: webp2,
    srcSet: `${webp1} ${base}w, ${webp2} ${retina}w`,
    sizes: `${Math.round(cssPx)}px`,
    fallback: logoPath(base, "png"),
    fallback2x: logoPath(retina, "png"),
  };
}

/** Preload boot/loading logo (52px BrandMark → 192w retina). Skip 384 — only empty-state @2x. */
export const MERCURY_LOGO_PRELOAD = [
  { href: logoPath(192, "webp"), type: "image/webp" },
] as const;
