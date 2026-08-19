"use client";

import { MERCURY_LOGO_BOOT } from "@/lib/brand-assets";

const LIGHT_INK = "/branding/yatishara-logo-light-192.webp";

/** Same full overlay look, scoped to the active tab/workspace pane. */
export function StudioUpdatingOverlay() {
  return (
    <div className="ys-updating-overlay" role="status">
      <div className="ys-updating-card">
        <img
          className="ys-updating-mark ys-updating-mark--on-light"
          src={MERCURY_LOGO_BOOT}
          alt=""
          width={48}
          height={48}
        />
        <img
          className="ys-updating-mark ys-updating-mark--on-dark"
          src={LIGHT_INK}
          alt=""
          width={48}
          height={48}
        />
        <h1 id="ys-updating-title">Scheduled Update in progress!</h1>
        <div
          className="ys-updating-bar"
          role="progressbar"
          aria-labelledby="ys-updating-title"
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="ys-updating-bar-fill" />
        </div>
        <p id="ys-updating-copy">Everything else is operational.</p>
      </div>
    </div>
  );
}
