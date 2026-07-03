/** Yatishara Studio logo paths. Export names stay stable for older Desk components. */

const BASE = "/branding";

/** Light-colored logo for dark backgrounds (default chrome). */
export const MERCURY_LOGO_SIDEBAR = `${BASE}/yatishara-logo-light-32.webp`;
export const MERCURY_LOGO_BOOT = `${BASE}/yatishara-logo-light-192.webp`;

export type LogoInk = "light" | "dark";
export type AppearanceMode = "light" | "dark";

type LogoFormat = "webp" | "png";

/** Dark ink on light canvas; light ink on dark canvas. */
export function logoInkForAppearance(appearance?: string | null): LogoInk {
  return appearance === "light" ? "dark" : "light";
}

function logoPath(px: number, format: LogoFormat, ink: LogoInk = "light") {
  const name = `yatishara-logo-${ink}-${px}`;
  return `${BASE}/${name}.${format}`;
}

export function mercuryLogoSidebarSrc(appearance?: string | null) {
  return logoPath(32, "webp", logoInkForAppearance(appearance));
}

/** Pick raster bucket + srcSet for a CSS display size. */
export function mercuryLogoAssets(cssPx: number, appearance?: string | null) {
  const ink = logoInkForAppearance(appearance);
  const base = cssPx <= 36 ? 32 : cssPx <= 80 ? 96 : cssPx <= 160 ? 192 : 384;
  const retinaByBase: Record<number, number> = { 32: 96, 96: 192, 192: 384, 384: 512 };
  const retina = retinaByBase[base] ?? base;
  const webp1 = logoPath(base, "webp", ink);
  const webp2 = logoPath(retina, "webp", ink);
  return {
    src: webp2,
    srcSet: `${webp1} ${base}w, ${webp2} ${retina}w`,
    sizes: `${Math.round(cssPx)}px`,
    fallback: logoPath(base, "png", ink),
    fallback2x: logoPath(retina, "png", ink),
  };
}

/** Preload boot/loading logo (52px BrandMark → 192w retina). Skip 384 — only empty-state @2x. */
export const MERCURY_LOGO_PRELOAD = [
  { href: logoPath(192, "webp", "light"), type: "image/webp" },
  { href: logoPath(192, "webp", "dark"), type: "image/webp" },
] as const;
