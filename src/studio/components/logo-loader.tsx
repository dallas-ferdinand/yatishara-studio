"use client";

import type { AppearanceMode } from "@/lib/brand-assets";
import { mercuryLogoAssets } from "@/lib/brand-assets";
import { useMercuryLogoAssets } from "@/lib/use-appearance-mode";
import "./logo-loader.css";

export type LogoLoaderSize = "sm" | "md" | "lg";

const MARK_PX: Record<LogoLoaderSize, number> = {
  sm: 24,
  md: 28,
  lg: 34,
};

type LogoLoaderProps = {
  size?: LogoLoaderSize;
  className?: string;
  /** Lock logo ink / glass to a canvas appearance (e.g. white boot → light). */
  appearance?: AppearanceMode;
};

/** Shared Yatishara logo loader — slow spin + synced fade/scale breath. */
export function LogoLoader({ size = "lg", className = "", appearance }: LogoLoaderProps) {
  const markPx = MARK_PX[size];
  const themed = useMercuryLogoAssets(markPx);
  const logo = appearance ? mercuryLogoAssets(markPx, appearance) : themed;

  return (
    <span
      className={["logo-loader", className].filter(Boolean).join(" ")}
      data-size={size}
      data-appearance={appearance}
      aria-hidden="true"
    >
      <span className="logo-loader-spin">
        <span className="logo-loader-breathe">
          <span className="logo-loader-glass" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="logo-loader-mark"
            src={logo.src}
            srcSet={logo.srcSet}
            sizes={logo.sizes}
            alt=""
            width={markPx}
            height={markPx}
            draggable={false}
            decoding="async"
          />
        </span>
      </span>
    </span>
  );
}
