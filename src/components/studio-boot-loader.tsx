"use client";

import type { ReactNode } from "react";
import { mercuryLogoAssets } from "@/lib/brand-assets";

type Props = {
  /** Optional recovery affordance after a long wait. */
  recovery?: ReactNode;
};

const BOOT_LOGO_SIZE = 48;
/** Always light canvas → dark ink. Never waits on user theme. */
const BOOT_LOGO = mercuryLogoAssets(BOOT_LOGO_SIZE, "light");

/**
 * White boot screen. Intended for client-only mounts (auth gate / error recovery).
 * First paint uses the static `#ys-paint-boot` node in `layout.tsx` instead of SSR.
 */
export function StudioBootLoader({ recovery }: Props) {
  return (
    <main className="ys-boot" data-ys-boot="boot" aria-busy="true" aria-label="Loading Yatishara Studio">
      <div className="ys-boot-stack">
        <div className="ys-boot-logo" aria-hidden="true">
          <picture>
            <source type="image/webp" srcSet={BOOT_LOGO.srcSet} sizes={BOOT_LOGO.sizes} />
            <source
              type="image/png"
              srcSet={`${BOOT_LOGO.fallback} 1x, ${BOOT_LOGO.fallback2x} 2x`}
            />
            <img
              src={BOOT_LOGO.src}
              alt=""
              width={BOOT_LOGO_SIZE}
              height={BOOT_LOGO_SIZE}
              decoding="sync"
              loading="eager"
              fetchPriority="high"
              draggable={false}
            />
          </picture>
        </div>
        <p className="ys-boot-wordmark">Yatishara Studio</p>
        <div className="ys-boot-track" aria-hidden="true">
          <div className="ys-boot-bar" />
        </div>
        {recovery}
      </div>
    </main>
  );
}
