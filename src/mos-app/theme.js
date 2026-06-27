/** Appearance mode (light/dark) + accent color schemes — CSS variables on :root */
const SCHEME_KEY = "mercuryos-theme-v1";
const MODE_KEY = "mercuryos-appearance-v1";

export const SCHEMES = {
  agent: {
    label: "Agent",
    accent: "#22c55e",
    bg: "#020617",
    surface: "#0f172a",
    raised: "#1e293b",
  },
  gold: {
    label: "Gold",
    accent: "#c4a574",
    bg: "#1b1c23",
    surface: "#1d1e26",
    raised: "#21222c",
  },
  ocean: {
    label: "Ocean",
    accent: "#38bdf8",
    bg: "#070b10",
    surface: "#0f172a",
    raised: "#172554",
  },
  ember: {
    label: "Ember",
    accent: "#fb923c",
    bg: "#0a0806",
    surface: "#1a120c",
    raised: "#291911",
  },
  mint: {
    label: "Mint",
    accent: "#4ade80",
    bg: "#060a08",
    surface: "#0f1a14",
    raised: "#14261c",
  },
  violet: {
    label: "Violet",
    accent: "#c084fc",
    bg: "#09070d",
    surface: "#15101f",
    raised: "#1f1630",
  },
  rose: {
    label: "Rose",
    accent: "#fb7185",
    bg: "#0d0809",
    surface: "#1a1012",
    raised: "#261419",
  },
  cobalt: {
    label: "Cobalt",
    accent: "#60a5fa",
    bg: "#060810",
    surface: "#0c1222",
    raised: "#111a2e",
  },
  coral: {
    label: "Coral",
    accent: "#f472b6",
    bg: "#0c080a",
    surface: "#1a1018",
    raised: "#261422",
  },
  sage: {
    label: "Sage",
    accent: "#86efac",
    bg: "#070a08",
    surface: "#101a14",
    raised: "#16261c",
  },
  cherry: {
    label: "Cherry",
    accent: "#f87171",
    bg: "#0a0606",
    surface: "#1a0e0e",
    raised: "#281414",
  },
  teal: {
    label: "Teal",
    accent: "#2dd4bf",
    bg: "#060a0a",
    surface: "#0c1a18",
    raised: "#102826",
  },
  lime: {
    label: "Lime",
    accent: "#a3e635",
    bg: "#080a06",
    surface: "#141a0c",
    raised: "#1e2610",
  },
  fuchsia: {
    label: "Fuchsia",
    accent: "#e879f9",
    bg: "#0a060c",
    surface: "#180c1e",
    raised: "#24122c",
  },
  copper: {
    label: "Copper",
    accent: "#d97706",
    bg: "#0a0806",
    surface: "#18120c",
    raised: "#241a10",
  },
  indigo: {
    label: "Indigo",
    accent: "#818cf8",
    bg: "#07060e",
    surface: "#100e1c",
    raised: "#181428",
  },
};

const LIGHT_BASE = {
  bg: "#f4f4f5",
  surface: "#ffffff",
  raised: "#e4e4e7",
  text: "#18181b",
  textMuted: "#52525b",
  textFaint: "#71717a",
  border: "rgba(0,0,0,0.08)",
  borderSoft: "rgba(0,0,0,0.06)",
  hover: "#ececee",
  active: "#e4e4e7",
};

function parseHex(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function mixHex(a, b, t) {
  const c1 = parseHex(a);
  const c2 = parseHex(b);
  const f = (x, y) => Math.round(x + (y - x) * t);
  return `#${[f(c1.r, c2.r), f(c1.g, c2.g), f(c1.b, c2.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function lighten(hex, amt = 0.12) {
  return mixHex(hex, "#ffffff", amt);
}

function darken(hex, amt = 0.12) {
  return mixHex(hex, "#000000", amt);
}

function accentDim(hex) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},0.14)`;
}

function accentBorder(hex) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},0.28)`;
}

function accentHover(hex) {
  return lighten(hex, 0.1);
}

/** Hairline borders — low-contrast rgba, not lightened hex stripes. */
function hairlineBorder(isLight, alpha) {
  return isLight ? `rgba(0, 0, 0, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
}

