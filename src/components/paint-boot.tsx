"use client";

import { useEffect, useState } from "react";
import { LogoLoader } from "@/studio/components/logo-loader";

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
          <LogoLoader size="lg" appearance="light" />
        </div>
      </main>
    </div>
  );
}
