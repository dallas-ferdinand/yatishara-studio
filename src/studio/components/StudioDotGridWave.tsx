// @ts-nocheck
"use client";

/** Dots within a circle — used for generation loading wave. */
const GRID = 11;
const CENTER = (GRID - 1) / 2;
const MAX_RADIUS = 4.35;
const SPACING = 7.5;

function buildCircularDots() {
  const dots = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const dx = col - CENTER;
      const dy = row - CENTER;
      const radius = Math.hypot(dx, dy);
      if (radius > MAX_RADIUS) continue;
      const angle = Math.atan2(dy, dx);
      dots.push({
        key: `${row}-${col}`,
        x: dx * SPACING,
        y: dy * SPACING,
        delay: radius * 0.11 + ((angle + Math.PI) / (Math.PI * 2)) * 0.35,
      });
    }
  }
  return dots;
}

const DOTS = buildCircularDots();
const STAGE_SIZE = Math.ceil(CENTER * SPACING * 2 + 10);

export function StudioDotGridWave({ className = "" }) {
  return (
    <div className={`studio-dot-grid-wave${className ? ` ${className}` : ""}`} aria-hidden="true">
      <div
        className="studio-dot-grid-wave-stage"
        style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
      >
        {DOTS.map((dot) => (
          <span
            key={dot.key}
            className="studio-dot-grid-wave-dot-wrap"
            style={{
              "--dot-x": `${dot.x}px`,
              "--dot-y": `${dot.y}px`,
              "--dot-delay": `${dot.delay}s`,
            }}
          >
            <span className="studio-dot-grid-wave-dot" />
          </span>
        ))}
      </div>
    </div>
  );
}