function buildDeskPalette(scheme, isLight) {
  if (isLight) {
    return {
      bg: LIGHT_BASE.bg,
      sidebar: mixHex(LIGHT_BASE.bg, "#000000", 0.03),
      panel: LIGHT_BASE.surface,
      composer: mixHex(LIGHT_BASE.bg, LIGHT_BASE.surface, 0.55),
      surface: mixHex(LIGHT_BASE.bg, LIGHT_BASE.raised, 0.4),
      surfaceRaised: mixHex(LIGHT_BASE.raised, "#ffffff", 0.35),
      surfaceOverlay: LIGHT_BASE.hover,
      surfaceInput: LIGHT_BASE.surface,
      border: hairlineBorder(true, 0.07),
      borderSoft: hairlineBorder(true, 0.045),
      borderSubtle: hairlineBorder(true, 0.055),
      borderFocus: mixHex(scheme.accent, "#000000", 0.28),
      text: LIGHT_BASE.text,
      textSoft: mixHex(LIGHT_BASE.text, LIGHT_BASE.textMuted, 0.35),
      muted: LIGHT_BASE.textMuted,
      faint: LIGHT_BASE.textFaint,
      hover: LIGHT_BASE.hover,
      active: LIGHT_BASE.active,
      accent: scheme.accent,
    };
  }

  const bg = scheme.bg;
  const sidebar = darken(bg, 0.04);
  const panel = scheme.surface;
  // Keep composer/surfaces close to canvas — subtle lift, not a second palette.
  const composer = mixHex(bg, panel, 0.28);
  const surface = mixHex(bg, panel, 0.34);
  const raised = mixHex(panel, bg, 0.12);

  return {
    bg,
    sidebar,
    panel,
    composer,
    surface,
    surfaceRaised: raised,
    surfaceOverlay: mixHex(panel, bg, 0.2),
    surfaceInput: darken(panel, 0.04),
    border: hairlineBorder(false, 0.07),
    borderSoft: hairlineBorder(false, 0.04),
    borderSubtle: hairlineBorder(false, 0.05),
    borderFocus: mixHex(scheme.accent, bg, 0.38),
    text: "#e4e4e7",
    textSoft: "#c8c9d0",
    muted: "#858699",
    faint: "#6b6d7b",
    hover: mixHex(panel, bg, 0.22),
    active: mixHex(panel, bg, 0.32),
    accent: scheme.accent,
  };
}

function overlayTokens(isLight) {
  if (isLight) {
    return {
      subtle: "rgba(0, 0, 0, 0.05)",
      hover: "rgba(0, 0, 0, 0.09)",
      muted: "rgba(0, 0, 0, 0.035)",
      track: "transparent",
      thumb: "rgba(0, 0, 0, 0.18)",
      thumbHover: "rgba(0, 0, 0, 0.28)",
    };
  }
  return {
    subtle: "rgba(255, 255, 255, 0.05)",
    hover: "rgba(255, 255, 255, 0.08)",
    muted: "rgba(255, 255, 255, 0.03)",
    track: "transparent",
    thumb: "rgba(255, 255, 255, 0.2)",
    thumbHover: "rgba(255, 255, 255, 0.34)",
  };
}

