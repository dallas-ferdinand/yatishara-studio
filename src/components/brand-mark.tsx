"use client";

import { useState } from "react";
import { useMercuryLogoAssets } from "@/lib/use-appearance-mode";

type Props = {
  size?: number;
  subtle?: boolean;
};

/** Studio logo — WebP @ correct DPR, soft ambient breathe. */
export function BrandMark({ size = 48, subtle = false }: Props) {
  const [loaded, setLoaded] = useState(false);
  const assets = useMercuryLogoAssets(size);
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
