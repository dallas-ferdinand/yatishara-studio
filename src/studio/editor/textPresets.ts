import type { CSSProperties } from "react";
import type { TextClipContent } from "./types";

export type TextPresetCategory =
  | "title"
  | "pop"
  | "soft"
  | "neon"
  | "badge";

/** Style fields applied by a preset (never overwrites clip wording unless asked). */
export type TextStylePatch = Omit<
  Partial<TextClipContent>,
  "text" | "animation" | "animationDuration"
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
  { id: "pop", label: "Pop" },
  { id: "soft", label: "Soft" },
  { id: "neon", label: "Neon" },
  { id: "badge", label: "Badge" },
  { id: "mine", label: "Mine" },
];

/**
 * Curated CapCut-like looks — restrained palettes, readable stroke/glow/shadow.
 * Grease matches Dallas’s Agbalumo cream + black stroke + gold glow.
 */
export const BUILTIN_TEXT_PRESETS: TextStylePreset[] = [
  {
    id: "grease",
    name: "Grease",
    category: "pop",
    sample: "GREASE?",
    style: {
      fontFamily: "Agbalumo",
      fontSize: 52,
      textCase: "upper",
      color: "#FFF4DE",
      strokeColor: "#0A0A0A",
      strokeWidth: 7,
      glow: true,
      glowColor: "#FFD54A",
      glowBlur: 22,
      shadowColor: "rgba(0,0,0,0.45)",
      shadowBlur: 2,
      shadowOffsetX: 2,
      shadowOffsetY: 4,
      letterSpacing: 0.02,
      lineHeight: 1.1,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "butter",
    name: "Butter",
    category: "pop",
    sample: "Fresh",
    style: {
      fontFamily: "Agbalumo",
      fontSize: 50,
      color: "#FFF8E7",
      strokeColor: "#1A1208",
      strokeWidth: 6,
      glow: true,
      glowColor: "#F5C542",
      glowBlur: 18,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 2,
      shadowOffsetY: 3,
      align: "center",
      opacity: 1,
    },
  },
  {
    id: "cherry-pop",
    name: "Cherry",
    category: "pop",
    sample: "Yum",
    style: {
      fontFamily: "Fredoka",
      fontSize: 48,
      bold: true,
      color: "#FFF5F5",
      strokeColor: "#7F1D1D",
      strokeWidth: 5,
      glow: true,
      glowColor: "#FB7185",
      glowBlur: 14,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 2,
      shadowOffsetY: 3,
      opacity: 1,
    },
  },
  {
    id: "sky-pop",
    name: "Sky Pop",
    category: "pop",
    sample: "Wow",
    style: {
      fontFamily: "Nunito",
      fontSize: 48,
      bold: true,
      color: "#F0F9FF",
      strokeColor: "#0C4A6E",
      strokeWidth: 5,
      glow: true,
      glowColor: "#38BDF8",
      glowBlur: 16,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 2,
      shadowOffsetY: 3,
      opacity: 1,
    },
  },
  {
    id: "mint-pop",
    name: "Mint Pop",
    category: "pop",
    sample: "Cool",
    style: {
      fontFamily: "Quicksand",
      fontSize: 48,
      bold: true,
      color: "#ECFDF5",
      strokeColor: "#064E3B",
      strokeWidth: 5,
      glow: true,
      glowColor: "#34D399",
      glowBlur: 14,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 2,
      shadowOffsetY: 3,
      opacity: 1,
    },
  },
  {
    id: "sale",
    name: "Sale",
    category: "title",
    sample: "SALE",
    style: {
      fontFamily: "Bebas Neue",
      fontSize: 64,
      textCase: "upper",
      color: "#FFE566",
      strokeColor: "#141414",
      strokeWidth: 5,
      glow: false,
      shadowColor: "rgba(0,0,0,0.5)",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      letterSpacing: 0.06,
      opacity: 1,
    },
  },
  {
    id: "headline",
    name: "Headline",
    category: "title",
    sample: "TODAY",
    style: {
      fontFamily: "Oswald",
      fontSize: 56,
      bold: true,
      textCase: "upper",
      color: "#FFFFFF",
      strokeColor: "#111111",
      strokeWidth: 4,
      glow: false,
      shadowColor: "rgba(0,0,0,0.45)",
      shadowBlur: 0,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      letterSpacing: 0.08,
      opacity: 1,
    },
  },
  {
    id: "ultra",
    name: "Ultra",
    category: "title",
    sample: "BIG",
    style: {
      fontFamily: "Anton",
      fontSize: 68,
      textCase: "upper",
      color: "#FFFFFF",
      strokeColor: "#0A0A0A",
      strokeWidth: 4,
      glow: false,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 0,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      opacity: 1,
    },
  },
  {
    id: "cinema",
    name: "Cinema",
    category: "title",
    sample: "Tonight",
    style: {
      fontFamily: "Playfair Display",
      fontSize: 46,
      bold: true,
      color: "#F7F1E3",
      strokeColor: "#2A2010",
      strokeWidth: 1,
      glow: true,
      glowColor: "#E8C872",
      glowBlur: 10,
      shadowColor: "rgba(0,0,0,0.55)",
      shadowBlur: 10,
      shadowOffsetY: 4,
      letterSpacing: 0.03,
      opacity: 1,
    },
  },
  {
    id: "gold-leaf",
    name: "Gold Leaf",
    category: "title",
    sample: "Premium",
    style: {
      fontFamily: "Cinzel",
      fontSize: 40,
      bold: true,
      color: "#E8C872",
      strokeColor: "#3A2A10",
      strokeWidth: 2,
      glow: true,
      glowColor: "#D4A84B",
      glowBlur: 12,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 6,
      shadowOffsetY: 2,
      letterSpacing: 0.06,
      opacity: 1,
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    category: "title",
    sample: "Story",
    style: {
      fontFamily: "Fraunces",
      fontSize: 44,
      bold: true,
      color: "#FAFAF9",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.5)",
      shadowBlur: 12,
      shadowOffsetY: 3,
      letterSpacing: 0.01,
      opacity: 1,
    },
  },
  {
    id: "clean",
    name: "Clean",
    category: "soft",
    sample: "Hello",
    style: {
      fontFamily: "DM Sans",
      fontSize: 42,
      bold: true,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 2,
      glow: false,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 8,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "caption",
    name: "Caption",
    category: "soft",
    sample: "Subtitle",
    style: {
      fontFamily: "Nunito",
      fontSize: 28,
      bold: true,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 3,
      glow: false,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "whisper",
    name: "Whisper",
    category: "soft",
    sample: "quietly",
    style: {
      fontFamily: "Cormorant Garamond",
      fontSize: 40,
      italic: true,
      color: "#F4F0EA",
      strokeWidth: 0,
      glow: true,
      glowColor: "#F4F0EA",
      glowBlur: 8,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 8,
      shadowOffsetY: 2,
      opacity: 0.95,
    },
  },
  {
    id: "script",
    name: "Script",
    category: "soft",
    sample: "Love this",
    style: {
      fontFamily: "Caveat",
      fontSize: 52,
      bold: true,
      color: "#FFF8F0",
      strokeColor: "#3A2A20",
      strokeWidth: 1,
      glow: false,
      shadowColor: "rgba(0,0,0,0.45)",
      shadowBlur: 6,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "blush",
    name: "Blush",
    category: "soft",
    sample: "Soft",
    style: {
      fontFamily: "Quicksand",
      fontSize: 44,
      bold: true,
      color: "#FFE4F0",
      strokeColor: "#9D174D",
      strokeWidth: 2,
      glow: true,
      glowColor: "#F9A8D4",
      glowBlur: 12,
      shadowColor: "rgba(0,0,0,0.3)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "serif-soft",
    name: "Serif Soft",
    category: "soft",
    sample: "Elegant",
    style: {
      fontFamily: "Instrument Serif",
      fontSize: 46,
      color: "#FAFAF9",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.5)",
      shadowBlur: 10,
      shadowOffsetY: 3,
      letterSpacing: 0.02,
      opacity: 1,
    },
  },
  {
    id: "wedding",
    name: "Wedding",
    category: "soft",
    sample: "Forever",
    style: {
      fontFamily: "Great Vibes",
      fontSize: 50,
      color: "#FFF5F7",
      strokeColor: "#E8B4C0",
      strokeWidth: 1,
      glow: true,
      glowColor: "#FFD6E0",
      glowBlur: 10,
      shadowColor: "rgba(80,40,50,0.35)",
      shadowBlur: 8,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "ice",
    name: "Ice",
    category: "neon",
    sample: "Fresh",
    style: {
      fontFamily: "Montserrat",
      fontSize: 44,
      bold: true,
      color: "#E8F7FF",
      strokeColor: "#FFFFFF",
      strokeWidth: 2,
      glow: true,
      glowColor: "#7EC8FF",
      glowBlur: 16,
      shadowColor: "rgba(0,0,0,0.3)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "aurora",
    name: "Aurora",
    category: "neon",
    sample: "Night",
    style: {
      fontFamily: "Sora",
      fontSize: 42,
      bold: true,
      color: "#E0E7FF",
      strokeColor: "#312E81",
      strokeWidth: 2,
      glow: true,
      glowColor: "#818CF8",
      glowBlur: 18,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      letterSpacing: 0.04,
      opacity: 1,
    },
  },
  {
    id: "seafoam",
    name: "Seafoam",
    category: "neon",
    sample: "Wave",
    style: {
      fontFamily: "Outfit",
      fontSize: 44,
      bold: true,
      color: "#CCFBF1",
      strokeColor: "#115E59",
      strokeWidth: 2,
      glow: true,
      glowColor: "#2DD4BF",
      glowBlur: 16,
      shadowColor: "rgba(0,0,0,0.3)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "violet-glow",
    name: "Violet",
    category: "neon",
    sample: "Glow",
    style: {
      fontFamily: "Space Grotesk",
      fontSize: 44,
      bold: true,
      color: "#EDE9FE",
      strokeColor: "#4C1D95",
      strokeWidth: 2,
      glow: true,
      glowColor: "#A78BFA",
      glowBlur: 18,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "amber-glow",
    name: "Amber",
    category: "neon",
    sample: "Warm",
    style: {
      fontFamily: "Sora",
      fontSize: 44,
      bold: true,
      color: "#FFF7ED",
      strokeColor: "#9A3412",
      strokeWidth: 2,
      glow: true,
      glowColor: "#FB923C",
      glowBlur: 16,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "social-white",
    name: "Social",
    category: "badge",
    sample: "Follow",
    style: {
      fontFamily: "Inter",
      fontSize: 32,
      bold: true,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 4,
      glow: false,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 0,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "social-yellow",
    name: "Highlight",
    category: "badge",
    sample: "Tip",
    style: {
      fontFamily: "Inter",
      fontSize: 32,
      bold: true,
      color: "#FFE600",
      strokeColor: "#000000",
      strokeWidth: 4,
      glow: false,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 0,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      opacity: 1,
    },
  },
  {
    id: "pill-dark",
    name: "Dark Pill",
    category: "badge",
    sample: "Pro tip",
    style: {
      fontFamily: "Inter",
      fontSize: 26,
      bold: true,
      color: "#F8FAFC",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 8,
      shadowOffsetY: 2,
      backgroundColor: "rgba(15,23,42,0.78)",
      backgroundPadding: 12,
      backgroundRadius: 48,
      opacity: 1,
    },
  },
  {
    id: "pill-cream",
    name: "Cream Pill",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "DM Sans",
      fontSize: 26,
      bold: true,
      color: "#1C1917",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.2)",
      shadowBlur: 6,
      shadowOffsetY: 2,
      backgroundColor: "#F5E6C8",
      backgroundPadding: 12,
      backgroundRadius: 48,
      opacity: 1,
    },
  },
  {
    id: "pill-soft",
    name: "Soft Pill",
    category: "badge",
    sample: "Note",
    style: {
      fontFamily: "Nunito",
      fontSize: 26,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.25)",
      shadowBlur: 8,
      shadowOffsetY: 2,
      backgroundColor: "rgba(255,255,255,0.18)",
      backgroundPadding: 12,
      backgroundRadius: 48,
      opacity: 1,
    },
  },
  {
    id: "lower-third",
    name: "Lower Third",
    category: "badge",
    sample: "Name",
    style: {
      fontFamily: "DM Sans",
      fontSize: 28,
      bold: true,
      color: "#FFFFFF",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.3)",
      shadowBlur: 6,
      shadowOffsetY: 2,
      backgroundColor: "rgba(0,0,0,0.55)",
      backgroundPadding: 14,
      backgroundRadius: 8,
      opacity: 1,
    },
  },
  {
    id: "outline-light",
    name: "Outline",
    category: "title",
    sample: "OUT",
    style: {
      fontFamily: "Oswald",
      fontSize: 54,
      bold: true,
      textCase: "upper",
      color: "#FFFFFF",
      strokeColor: "#FFFFFF",
      strokeWidth: 2,
      glow: true,
      glowColor: "rgba(255,255,255,0.55)",
      glowBlur: 8,
      shadowColor: "rgba(0,0,0,0.65)",
      shadowBlur: 0,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      letterSpacing: 0.12,
      opacity: 1,
    },
  },
  {
    id: "navy-poster",
    name: "Navy",
    category: "title",
    sample: "OPEN",
    style: {
      fontFamily: "Bebas Neue",
      fontSize: 58,
      textCase: "upper",
      color: "#F8FAFC",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 6,
      shadowOffsetY: 2,
      backgroundColor: "#1E3A5F",
      backgroundPadding: 14,
      backgroundRadius: 10,
      letterSpacing: 0.08,
      opacity: 1,
    },
  },
  {
    id: "cream-poster",
    name: "Cream",
    category: "title",
    sample: "Menu",
    style: {
      fontFamily: "Fraunces",
      fontSize: 42,
      bold: true,
      color: "#1C1917",
      strokeWidth: 0,
      glow: false,
      shadowColor: "rgba(0,0,0,0.15)",
      shadowBlur: 4,
      shadowOffsetY: 2,
      backgroundColor: "#F5EFE6",
      backgroundPadding: 14,
      backgroundRadius: 10,
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
    return parsed.filter((p) => p && typeof p.id === "string" && p.style);
  } catch {
    return [];
  }
}

export function saveCustomTextPresets(presets: TextStylePreset[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(presets));
}
