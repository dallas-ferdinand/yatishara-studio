/** Desk2 always uses gateway desk view (blocks, SSE, trimmed persist). */
export const DESK_MODE = true;

/** Gateway run API view: only `"desk"` trims to blocks payload; null = full run (includes events). */
export const DESK_RUN_VIEW = "desk";

/** Chat v5 — SDK-aligned runId + /api/v2/* (default on for desk-next). */
export const CHAT_V5 = true;

export function chatV5Enabled() {
  return CHAT_V5;
}

/** @param {string | null | undefined} explicitView */
export function deskApiView(explicitView) {
  if (explicitView === DESK_RUN_VIEW) return DESK_RUN_VIEW;
  return null;
}
