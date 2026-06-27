import { buildViewFromSdkMessages } from "./turn-builder.js";
import { buildViewFromTurns, buildRunView } from "./conversation-builder.js";
import { viewStreamSig, buildViewCache } from "./view-sig.js";

/**
 * Compare live sdk message view vs conversation turns view.
 * @param {object} run
 * @returns {{ drift: boolean, messageSig: string, turnSig: string, details?: string }}
 */
export function detectViewDrift(run) {
  const fromMsgs = buildViewFromSdkMessages(run.sdkMessages ?? []);
  const msgSig = viewStreamSig(fromMsgs.blocks);

  if (!run.turns?.length) {
    return { drift: false, messageSig: msgSig, turnSig: "", details: "no_turns" };
  }

  const fromTurns = buildViewFromTurns(run.turns);
  const turnSig = viewStreamSig(fromTurns.blocks);

  const contentDrift =
    fromMsgs.content.trim() !== fromTurns.content.trim() &&
    fromTurns.content.trim().length > 0 &&
    fromMsgs.content.trim().length > 0;

  return {
    drift: msgSig !== turnSig || contentDrift,
    messageSig: msgSig,
    turnSig: turnSig,
    details: contentDrift ? "content_mismatch" : msgSig !== turnSig ? "block_sig_mismatch" : "ok",
  };
}

/**
 * Build authoritative view cache — conversation turns win when present.
 * @param {import("./types.js").RunRecord} run
 */
export function buildAuthoritativeViewCache(run) {
  const view = buildRunView(run);
  const drift = detectViewDrift(run);
  const source = run.turns?.length ? "conversation_turns" : "sdk_messages";
  const cache = buildViewCache(view.blocks, view.content, source);
  if (drift.drift) cache.drift = drift;
  return cache;
}

/**
 * Finalize run: set view cache from best available source.
 * @param {import("./types.js").RunRecord} run
 */
export function finalizeRunView(run) {
  run.viewCache = buildAuthoritativeViewCache(run);
  return run;
}
