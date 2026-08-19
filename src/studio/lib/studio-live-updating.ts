import { isStudioLiveProductionHost } from "./studio-preview-host";

/**
 * Temporary live editor wall. Flip false and fast-deploy to restore the
 * editor on studio.yatishara.com. Preview / localhost never show this.
 */
export const STUDIO_LIVE_UPDATING = true;

export function shouldShowStudioUpdatingOverlay(hostname?: string | null): boolean {
  return STUDIO_LIVE_UPDATING && isStudioLiveProductionHost(hostname);
}
