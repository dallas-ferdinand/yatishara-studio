/** Virtual video-edit project file extension in Files (portable packages use the same). */

export const STUDIO_PROJECT_EXT = ".studio";

/** Strip display extension from a video-edit name (supports legacy `.edit`). */
export function stripStudioProjectExt(name: string): string {
  return String(name ?? "").replace(/\.(studio|edit)$/i, "");
}

/** Ensure a display filename ends with `.studio`. */
export function withStudioProjectExt(name: string): string {
  const bare = stripStudioProjectExt(name).trim() || "Untitled";
  return `${bare}${STUDIO_PROJECT_EXT}`;
}

export function isStudioProjectExt(extOrName: string): boolean {
  const value = String(extOrName ?? "").toLowerCase();
  if (value === ".studio" || value === ".edit") return true;
  return /\.(studio|edit)$/i.test(value);
}
