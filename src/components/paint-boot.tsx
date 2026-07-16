"use client";

/* eslint-disable @next/next/no-img-element -- first paint must not depend on the Next image runtime */

import { useEffect, useState } from "react";
import { mercuryLogoAssets } from "@/lib/brand-assets";

const PAINT_BOOT_LOGO = mercuryLogoAssets(48, "light");

/**
 * Server-rendered first-paint boot that remains React-owned through hydration.
 * AuthGate mounts its longer-lived boot overlay in the same passive-effect flush.
 */
export function PaintBoot() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(false);
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
          <div className="ys-boot-logo" aria-hidden="true">
            <img
              src={PAINT_BOOT_LOGO.src}
              alt=""
              width={48}
              height={48}
              decoding="sync"
              fetchPriority="high"
            />
          </div>
          <p className="ys-boot-wordmark">Yatishara Studio</p>
          <div className="ys-boot-track" aria-hidden="true">
            <div className="ys-boot-bar" />
          </div>
        </div>
      </main>
    </div>
  );
}