function applyDeskTokens(palette, isLight) {
  const root = document.documentElement;
  const accent = palette.accent;
  const hover = accentHover(accent);
  const { r, g, b } = parseHex(accent);
  const overlays = overlayTokens(isLight);

  root.style.setProperty("--cursor-accent", accent);
  root.style.setProperty("--cursor-accent-hover", hover);
  root.style.setProperty("--cursor-accent-dim", accentDim(accent));
  root.style.setProperty("--cursor-accent-border", accentBorder(accent));
  root.style.setProperty("--cursor-sidebar", palette.sidebar);

  root.style.setProperty("--cursor-overlay-subtle", overlays.subtle);
  root.style.setProperty("--cursor-overlay-hover", overlays.hover);
  root.style.setProperty("--cursor-overlay-muted", overlays.muted);

  root.style.setProperty("--mos-bg", palette.bg);
  root.style.setProperty("--mos-sidebar", palette.sidebar);
  root.style.setProperty("--mos-panel", palette.panel);
  root.style.setProperty("--mos-composer", palette.composer);
  root.style.setProperty("--mos-surface", palette.surface);
  root.style.setProperty("--mos-border", palette.border);
  root.style.setProperty("--mos-border-soft", palette.borderSoft);
  root.style.setProperty("--mos-border-subtle", palette.borderSubtle);
  root.style.setProperty("--mos-text", palette.text);
  root.style.setProperty("--mos-text-soft", palette.textSoft);
  root.style.setProperty("--mos-text-bright", palette.text);
  root.style.setProperty("--mos-muted", palette.muted);
  root.style.setProperty("--mos-faint", palette.faint);
  root.style.setProperty("--mos-accent", accent);
  root.style.setProperty("--mos-accent-hover", hover);
  root.style.setProperty("--mos-hover", palette.hover);
  root.style.setProperty("--mos-active", palette.active);

  root.style.setProperty("--color-cursor-bg", palette.bg);
  root.style.setProperty("--color-cursor-sidebar", palette.sidebar);
  root.style.setProperty("--color-cursor-editor", palette.panel);
  root.style.setProperty("--color-cursor-chat", palette.bg);
  root.style.setProperty("--color-cursor-composer", palette.composer);
  root.style.setProperty("--color-cursor-border", palette.border);
  root.style.setProperty("--color-cursor-border-soft", palette.borderSoft);
  root.style.setProperty("--color-cursor-border-subtle", palette.borderSubtle);
  root.style.setProperty("--color-cursor-muted", palette.muted);
  root.style.setProperty("--color-cursor-text", palette.text);
  root.style.setProperty("--color-cursor-text-soft", palette.textSoft);
  root.style.setProperty("--color-cursor-hover", palette.hover);
  root.style.setProperty("--color-cursor-active", palette.active);
  root.style.setProperty("--color-cursor-accent", accent);
  root.style.setProperty("--color-cursor-fg", palette.text);

  root.style.setProperty("--cursor-surface", palette.surface);
  root.style.setProperty("--cursor-surface-raised", palette.surfaceRaised);
  root.style.setProperty("--cursor-surface-overlay", palette.surfaceOverlay);
  root.style.setProperty("--cursor-surface-input", palette.surfaceInput);
  root.style.setProperty("--cursor-border-subtle", palette.borderSubtle);
  root.style.setProperty("--cursor-border-focus", palette.borderFocus);

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-dim", accentDim(accent));
  root.style.setProperty("--accent-rgb", `${r},${g},${b}`);
  root.style.setProperty("--bg", palette.bg);
  root.style.setProperty("--surface", palette.panel);
  root.style.setProperty("--surface-raised", palette.surfaceRaised);
  root.style.setProperty("--surface-hover", palette.hover);
  root.style.setProperty("--border", palette.border);
  root.style.setProperty("--border-strong", palette.borderSubtle);
  root.style.setProperty("--ring", `rgba(${r},${g},${b},0.32)`);

  root.style.setProperty("--scrollbar-track", overlays.track);
  root.style.setProperty("--scrollbar-thumb", overlays.thumb);
  root.style.setProperty("--scrollbar-thumb-hover", overlays.thumbHover);

  root.style.setProperty("--text", palette.text);
  root.style.setProperty("--text-muted", palette.muted);
  root.style.setProperty("--text-faint", palette.faint);
}

function migrateLegacy() {
  const id = localStorage.getItem(SCHEME_KEY);
  if (id === "light" && !localStorage.getItem(MODE_KEY)) {
    localStorage.setItem(MODE_KEY, "light");
    localStorage.setItem(SCHEME_KEY, "agent");
  }
}

export function getAppearanceMode() {
  migrateLegacy();
  return localStorage.getItem(MODE_KEY) === "light" ? "light" : "dark";
}

export function getSchemeId() {
  migrateLegacy();
  const id = localStorage.getItem(SCHEME_KEY);
  if (id === "light") return "agent";
  return SCHEMES[id] ? id : "agent";
}

/** @deprecated use getSchemeId */
export function getThemeId() {
  return getSchemeId();
}

function syncAppearanceControls(mode) {
  document.querySelectorAll("#appearance-mode-seg .seg-btn, #theme-appearance-seg .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function syncSchemeChips(schemeId) {
  document.querySelectorAll(".theme-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.theme === schemeId);
  });
}

