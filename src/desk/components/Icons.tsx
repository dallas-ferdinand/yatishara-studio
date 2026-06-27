// @ts-nocheck
"use client";

/** Shared Lucide-style icons from mobile app bundle. */
import { icon as svgIcon } from "@mos-app/icons.js";

export function Icon({ name, size = 18, className = "" }) {
  let html = svgIcon(name);
  if (size !== 20) {
    html = html.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
  }
  return <span className={`icon-inline pointer-events-none ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}

export const modeIcon = (mode) => {
  if (mode === "plan") return "planMode";
  if (mode === "ask") return "askMode";
  return "agentMode";
};
