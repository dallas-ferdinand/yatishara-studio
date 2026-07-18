"use client";

import type { ReactNode } from "react";
import { LogoLoader } from "@/studio/components/logo-loader";

type Props = {
  /** Optional recovery affordance after a long wait. */
  recovery?: ReactNode;
};

/**
 * White boot screen. Intended for client-only mounts (auth gate / error recovery).
 * First paint uses PaintBoot in `layout.tsx`.
 */
export function StudioBootLoader({ recovery }: Props) {
  return (
    <main className="ys-boot" data-ys-boot="boot" aria-busy="true" aria-label="Loading Yatishara Studio">
      <div className="ys-boot-stack">
        <LogoLoader size="lg" appearance="light" />
        {recovery}
      </div>
    </main>
  );
}
