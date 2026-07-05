// @ts-nocheck
"use client";

const COLS = 8;
const ROWS = 5;

export function StudioDotGridWave({ className = "" }) {
  const dots = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      dots.push({ row, col, index: row * COLS + col });
    }
  }

  return (
    <div className={`studio-dot-grid-wave${className ? ` ${className}` : ""}`} aria-hidden="true">
      <div className="studio-dot-grid-wave-stage">
        {dots.map((dot) => (
          <span
            key={dot.index}
            className="studio-dot-grid-wave-dot"
            style={{
              "--dot-delay": `${dot.col * 0.07 + dot.row * 0.09}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
