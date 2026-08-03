/** Place the desktop Share Access/File menu near a trigger, edge-aware. */

const MENU_WIDTH = 240;
const MENU_HEIGHT_ESTIMATE = 220;
const GAP = 4;
const PAD = 8;

/**
 * Prefer opening above the button when there isn't room below (pick footer,
 * rail Share). Always clamp into the viewport.
 *
 * @param {HTMLElement} buttonEl
 * @param {HTMLElement | null | undefined} menuEl
 * @returns {{ top: number, left: number, placement: "above" | "below" }}
 */
export function placeShareConfirmNearButton(buttonEl, menuEl) {
  const rect = buttonEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuHeight =
    menuEl && menuEl.getBoundingClientRect().height > 0
      ? menuEl.getBoundingClientRect().height
      : MENU_HEIGHT_ESTIMATE;

  const left = Math.min(
    Math.max(PAD, rect.right - MENU_WIDTH),
    Math.max(PAD, vw - MENU_WIDTH - PAD),
  );

  const spaceBelow = vh - rect.bottom - PAD;
  const spaceAbove = rect.top - PAD;
  let placement = "below";
  let top = rect.bottom + GAP;

  // Footer / bottom-rail triggers: prefer above whenever below is tight.
  if (spaceBelow < menuHeight + GAP && spaceAbove >= Math.min(spaceBelow, menuHeight * 0.5)) {
    top = rect.top - menuHeight - GAP;
    placement = "above";
  }

  top = Math.min(Math.max(PAD, top), Math.max(PAD, vh - menuHeight - PAD));
  return { top, left, placement };
}
