"use client";

import "./studio-ratio-glyph.css";

/** Corner-bracket frame glyph sized from W:H — works for any ratio. */
export function StudioRatioGlyph({
  ratio,
  className = "",
}: {
  ratio: string;
  className?: string;
}) {
  const match = String(ratio ?? "")
    .trim()
    .match(/^(\d+)\s*:\s*(\d+)$/);
  const w = match ? Math.max(1, Number(match[1])) : 1;
  const h = match ? Math.max(1, Number(match[2])) : 1;
  const max = 22;
  const scale = max / Math.max(w, h);
  const width = Math.max(7, Math.round(w * scale));
  const height = Math.max(7, Math.round(h * scale));

  return (
    <span
      className={`studio-ratio-glyph${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <span style={{ width, height }} />
    </span>
  );
}
