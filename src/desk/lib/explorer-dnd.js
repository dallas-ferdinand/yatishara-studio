/** Drag-and-drop payload from explorer → composer / timeline. */
export const EXPLORER_DND_TYPE = "application/x-mercuryos-path";

/**
 * Mobile Files→composer gesture model (one owner — this module):
 *
 *   idle → hold (short pickup) → drag (finger moved) → idle
 *                  ↘ menu (still-hold) → idle
 *
 * Scroll lock is a SINGLE document-level non-passive touchmove listener.
 * Rows never own that listener themselves — live Convex list rows can unmount
 * mid-hold, and a per-row lock would leak app-wide scroll death.
 *
 * Body classes (CSS also locks .desk-file-tree-scroll):
 *   is-touch-file-drag-armed  — hold, before drag intent
 *   is-touch-file-drag        — active touch drag
 */

/** Active drag entry — readable during dragOver (getData is blocked until drop). */
let activeExplorerDrag = null;

/**
 * Direct mobile Files→composer attach handler (bypasses DOM CustomEvent / hit-testing).
 * StudioShell registers this; FileTree invokes it on touch-drag release from the dock.
 */
let mobileComposerDropHandler = null;

/** @type {"idle" | "hold" | "drag"} */
let touchGesturePhase = "idle";
/** Invalidates stale cancelTouchFileHold calls after a new hold/drag starts. */
let touchGestureGeneration = 0;
/** @type {((event: TouchEvent) => void) | null} */
let touchScrollLockListener = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let touchGestureSafetyTimer = null;

function onTouchScrollLockMove(event) {
  if (event.cancelable) event.preventDefault();
}

function ensureTouchScrollLock() {
  if (typeof document === "undefined") return;
  if (touchScrollLockListener) return;
  touchScrollLockListener = onTouchScrollLockMove;
  document.addEventListener("touchmove", touchScrollLockListener, {
    capture: true,
    passive: false,
  });
}

function clearTouchScrollLock() {
  if (typeof document === "undefined") return;
  if (!touchScrollLockListener) return;
  document.removeEventListener("touchmove", touchScrollLockListener, true);
  touchScrollLockListener = null;
}

function clearTouchGestureSafetyTimer() {
  if (touchGestureSafetyTimer == null) return;
  clearTimeout(touchGestureSafetyTimer);
  touchGestureSafetyTimer = null;
}

function armTouchGestureSafetyTimer() {
  if (typeof window === "undefined") return;
  clearTouchGestureSafetyTimer();
  // Hard ceiling — if finish()/cancel never ran (tab freeze, HMR, etc.),
  // don't leave the whole Studio unable to scroll.
  touchGestureSafetyTimer = window.setTimeout(() => {
    touchGestureSafetyTimer = null;
    if (touchGesturePhase !== "idle") endTouchFileGesture();
  }, 8000);
}

/**
 * Short pickup armed — freeze scroll so the Files list can't pan under the finger.
 * @returns {number} generation token for cancelTouchFileHold
 */
export function beginTouchFileHold() {
  if (typeof document === "undefined") return 0;
  touchGestureGeneration += 1;
  const generation = touchGestureGeneration;
  ensureTouchScrollLock();
  document.body.classList.add("is-touch-file-drag-armed");
  document.body.classList.remove("is-touch-file-drag", "is-drag-cursor");
  touchGesturePhase = "hold";
  armTouchGestureSafetyTimer();
  return generation;
}

/** Cancel a still-hold that never became a drag (release / unmount / menu). */
export function cancelTouchFileHold(generation) {
  if (touchGesturePhase !== "hold") return;
  if (generation != null && generation !== touchGestureGeneration) return;
  if (typeof document !== "undefined") {
    document.body.classList.remove("is-touch-file-drag-armed");
  }
  clearTouchScrollLock();
  clearTouchGestureSafetyTimer();
  touchGesturePhase = "idle";
}

/** Finger moved past drag threshold — keep the same scroll lock, mark dragging. */
export function promoteTouchFileDrag() {
  if (typeof document === "undefined") return;
  ensureTouchScrollLock();
  document.body.classList.add("is-drag-cursor", "is-touch-file-drag");
  document.body.classList.remove("is-touch-file-drag-armed");
  touchGesturePhase = "drag";
  armTouchGestureSafetyTimer();
}

