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
 * Fixed white boot screen — class prefix ys-boot-v2 so stale cached loader CSS/JS is orphaned.
 */
export function StudioBootLoader({ recovery }: Props) {
  return (
    <main className="ys-boot-v2" data-ys-boot="2" aria-busy="true" aria-label="Loading Yatishara Studio">
      <div className="ys-boot-v2-stack">
        <div className="ys-boot-v2-logo" aria-hidden="true">
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
        <div className="ys-boot-v2-details">
          <p className="ys-boot-v2-wordmark">Yatishara Studio</p>
          <div className="ys-boot-v2-track" aria-hidden="true">
            <div className="ys-boot-v2-bar" />
          </div>
          {recovery}
        </div>
      </div>
    </main>
  );
}