export function applyTheme(schemeId, mode) {
  migrateLegacy();
  const sid = schemeId && SCHEMES[schemeId] ? schemeId : getSchemeId();
  const appearance = mode === "light" || mode === "dark" ? mode : getAppearanceMode();
  const scheme = SCHEMES[sid] ?? SCHEMES.agent;
  const isLight = appearance === "light";
  const palette = buildDeskPalette(scheme, isLight);

  const root = document.documentElement;
  root.dataset.appearance = appearance;
  root.dataset.theme = sid;

  applyDeskTokens(palette, isLight);

  root.style.setProperty("--danger", "#dc2626");
  root.style.setProperty("--danger-fg", "#ffffff");
  root.style.setProperty("--danger-rgb", "220,38,38");
  root.style.setProperty("--danger-dim", "rgba(220,38,38,0.14)");

  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
  localStorage.setItem(SCHEME_KEY, sid);
  localStorage.setItem(MODE_KEY, appearance);
  syncSchemeChips(sid);
  syncAppearanceControls(appearance);

  window.dispatchEvent(new CustomEvent("mercuryos-theme-change", { detail: { schemeId: sid, mode: appearance } }));
}

export function setAppearanceMode(mode) {
  applyTheme(getSchemeId(), mode);
}

export function setColorScheme(id) {
  applyTheme(id, getAppearanceMode());
}

export function initTheme() {
  applyTheme(getSchemeId(), getAppearanceMode());
}

const wiredPickers = new WeakSet();
const wiredModeSegs = new WeakSet();

export function wireThemePicker(container) {
  if (!container || wiredPickers.has(container)) return;
  wiredPickers.add(container);
  container.innerHTML = "";
  const current = getSchemeId();
  for (const [id, t] of Object.entries(SCHEMES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `theme-chip${id === current ? " active" : ""}`;
    btn.dataset.theme = id;
    btn.setAttribute("aria-label", t.label);
    btn.innerHTML = `<span class="theme-chip-swatch" style="background:${t.accent}"></span><span class="theme-chip-label">${t.label}</span>`;
    btn.addEventListener("click", () => setColorScheme(id));
    container.appendChild(btn);
  }
}

export function wireAppearanceMode(container) {
  if (!container || wiredModeSegs.has(container)) return;
  wiredModeSegs.add(container);
  const current = getAppearanceMode();
  container.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === current);
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === "light" || mode === "dark") setAppearanceMode(mode);
    });
  });
}

export function wireAppearanceSettings() {
  wireAppearanceMode(document.querySelector("#appearance-mode-seg"));
  wireAppearanceMode(document.querySelector("#theme-appearance-seg"));
  wireThemePicker(document.querySelector("#theme-picker"));
  wireThemePicker(document.querySelector("#theme-sheet-picker"));
}

