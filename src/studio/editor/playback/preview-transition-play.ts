import type { TransitionType } from "../types";

/**
 * Heavy GPU transitions (multi-tap blur / zoom) hitch live playback at full
 * frame size. Approximate during play; scrub/paused and export stay faithful.
 */
export function previewTransitionWhilePlaying(
  type: TransitionType | undefined,
  playing: boolean,
): TransitionType | undefined {
  if (!playing || !type) return type;
  if (type === "blur" || type === "zoomIn") return "crossfade";
  return type;
}
