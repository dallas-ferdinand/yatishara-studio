"use client";

import type { AppearanceMode } from "@/lib/brand-assets";
import { mercuryLogoAssets } from "@/lib/brand-assets";
import { useAppearanceMode, useMercuryLogoAssets } from "@/lib/use-appearance-mode";
import "./logo-loader.css";

export type LogoLoaderSize = "sm" | "md" | "lg";
export type LogoLoaderVariant = "default" | "bare";

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
  /** `bare` hides the glass plate (parent already provides a plate). */
  variant?: LogoLoaderVariant;
};

/**
 * Shared Yatishara logo loader — global spinner for Studio + profile.
 * Plate/aura stay put (breathe); only the mark spins.
 * Aura carries the grow/shrink shadow (clip-path on glass would kill box-shadow).
 */
export function LogoLoader({
  size = "lg",
  className = "",
  appearance,
  variant = "default",
}: LogoLoaderProps) {
  const markPx = MARK_PX[size];
  const themeAppearance = useAppearanceMode();
  const resolvedAppearance = appearance ?? themeAppearance;
  const themed = useMercuryLogoAssets(markPx);
  const logo = appearance ? mercuryLogoAssets(markPx, appearance) : themed;

  return (
    <span
      className={["logo-loader", className].filter(Boolean).join(" ")}
      data-size={size}
      data-appearance={resolvedAppearance}
      data-variant={variant}
      aria-hidden="true"
    >
      <span className="logo-loader-breathe">
        <span className="logo-loader-aura" />
        <span className="logo-loader-glass" />
        <span className="logo-loader-spin">
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
