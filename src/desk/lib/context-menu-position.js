/** Keep fixed-position menus/dialogs inside the viewport. */

export const VIEWPORT_EDGE_PAD = 8;

export function clampFloatingPosition(x, y, width, height, pad = VIEWPORT_EDGE_PAD) {
  if (typeof window === "undefined" || !width || !height) {
    return { left: x, top: y };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = x;
  let top = y;

  if (left + width + pad > vw) {
    left = x - width;
  }
  left = Math.min(Math.max(pad, left), Math.max(pad, vw - width - pad));

  if (height + pad * 2 >= vh) {
    top = pad;
  } else {
    if (top + height + pad > vh) {
      top = y - height;
    }
    top = Math.min(Math.max(pad, top), Math.max(pad, vh - height - pad));
  }

  return { left, top };
}

/** Measure a mounted menu and clamp to the viewport (runs before paint). */
export function applyFloatingMenuPosition(el, x, y, pad = VIEWPORT_EDGE_PAD) {
  if (!el) return { left: x, top: y };
  const rect = el.getBoundingClientRect();
  return clampFloatingPosition(x, y, rect.width, rect.height, pad);
}
