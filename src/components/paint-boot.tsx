"use client";

import { useEffect, useState } from "react";
import { LogoLoader } from "@/studio/components/logo-loader";
import {
  PAINT_BOOT_CLAIM,
  PAINT_BOOT_DISMISS,
} from "@/components/studio-paint-boot-control";

/**
 * Server-rendered first-paint boot that stays React-owned through the full
 * auth → user → shell-chunk gate. AuthGate claims this overlay and dismisses
 * it when ready — so the LogoLoader never remounts mid-spin.
 *
 * Routes without AuthGate: auto-dismisses after the first effect flush if
 * nobody claimed ownership.
 */
export function PaintBoot() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let claimed = false;

    const onClaim = () => {
      claimed = true;
      // Re-show after a prior dismiss (e.g. sign-out → auth pending again).
      setVisible(true);
    };
    const onDismiss = () => {
      setVisible(false);
    };

    window.addEventListener(PAINT_BOOT_CLAIM, onClaim);
    window.addEventListener(PAINT_BOOT_DISMISS, onDismiss);

    // Sibling/child effects (AuthGate) run in the same flush after this one.
    // Next frame: stay if claimed, otherwise hide (public/offers routes).
    const frame = window.requestAnimationFrame(() => {
      if (!claimed) setVisible(false);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(PAINT_BOOT_CLAIM, onClaim);
      window.removeEventListener(PAINT_BOOT_DISMISS, onDismiss);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      id="ys-paint-boot"
      className="ys-boot-overlay"
      aria-busy="true"
      aria-label="Loading Yatishara Studio"
    >
      <main className="ys-boot" data-ys-boot="boot">
        <div className="ys-boot-stack">
          <LogoLoader size="lg" appearance="light" />
        </div>
      </main>
    </div>
  );
}
