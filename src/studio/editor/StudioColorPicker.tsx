"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Droplet, Pipette, X } from "lucide-react";

const RECENTS_KEY = "studio-editor-color-recents";
const MAX_RECENTS = 12;

const RECOMMENDED = [
  "#ffffff",
  "#f5f5f5",
  "#cfcfcf",
  "#8e8e93",
  "#3a3a3c",
  "#1c1c1e",
  "#000000",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#32ade6",
  "#007aff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
  "#ffc1da",
  "#a2d2ff",
  "#b8f2e6",
  "#ffe5b4",
];

function normalizeHex(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  let raw = String(value).trim();
  if (raw === "none" || raw === "transparent") return null;
  if (!raw.startsWith("#")) raw = `#${raw}`;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    raw = `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return null;
  return raw.toLowerCase();
}

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeHex(String(item)))
      .filter((item): item is string => Boolean(item))
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function pushRecent(hex: string) {
  const next = [hex, ...readRecents().filter((item) => item !== hex)].slice(
    0,
    MAX_RECENTS,
  );
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeHex(hex) ?? "#ffffff";
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

type StudioColorPickerProps = {
  label: string;
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  allowNone?: boolean;
};

export function StudioColorPicker({
  label,
  value,
  onChange,
  allowNone = true,
}: StudioColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"palette" | "custom">("palette");
  const [recents, setRecents] = useState<string[]>([]);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  const hex = normalizeHex(value);
  const rgb = hexToRgb(hex ?? "#ffffff");
  const hsv = useMemo(() => rgbToHsv(rgb.r, rgb.g, rgb.b), [rgb.r, rgb.g, rgb.b]);
  const [hue, setHue] = useState(hsv.h);
  const [sat, setSat] = useState(hsv.s);
  const [val, setVal] = useState(hsv.v);
  const [hexDraft, setHexDraft] = useState(hex ?? "#ffffff");

  useEffect(() => {
    if (!open) return;
    setRecents(readRecents());
    setHue(hsv.h);
    setSat(hsv.s);
    setVal(hsv.v);
    setHexDraft(hex ?? "#ffffff");
    setMode("palette");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 16);
    let left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width));
    let top = rect.bottom + 6;
    if (top + 360 > window.innerHeight) {
      top = Math.max(8, rect.top - 360);
    }
    setPos({ top, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (next: string | null) => {
    const normalized = next == null ? null : normalizeHex(next);
    if (normalized) pushRecent(normalized);
    onChange(normalized);
    if (normalized) {
      setRecents(readRecents());
      setHexDraft(normalized);
    }
  };

  const applyHsv = (h: number, s: number, v: number) => {
    setHue(h);
    setSat(s);
    setVal(v);
    const next = hsvToRgb(h, s, v);
    commit(rgbToHex(next.r, next.g, next.b));
  };

  const pickEyedropper = async () => {
    const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const result = await new EyeDropperCtor().open();
      commit(result.sRGBHex);
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="studio-editor-color-row">
      <span className="studio-editor-color-row-label">{label}</span>
      <div className="studio-editor-color-row-actions">
        <button
          ref={anchorRef}
          type="button"
          className={`studio-editor-color-swatch${hex == null ? " is-none" : ""}`}
          style={hex ? { background: hex } : undefined}
          aria-label={`${label} color`}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        />
      </div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="studio-editor-color-panel"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              role="dialog"
              aria-label={`${label} color`}
            >
              <header className="studio-editor-color-panel-head">
                <span
                  className="studio-editor-color-swatch is-preview"
                  style={hex ? { background: hex } : undefined}
                  aria-hidden="true"
                />
                <strong>{label}</strong>
                <button
                  type="button"
                  className="studio-editor-color-panel-close"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </header>

              {mode === "palette" ? (
                <>
                  <div className="studio-editor-color-section-label">Recents</div>
                  <div className="studio-editor-color-swatch-grid">
                    {allowNone ? (
                      <button
                        type="button"
                        className="studio-editor-color-swatch is-none"
                        aria-label="No color"
                        onClick={() => commit(null)}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="studio-editor-color-tool"
                      aria-label="Eyedropper"
                      onClick={() => void pickEyedropper()}
                    >
                      <Pipette size={14} />
                    </button>
                    <button
                      type="button"
                      className="studio-editor-color-tool"
                      aria-label="Custom color"
                      onClick={() => setMode("custom")}
                    >
                      <Droplet size={14} />
                    </button>
                    {recents.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`studio-editor-color-swatch${hex === item ? " is-active" : ""}`}
                        style={{ background: item }}
                        aria-label={item}
                        onClick={() => commit(item)}
                      />
                    ))}
                  </div>
                  <div className="studio-editor-color-section-label">Recommended</div>
                  <div className="studio-editor-color-swatch-grid is-recommended">
                    {RECOMMENDED.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`studio-editor-color-swatch${hex === item ? " is-active" : ""}`}
                        style={{ background: item }}
                        title={item}
                        aria-label={item}
                        onClick={() => commit(item)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="studio-editor-color-custom">
                  <button
                    type="button"
                    className="studio-editor-color-back"
                    onClick={() => setMode("palette")}
                  >
                    ← Palette
                  </button>
                  <div
                    className="studio-editor-color-sv"
                    style={{
                      background: `
                        linear-gradient(to top, #000, transparent),
                        linear-gradient(to right, #fff, hsl(${hue} 100% 50%))
                      `,
                    }}
                    onPointerDown={(event) => {
                      const el = event.currentTarget;
                      const move = (clientX: number, clientY: number) => {
                        const rect = el.getBoundingClientRect();
                        const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
                        const v = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
                        applyHsv(hue, s, v);
                      };
                      move(event.clientX, event.clientY);
                      const onMove = (e: PointerEvent) => move(e.clientX, e.clientY);
                      const onUp = () => {
                        window.removeEventListener("pointermove", onMove);
                        window.removeEventListener("pointerup", onUp);
                      };
                      window.addEventListener("pointermove", onMove);
                      window.addEventListener("pointerup", onUp);
                    }}
                  >
                    <span
                      className="studio-editor-color-sv-thumb"
                      style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }}
                    />
                  </div>
                  <div className="studio-editor-color-hue-row">
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={hue}
                      className="studio-editor-color-hue"
                      onChange={(e) => applyHsv(Number(e.target.value), sat, val)}
                    />
                    <button
                      type="button"
                      className="studio-editor-color-tool"
                      aria-label="Eyedropper"
                      onClick={() => void pickEyedropper()}
                    >
                      <Pipette size={14} />
                    </button>
                  </div>
                  <label className="studio-editor-color-hex">
                    Hex
                    <input
                      value={hexDraft}
                      onChange={(e) => setHexDraft(e.target.value)}
                      onBlur={() => {
                        const next = normalizeHex(hexDraft);
                        if (next) commit(next);
                        else setHexDraft(hex ?? "#ffffff");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
