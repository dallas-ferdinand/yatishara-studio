import type { CSSProperties } from "react";
import type { TextClipContent } from "./types";

export type TextPresetCategory =
  | "title"
  | "soft"
  | "outline"
  | "badge";

/** Style fields applied by a preset (never overwrites clip wording unless asked). */
export type TextStylePatch = Omit<
  Partial<TextClipContent>,
  "text" | "animation" | "animationDuration" | "animationOut" | "animationOutDuration"
>;

export type TextStylePreset = {
  id: string;
  name: string;
  category: TextPresetCategory;
  /** Short sample shown on the card (not applied to the clip). */
  sample: string;
  style: TextStylePatch;
};

export const TEXT_PRESET_CATEGORIES: Array<{
  id: TextPresetCategory | "all" | "mine";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "title", label: "Title" },
  { id: "soft", label: "Soft" },
  { id: "outline", label: "Outline" },
  { id: "badge", label: "Badge" },
  { id: "mine", label: "Mine" },
];

/**
 * Clean library looks — more options, varied badge rounding.
 * Card stages use accent-tinted light/dark plates so ink reads in both themes.
 */
export const BUILTIN_TEXT_PRESETS: TextStylePreset[] = [
  // Soft — plain ink
  {
    id: "clean-white",
    name: "White",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 42,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "clean-black",
    name: "Black",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 42,
      color: "#111827",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "clean-muted",
    name: "Muted",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 40,
      color: "#9CA3AF",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "cream",
    name: "Cream",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 44,
      color: "#FFF7ED",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "soft-slate",
    name: "Slate",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 42,
      color: "#64748B",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "soft-ivory",
    name: "Ivory",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 42,
      color: "#FAFAF9",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "caption",
    name: "Caption",
    category: "soft",
    sample: "Caption",
    style: {
      fontFamily: "Inter",
      fontSize: 28,
      color: "#F3F4F6",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "caption-dark",
    name: "Caption Dark",
    category: "soft",
    sample: "Caption",
    style: {
      fontFamily: "Inter",
      fontSize: 28,
      color: "#1F2937",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "soft-italic",
    name: "Italic",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 42,
      italic: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "soft-underline",
    name: "Underline",
    category: "soft",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 40,
      underline: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },

  // Title
  {
    id: "title-white",
    name: "Title",
    category: "title",
    sample: "Title",
    style: {
      fontFamily: "Inter",
      fontSize: 56,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      letterSpacing: -0.02,
      lineHeight: 1.1,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "title-black",
    name: "Title Dark",
    category: "title",
    sample: "Title",
    style: {
      fontFamily: "Inter",
      fontSize: 56,
      bold: true,
      color: "#111827",
      strokeWidth: 0,
      glow: false,
      letterSpacing: -0.02,
      lineHeight: 1.1,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "title-upper",
    name: "Upper",
    category: "title",
    sample: "TITLE",
    style: {
      fontFamily: "Inter",
      fontSize: 48,
      bold: true,
      textCase: "upper",
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      letterSpacing: 0.08,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "title-tight",
    name: "Tight",
    category: "title",
    sample: "Title",
    style: {
      fontFamily: "Inter",
      fontSize: 54,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      letterSpacing: -0.05,
      lineHeight: 1.05,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "serif-title",
    name: "Serif",
    category: "title",
    sample: "Title",
    style: {
      fontFamily: "Playfair Display",
      fontSize: 52,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      letterSpacing: -0.01,
      lineHeight: 1.15,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "serif-dark",
    name: "Serif Dark",
    category: "title",
    sample: "Title",
    style: {
      fontFamily: "Playfair Display",
      fontSize: 52,
      color: "#111827",
      strokeWidth: 0,
      glow: false,
      letterSpacing: -0.01,
      lineHeight: 1.15,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "title-wide",
    name: "Wide",
    category: "title",
    sample: "Title",
    style: {
      fontFamily: "Inter",
      fontSize: 46,
      bold: true,
      textCase: "upper",
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      letterSpacing: 0.18,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "title-light",
    name: "Light Title",
    category: "title",
    sample: "Title",
    style: {
      fontFamily: "Inter",
      fontSize: 52,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      letterSpacing: -0.01,
      align: "center",
      opacity: 1,
    },
  },

  // Outline
  {
    id: "outline-light",
    name: "Outline",
    category: "outline",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 48,
      bold: true,
      color: "#FFFFFF",
      strokeColor: "#111827",
      strokeWidth: 4,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "outline-dark",
    name: "Outline Dark",
    category: "outline",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 48,
      bold: true,
      color: "#111827",
      strokeColor: "#FFFFFF",
      strokeWidth: 4,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "outline-thin",
    name: "Thin Outline",
    category: "outline",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 48,
      bold: true,
      color: "#FFFFFF",
      strokeColor: "#111827",
      strokeWidth: 2,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "outline-thick",
    name: "Thick Outline",
    category: "outline",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 46,
      bold: true,
      color: "#FFFFFF",
      strokeColor: "#0A0A0A",
      strokeWidth: 7,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "outline-cream",
    name: "Cream Outline",
    category: "outline",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 48,
      bold: true,
      color: "#FFF7ED",
      strokeColor: "#1C1917",
      strokeWidth: 4,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "outline-soft",
    name: "Soft Outline",
    category: "outline",
    sample: "Aa",
    style: {
      fontFamily: "Inter",
      fontSize: 48,
      bold: true,
      color: "#F8FAFC",
      strokeColor: "#334155",
      strokeWidth: 3,
      glow: false,
      align: "center",
      opacity: 1,
    },
  },

  // Badge — varied rounding
  {
    id: "badge-pill",
    name: "Pill",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#111827",
      backgroundPadding: 12,
      backgroundRadius: 999,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-pill-light",
    name: "Pill Light",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#111827",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#F3F4F6",
      backgroundPadding: 12,
      backgroundRadius: 999,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-round-lg",
    name: "Round 16",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#111827",
      backgroundPadding: 12,
      backgroundRadius: 16,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-round-md",
    name: "Round 10",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#111827",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#F8FAFC",
      backgroundPadding: 12,
      backgroundRadius: 10,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-round-sm",
    name: "Round 6",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#1F2937",
      backgroundPadding: 11,
      backgroundRadius: 6,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-square",
    name: "Square",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#111827",
      backgroundPadding: 10,
      backgroundRadius: 0,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-soft-4",
    name: "Soft 4",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#111827",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#E5E7EB",
      backgroundPadding: 11,
      backgroundRadius: 4,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-round-24",
    name: "Round 24",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#0F172A",
      backgroundPadding: 14,
      backgroundRadius: 24,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-cream",
    name: "Cream Box",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#1C1917",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#FFF7ED",
      backgroundPadding: 12,
      backgroundRadius: 12,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-ink",
    name: "Ink Box",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#FAFAF9",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#292524",
      backgroundPadding: 12,
      backgroundRadius: 8,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-ghost",
    name: "Ghost",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "rgba(255,255,255,0.18)",
      backgroundPadding: 12,
      backgroundRadius: 999,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "badge-chip",
    name: "Chip",
    category: "badge",
    sample: "Tag",
    style: {
      fontFamily: "Inter",
      fontSize: 22,
      bold: true,
      color: "#111827",
      strokeWidth: 0,
      glow: false,
      backgroundColor: "#FFFFFF",
      backgroundPadding: 10,
      backgroundRadius: 8,
      align: "center",
      opacity: 1,
    },
  },
];

const STYLE_KEYS: Array<keyof TextStylePatch> = [
  "fontFamily",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "textCase",
  "letterSpacing",
  "lineHeight",
  "color",
  "align",
  "verticalAlign",
  "strokeColor",
  "strokeWidth",
  "backgroundColor",
  "backgroundPadding",
  "backgroundRadius",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "glow",
  "glowColor",
  "glowBlur",
  "opacity",
  "flipX",
  "flipY",
];

export function textStyleSnapshot(text: TextClipContent): TextStylePatch {
  const out: TextStylePatch = {};
  for (const key of STYLE_KEYS) {
    const value = text[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function applyTextStylePreset(
  text: TextClipContent,
  style: TextStylePatch,
): TextClipContent {
  return {
    ...text,
    ...style,
    strokeWidth: style.strokeWidth ?? 0,
    strokeColor: style.strokeColor ?? text.strokeColor ?? "#000000",
    backgroundColor:
      style.backgroundColor === undefined ? null : style.backgroundColor,
    backgroundRadius:
      style.backgroundRadius ??
      (style.backgroundColor ? text.backgroundRadius ?? 0 : 0),
    shadowColor: style.shadowColor === undefined ? null : style.shadowColor,
    shadowBlur: style.shadowBlur ?? 0,
    shadowOffsetX: style.shadowOffsetX ?? 0,
    shadowOffsetY: style.shadowOffsetY ?? 0,
    glow: style.glow ?? false,
    glowColor: style.glowColor ?? "#ffffff",
    glowBlur: style.glowBlur ?? 12,
  };
}

function norm(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return String(Math.round(value * 1000) / 1000);
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).toLowerCase();
}

/** Loose match so slight inspector tweaks don’t leave every card inactive. */
export function textStyleMatchesPreset(
  text: TextClipContent,
  style: TextStylePatch,
): boolean {
  const keys: Array<keyof TextStylePatch> = [
    "fontFamily",
    "color",
    "strokeWidth",
    "strokeColor",
    "glow",
    "glowColor",
    "backgroundColor",
    "shadowColor",
    "bold",
    "textCase",
  ];
  for (const key of keys) {
    if (style[key] === undefined) continue;
    const a = text[key];
    const b = style[key];
    if (key === "strokeWidth") {
      const aw = Number(a ?? 0);
      const bw = Number(b ?? 0);
      if ((aw > 0) !== (bw > 0)) return false;
      if (bw > 0 && Math.abs(aw - bw) > 2) return false;
      continue;
    }
    if (key === "fontFamily") {
      const af = String(a ?? "system").toLowerCase();
      const bf = String(b ?? "system").toLowerCase();
      if (af !== bf) return false;
      continue;
    }
    if (norm(a) !== norm(b)) return false;
  }
  return true;
}


/** Relative luminance 0–1 from #rgb / #rrggbb / rgba(). */
function colorLuma(raw: string | null | undefined): number {
  if (!raw) return 1;
  const s = String(raw).trim();
  let r = 255;
  let g = 255;
  let b = 255;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  } else {
    const rgb = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (rgb) {
      r = Number(rgb[1]);
      g = Number(rgb[2]);
      b = Number(rgb[3]);
    }
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Accent-tinted stage plate: dark for light ink, light for dark ink —
 * so both themes read clearly on the card.
 */
export function presetStageTone(style: TextStylePatch): "light" | "dark" {
  // Badge plates: contrast the fill. Plain ink: contrast the glyph.
  const probe = style.backgroundColor
    ? colorLuma(style.backgroundColor)
    : colorLuma(style.color ?? "#fff");
  return probe >= 0.55 ? "dark" : "light";
}

export function presetPreviewStyle(style: TextStylePatch): CSSProperties {
  const stroke = Number(style.strokeWidth ?? 0);
  const shadows: string[] = [];
  if (style.glow) {
    const c = style.glowColor ?? "#ffffff";
    const b = Math.max(6, Number(style.glowBlur ?? 12) * 0.55);
    shadows.push(`0 0 ${b * 0.45}px ${c}`);
    shadows.push(`0 0 ${b}px ${c}`);
    shadows.push(`0 0 ${b * 1.7}px ${c}`);
  }
  if (style.shadowColor) {
    const sx = style.shadowOffsetX ?? 0;
    const sy = style.shadowOffsetY ?? 2;
    const sb = style.shadowBlur ?? 0;
    shadows.push(`${sx}px ${sy}px ${sb}px ${style.shadowColor}`);
    if (sb <= 2 && (sx !== 0 || sy !== 0)) {
      shadows.push(`${sx}px ${sy}px 0 ${style.shadowColor}`);
    }
  }
  const family =
    style.fontFamily && style.fontFamily !== "system"
      ? `"${style.fontFamily}", system-ui, sans-serif`
      : "system-ui, sans-serif";
  const previewStroke =
    stroke > 0 ? Math.max(1.25, Math.min(5.5, stroke * 0.48)) : 0;
  return {
    fontFamily: family,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    color: style.color ?? "#ffffff",
    WebkitTextStroke:
      previewStroke > 0
        ? `${previewStroke}px ${style.strokeColor ?? "#000"}`
        : undefined,
    paintOrder: "stroke fill",
    textShadow: shadows.length ? shadows.join(", ") : undefined,
    background: style.backgroundColor ?? undefined,
    padding: style.backgroundColor
      ? `${Math.max(3, (style.backgroundPadding ?? 8) / 2.5)}px ${Math.max(8, (style.backgroundPadding ?? 8) / 1.2)}px`
      : undefined,
    borderRadius: style.backgroundColor
      ? Math.max(
          0,
          Math.min(
            999,
            (style.backgroundRadius ?? 0) / 2.2,
          ),
        )
      : undefined,
    letterSpacing:
      style.letterSpacing != null ? `${style.letterSpacing}em` : undefined,
    textTransform:
      style.textCase === "upper"
        ? "uppercase"
        : style.textCase === "lower"
          ? "lowercase"
          : style.textCase === "title"
            ? "capitalize"
            : undefined,
    opacity: style.opacity != null ? style.opacity : undefined,
  };
}

export function presetEffectLabels(style: TextStylePatch): string[] {
  const tags: string[] = [];
  const stroke = Number(style.strokeWidth ?? 0);
  if (stroke > 0) tags.push(`Stroke ${Math.round(stroke)}`);
  if (style.glow) tags.push("Glow");
  if (style.shadowColor) tags.push("Shadow");
  if (style.backgroundColor) tags.push("BG");
  return tags;
}

const CUSTOM_STORAGE_KEY = "yatishara.studio.editor.textPresets.v1";

export function loadCustomTextPresets(): TextStylePreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TextStylePreset[];
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(["title", "soft", "outline", "badge"]);
    return parsed
      .filter((p) => p && typeof p.id === "string" && p.style)
      .map((p) => ({
        ...p,
        category: allowed.has(p.category as TextPresetCategory)
          ? (p.category as TextPresetCategory)
          : "soft",
      }));
  } catch {
    return [];
  }
}

export function saveCustomTextPresets(presets: TextStylePreset[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(presets));
}