/** Blocking inline script for layout — sets --mos-* before first paint (Tailwind reads these). */
export function getThemeBootInlineScript() {
  const schemesJson = JSON.stringify(SCHEMES);
  return `(function(){try{var SCHEMES=${schemesJson};var SK="mercuryos-theme-v1",MK="mercuryos-appearance-v1";function parseHex(h){h=h.replace("#","");return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)}}function mixHex(a,b,t){function f(x,y){return Math.round(x+(y-x)*t)}var c1=parseHex(a),c2=parseHex(b);return"#"+[f(c1.r,c2.r),f(c1.g,c2.g),f(c1.b,c2.b)].map(function(v){return v.toString(16).padStart(2,"0")}).join("")}function darken(h,a){return mixHex(h,"#000000",a||0.12)}function lighten(h,a){return mixHex(h,"#ffffff",a||0.12)}function hairlineBorder(isLight,a){return isLight?"rgba(0,0,0,"+a+")":"rgba(255,255,255,"+a+")"}function accentDim(hex){var p=parseHex(hex);return"rgba("+p.r+","+p.g+","+p.b+",0.14)"}function accentBorder(hex){var p=parseHex(hex);return"rgba("+p.r+","+p.g+","+p.b+",0.28)"}function accentHover(hex){return lighten(hex,0.1)}var sid=localStorage.getItem(SK)||"agent";var mode=localStorage.getItem(MK)||"dark";if(sid==="light"){mode="light";sid="agent"}if(!SCHEMES[sid])sid="agent";var scheme=SCHEMES[sid];var isLight=mode==="light";var LIGHT={bg:"#f4f4f5",surface:"#ffffff",raised:"#e4e4e7",text:"#18181b",textMuted:"#52525b",textFaint:"#71717a",hover:"#ececee",active:"#e4e4e7"};var palette=isLight?{bg:LIGHT.bg,sidebar:mixHex(LIGHT.bg,"#000000",0.03),panel:LIGHT.surface,composer:mixHex(LIGHT.bg,LIGHT.surface,0.55),surface:mixHex(LIGHT.bg,LIGHT.raised,0.4),surfaceRaised:mixHex(LIGHT.raised,"#ffffff",0.35),surfaceOverlay:LIGHT.hover,surfaceInput:LIGHT.surface,border:hairlineBorder(true,0.07),borderSoft:hairlineBorder(true,0.045),borderSubtle:hairlineBorder(true,0.055),borderFocus:mixHex(scheme.accent,"#000000",0.28),text:LIGHT.text,textSoft:mixHex(LIGHT.text,LIGHT.textMuted,0.35),muted:LIGHT.textMuted,faint:LIGHT.textFaint,hover:LIGHT.hover,active:LIGHT.active,accent:scheme.accent}:{bg:scheme.bg,sidebar:darken(scheme.bg,0.04),panel:scheme.surface,composer:mixHex(scheme.bg,scheme.surface,0.28),surface:mixHex(scheme.bg,scheme.surface,0.34),surfaceRaised:mixHex(scheme.surface,scheme.bg,0.12),surfaceOverlay:mixHex(scheme.surface,scheme.bg,0.2),surfaceInput:darken(scheme.surface,0.04),border:hairlineBorder(false,0.07),borderSoft:hairlineBorder(false,0.04),borderSubtle:hairlineBorder(false,0.05),borderFocus:mixHex(scheme.accent,scheme.bg,0.38),text:"#e2e8f0",textSoft:"#cbd5e1",muted:"#94a3b8",faint:"#64748b",hover:mixHex(scheme.surface,scheme.bg,0.22),active:mixHex(scheme.surface,scheme.bg,0.32),accent:scheme.accent};var root=document.documentElement;var accent=palette.accent;var hover=accentHover(accent);var rgb=parseHex(accent);root.dataset.appearance=mode;root.dataset.theme=sid;root.style.setProperty("--mos-bg",palette.bg);root.style.setProperty("--mos-sidebar",palette.sidebar);root.style.setProperty("--mos-panel",palette.panel);root.style.setProperty("--mos-composer",palette.composer);root.style.setProperty("--mos-surface",palette.surface);root.style.setProperty("--mos-border",palette.border);root.style.setProperty("--mos-border-soft",palette.borderSoft);root.style.setProperty("--mos-border-subtle",palette.borderSubtle);root.style.setProperty("--mos-text",palette.text);root.style.setProperty("--mos-text-soft",palette.textSoft);root.style.setProperty("--mos-text-bright",palette.text);root.style.setProperty("--mos-muted",palette.muted);root.style.setProperty("--mos-faint",palette.faint);root.style.setProperty("--mos-accent",accent);root.style.setProperty("--mos-accent-hover",hover);root.style.setProperty("--mos-hover",palette.hover);root.style.setProperty("--mos-active",palette.active);root.style.setProperty("--cursor-accent",accent);root.style.setProperty("--cursor-accent-hover",hover);root.style.setProperty("--cursor-accent-dim",accentDim(accent));root.style.setProperty("--cursor-accent-border",accentBorder(accent));root.style.setProperty("--cursor-sidebar",palette.sidebar);root.style.setProperty("--color-cursor-border-subtle",palette.borderSubtle);root.style.setProperty("--accent-rgb",rgb.r+","+rgb.g+","+rgb.b);var ov=isLight?{subtle:"rgba(0,0,0,0.04)",hover:"rgba(0,0,0,0.06)",muted:"rgba(0,0,0,0.03)"}:{subtle:"rgba(255,255,255,0.05)",hover:"rgba(255,255,255,0.08)",muted:"rgba(255,255,255,0.03)"};root.style.setProperty("--cursor-overlay-subtle",ov.subtle);root.style.setProperty("--cursor-overlay-hover",ov.hover);root.style.setProperty("--cursor-overlay-muted",ov.muted)}catch(e){}})();`;
}
