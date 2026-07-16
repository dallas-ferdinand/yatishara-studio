"use client";

import { useState } from "react";
import type { AppearanceMode } from "@/lib/brand-assets";
import { mercuryLogoAssets } from "@/lib/brand-assets";
import { useMercuryLogoAssets } from "@/lib/use-appearance-mode";

type Props = {
  size?: number;
  subtle?: boolean;
  /** Lock logo ink to a canvas appearance (avoids theme-driven swaps on fixed backgrounds). */
  appearance?: AppearanceMode;
};

/** Studio logo — WebP @ correct DPR, soft ambient breathe. */
export function BrandMark({ size = 48, subtle = false, appearance }: Props) {
  const [loaded, setLoaded] = useState(false);
  const themedAssets = useMercuryLogoAssets(size);
  const assets = appearance ? mercuryLogoAssets(size, appearance) : themedAssets;
  const ambient = !subtle;

  return (
    <div
      className={`mos-brand-mark relative flex items-center justify-center${ambient ? " mos-brand-mark--ambient" : ""}${subtle ? " opacity-85" : ""}`}
      style={{ width: size, height: size }}
    >
      <picture className="relative z-10 flex items-center justify-center">
        <source type="image/webp" srcSet={assets.srcSet} sizes={assets.sizes} />
        <source
          type="image/png"
          srcSet={`${assets.fallback} 1x, ${assets.fallback2x} 2x`}
        />
        <img
          src={assets.src}
          alt="Yatishara Studio"
          width={size}
          height={size}
          decoding="async"
          loading="eager"
          fetchPriority="high"
          onLoad={() => setLoaded(true)}
          className={`mos-brand-logo object-contain${loaded ? " is-loaded" : ""}${ambient ? " mos-brand-logo--breathe" : ""}`}
          style={{ width: size, height: size }}
        />
      </picture>
    </div>
  );
}
