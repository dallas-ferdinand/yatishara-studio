"use client";

import { useEffect } from "react";
import { mountMosTooltip } from "@/desk/lib/mos-tooltip.js";

/** Mounts global glass tooltips for all title= / data-mos-tip elements. */
export function MosTooltipLayer() {
  useEffect(() => mountMosTooltip(), []);
  return null;
}
