/** Built-in CapCut-like text style presets. Keep in sync with src/studio/editor/textPresets.ts */
export type TextPresetCategory = "title" | "soft" | "outline" | "badge";

export type TextStylePatch = {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textCase?: "none" | "upper" | "lower" | "title";
  letterSpacing?: number;
  lineHeight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string | null;
  backgroundPadding?: number;
  backgroundRadius?: number;
  shadowColor?: string | null;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  glow?: boolean;
  glowColor?: string;
  glowBlur?: number;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
};

export type TextStylePreset = {
  id: string;
  name: string;
  category: TextPresetCategory;
  sample: string;
  style: TextStylePatch;
};

export const BUILTIN_TEXT_PRESETS: TextStylePreset[] = [
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
    id: "badge-dark",
    name: "Badge",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 28,
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
    id: "badge-light",
    name: "Badge Light",
    category: "badge",
    sample: "New",
    style: {
      fontFamily: "Inter",
      fontSize: 28,
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
];

export function listTextPresets(category?: TextPresetCategory | "all") {
  const all = BUILTIN_TEXT_PRESETS;
  if (!category || category === "all") return all;
  return all.filter((p) => p.category === category);
}

export function getTextPreset(presetId: string): TextStylePreset | undefined {
  return BUILTIN_TEXT_PRESETS.find((p) => p.id === presetId);
}