/** Always-safe cleanup after drop / return / cancel / safety timer. */
export function endTouchFileGesture() {
  if (typeof document !== "undefined") {
    document.body.classList.remove(
      "is-drag-cursor",
      "is-touch-file-drag",
      "is-touch-file-drag-armed",
    );
  }
  clearTouchScrollLock();
  clearTouchGestureSafetyTimer();
  touchGesturePhase = "idle";
  // Invalidate any pending cancelTouchFileHold from a dead row.
  touchGestureGeneration += 1;
  activeExplorerDrag = null;
}

export function isTouchFileGestureActive() {
  return touchGesturePhase !== "idle";
}

export function getTouchFileGesturePhase() {
  return touchGesturePhase;
}

export function setMobileComposerDropHandler(handler) {
  mobileComposerDropHandler = typeof handler === "function" ? handler : null;
}

export function deliverMobileComposerDrop(entry, clientX = 0, clientY = 0) {
  if (!entry || !mobileComposerDropHandler) return false;
  // Handler may return false if attach rejected (bad entry); treat undefined as ok
  // when the call was scheduled (FastShaders: defer attach after gesture end).
  const result = mobileComposerDropHandler({ entry, clientX, clientY });
  return result !== false;
}

export function inferMediaKind(entry) {
  if (!entry) return null;
  const direct = entry.mediaKind ?? entry.kind;
  if (direct === "video" || direct === "audio" || direct === "image") return direct;

  const mime = String(entry.mimeType ?? "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";

  const ext = String(entry.ext ?? "").toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".aac", ".m4a", ".ogg"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(ext)) return "image";

  const label = String(entry.kindLabel ?? "").toLowerCase();
  if (label === "video") return "video";
  if (label === "audio") return "audio";
  if (label === "image") return "image";

  return null;
}

/** Build explorer→composer drag payload (files, purchased/library assets, etc.). */
export function buildExplorerDragPayload(entry) {
  if (!entry) return null;
  const path =
    entry.path ||
    (entry.studioId
      ? `/Studio/${entry.studioKind === "element" ? "elements" : "assets"}/${entry.studioId}`
      : null);
  if (!path) return null;
  const name = entry.name ?? path.split("/").pop() ?? path;
  const type = entry.type === "dir" ? "dir" : "file";
  const mediaKind = inferMediaKind(entry);
  const durationSeconds = Number(entry.durationSeconds ?? entry.duration);
  return {
    path,
    name,
    type,
    ext: entry.ext,
    studioKind: entry.studioKind,
    studioId: entry.studioId,
    elementType: entry.elementType,
    buildStatus: entry.buildStatus,
    sheetAssetId: entry.sheetAssetId,
    kindLabel: entry.kindLabel,
    description: entry.description,
    mediaUrl: entry.mediaUrl,
    thumbnailUrl: entry.thumbnailUrl,
    mimeType: entry.mimeType,
    byteSize: entry.byteSize,
    licenseKind: entry.licenseKind,
    sourceListingId: entry.sourceListingId,
    mediaKind,
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0.1
      ? { durationSeconds }
      : {}),
  };
}

/** Arm drag without HTML5 DataTransfer — used for mobile touch pickup. */
export function armExplorerDrag(entry) {
  if (!entry) {
    activeExplorerDrag = null;
    return null;
  }
  const payload = buildExplorerDragPayload(entry);
  // Keep full entry fields (thumbs, mime, etc.) merged over the slim DnD payload
  // so mobile touch-drop can still resolve chips when path lookup misses.
  activeExplorerDrag = payload ? { ...entry, ...payload } : { ...entry };
  return activeExplorerDrag;
}

export function writeExplorerDragData(dataTransfer, entry) {
  if (!dataTransfer) return;
  const payload = buildExplorerDragPayload(entry);
  if (!payload) return;
  activeExplorerDrag = payload ? { ...entry, ...payload } : { ...entry };
  dataTransfer.setData(EXPLORER_DND_TYPE, JSON.stringify(payload));
  dataTransfer.effectAllowed = "all";
}

export function readExplorerDragData(dataTransfer) {
  const raw = dataTransfer?.getData(EXPLORER_DND_TYPE);
  if (!raw) return activeExplorerDrag;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function peekActiveExplorerDrag() {
  return activeExplorerDrag;
}

export function clearActiveExplorerDrag() {
  activeExplorerDrag = null;
}
