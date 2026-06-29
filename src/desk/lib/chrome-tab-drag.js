/**
 * Chrome-style tab strip drag/reorder.
 *
 * Mirrors chromium TabDragController + TabStrip ideal_bounds:
 * - Fixed-width ideal slot grid captured once at drag start (stable during drag).
 * - Insertion uses dragged tab leading edge + inset, vs each slot midpoint.
 * - Directional hysteresis prevents flip-flop when parked on a boundary.
 *
 * @see chromium tab_drag_controller.cc (kLeadingWidthForDrag, GetInsertionIndexFrom)
 */

export const TAB_DRAG_START_PX = 5;
/** Chrome kLeadingWidthForDrag — insertion point inset from tab leading edge. */
export const TAB_DRAG_LEADING_INSET_PX = 16;
/** Ghost settle spring duration (ms) — keep in sync with desk-shell.css */
export const TAB_DRAG_SETTLE_MS = 460;
/** Uniform tab width — keep in sync with --cursor-unified-tab-width in desk-shell.css */
export const UNIFIED_TAB_WIDTH_PX = 168;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Snapshot strip layout once when drag starts — do not remeasure during drag. */
export function captureStripLayout(
  stripEl,
  tabCount,
  selector = "[data-tab-key]",
  newChatEl = null
) {
  const rects = measureTabRects(stripEl, selector);
  const stripRect = stripEl?.getBoundingClientRect?.();
  const newChatRect = newChatEl?.getBoundingClientRect?.();
  const anchorLeft = rects[0]?.left ?? stripRect?.left ?? 0;
  const tabWidth = rects[0]?.width > 0 ? rects[0].width : UNIFIED_TAB_WIDTH_PX;
  const measuredStep =
    rects.length > 1 && rects[1].left > rects[0].left
      ? rects[1].left - rects[0].left
      : tabWidth;
  return {
    anchorLeft,
    tabWidth,
    tabStep: measuredStep > 0 ? measuredStep : tabWidth,
    tabCount: Math.max(tabCount ?? 0, rects.length),
    stripTop: stripRect?.top ?? rects[0]?.top ?? 0,
    /** Left edge of the + button — ghost must stay left of this. */
    newChatLeft: newChatRect?.left ?? null,
  };
}

/** Target top-left for ghost when dropped at insertIndex among remaining tabs. */
export function ghostTargetAtInsertIndex(layout, insertIndex) {
  const { anchorLeft, tabStep, tabWidth, stripTop } = layout ?? {};
  const width = tabWidth > 0 ? tabWidth : UNIFIED_TAB_WIDTH_PX;
  const step = tabStep > 0 ? tabStep : width;
  const index = Math.max(0, insertIndex | 0);
  return {
    x: (anchorLeft ?? 0) + index * step,
    y: stripTop ?? 0,
  };
}

/**
 * Insert index among tabs excluding the dragged one.
 * Uses a collapsed slot grid (n-1 slots packed from strip anchor) so midpoints
 * match where remaining tabs sit after the dragged tab is removed from the row.
 */
export function insertionIndexAmongCollapsed(dragLeadingX, anchorLeft, tabWidth, otherCount, tabStep = tabWidth) {
  const width = tabWidth > 0 ? tabWidth : UNIFIED_TAB_WIDTH_PX;
  const step = tabStep > 0 ? tabStep : width;
  const count = Math.max(0, otherCount | 0);
  if (!count) return 0;

  for (let i = 0; i < count; i++) {
    const mid = anchorLeft + i * step + width / 2;
    if (dragLeadingX < mid) return i;
  }
  return count;
}

/**
 * Chrome GetInsertionIndexFrom on full strip (n slots). Prefer collapsed grid during drag.
 * @deprecated Use insertionIndexAmongCollapsed when dragged tab is removed from layout.
 */
export function insertionStripIndexAtIdealGrid(dragLeadingX, anchorLeft, tabWidth, tabCount) {
  const width = tabWidth > 0 ? tabWidth : UNIFIED_TAB_WIDTH_PX;
  const count = Math.max(0, tabCount | 0);
  if (!count) return 0;

  for (let i = 0; i < count; i++) {
    const mid = anchorLeft + i * width + width / 2;
    if (dragLeadingX < mid) return i;
  }
  return count;
}

/** Map full strip index → insert index among tabs excluding dragged. */
export function insertIndexAmongOthers(order, draggedKey, stripIndex) {
  const without = order.filter((k) => k !== draggedKey);
  let insertAt = 0;
  const limit = Math.min(Math.max(0, stripIndex), order.length);
  for (let i = 0; i < limit; i++) {
    if (order[i] !== draggedKey) insertAt++;
  }
  return clamp(insertAt, 0, without.length);
}

/** Accept strip index change only when pointer moved in the drag direction (anti-jitter). */
export function shouldAcceptStripIndex(nextIndex, prevIndex, dragLeadingX, lastLeadingX) {
  if (nextIndex === prevIndex) return true;
  if (prevIndex < 0) return true;
  const minDelta = 2;
  if (nextIndex > prevIndex) return dragLeadingX >= lastLeadingX + minDelta;
  if (nextIndex < prevIndex) return dragLeadingX <= lastLeadingX - minDelta;
  return true;
}

export function orderWithInsertion(order, draggedKey, insertIndex) {
  const without = order.filter((k) => k !== draggedKey);
  const clamped = clamp(insertIndex, 0, without.length);
  const next = [...without];
  next.splice(clamped, 0, draggedKey);
  return next;
}

/** Resolve next order from pointer + frozen collapsed grid (matches placeholder layout). */
export function resolveDragOrder({
  order,
  draggedKey,
  dragLeadingX,
  layout,
  lastStripIndex = -1,
  lastLeadingX = dragLeadingX,
}) {
  const { anchorLeft, tabWidth, tabStep } = layout ?? {};
  const otherCount = Math.max(0, order.length - 1);
  const insertIndex = insertionIndexAmongCollapsed(
    dragLeadingX,
    anchorLeft ?? 0,
    tabWidth ?? UNIFIED_TAB_WIDTH_PX,
    otherCount,
    tabStep ?? tabWidth ?? UNIFIED_TAB_WIDTH_PX
  );
  if (!shouldAcceptStripIndex(insertIndex, lastStripIndex, dragLeadingX, lastLeadingX)) {
    return { order, stripIndex: lastStripIndex, leadingX: lastLeadingX, changed: false };
  }
  const nextOrder = orderWithInsertion(order, draggedKey, insertIndex);
  const changed = !arraysEqual(nextOrder, order);
  return {
    order: nextOrder,
    stripIndex: insertIndex,
    insertIndex,
    leadingX: dragLeadingX,
    changed,
  };
}

export function measureTabRects(stripEl, selector = "[data-tab-key]") {
  if (!stripEl) return [];
  return [...stripEl.querySelectorAll(selector)].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      key: el.dataset.tabKey,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
  });
}

export function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** @deprecated Use resolveDragOrder + ideal grid */
export function insertionIndexAtPointer(pointerX, tabRects, { excludeKey } = {}) {
  const slots = tabRects.filter((t) => t.key && t.key !== excludeKey);
  for (let i = 0; i < slots.length; i++) {
    const { left, width } = slots[i];
    const mid = left + width / 2;
    if (pointerX < mid) return i;
  }
  return slots.length;
}

export function currentInsertIndex(order, draggedKey) {
  const idx = order.indexOf(draggedKey);
  return idx >= 0 ? idx : 0;
}
