const BUILTIN_TEXT_PRESETS = [
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
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
      opacity: 1
    }
  }
];
function listTextPresets(category) {
  const all = BUILTIN_TEXT_PRESETS;
  if (!category || category === "all") return all;
  return all.filter((p) => p.category === category);
}
function getTextPreset(presetId) {
  return BUILTIN_TEXT_PRESETS.find((p) => p.id === presetId);
}
export {
  BUILTIN_TEXT_PRESETS,
  getTextPreset,
  listTextPresets
};
