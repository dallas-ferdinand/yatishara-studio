/** Mobile gestures — swipe rows, sheet dismiss, edge back, pull refresh. */
import { icon } from "./icons.js";

const SWIPE_SNAP = 56;
const SWIPE_DELETE = 120;
const LONG_PRESS_MS = 480;
const PULL_READY_PX = 56;
const PULL_MAX_PX = 72;

/** @type {(() => void) | null} */
let closeOpenRow = null;

/** Long press → action sheet (no ⋮ buttons). */
export function wireLongPress(el, onLongPress, { delay = LONG_PRESS_MS } = {}) {
  if (!el || !onLongPress) return;
  let timer = null;
  let fired = false;
  let startX = 0;
  let startY = 0;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  el.addEventListener(
    "touchstart",
    (e) => {
      fired = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      clear();
      timer = setTimeout(() => {
        fired = true;
        el.classList.add("is-long-press");
        onLongPress();
        setTimeout(() => el.classList.remove("is-long-press"), 180);
      }, delay);
    },
    { passive: true }
  );

  el.addEventListener(
    "touchmove",
    (e) => {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 12 || dy > 12) clear();
    },
    { passive: true }
  );

  el.addEventListener("touchend", clear);
  el.addEventListener("touchcancel", clear);

  el.addEventListener(
    "click",
    (e) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fired = false;
      }
    },
    true
  );
}

function closeRow(wrap) {
  const front = wrap?.querySelector(".wa-row-front");
  if (front) {
    front.style.transform = "";
    wrap.classList.remove("is-open-left", "is-open-right");
  }
}

function closeAllRows(except) {
  document.querySelectorAll(".wa-row-wrap.is-open-left, .wa-row-wrap.is-open-right").forEach((w) => {
    if (w !== except) closeRow(w);
  });
}

/**
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.className
 * @param {string} [opts.wrapClass]
 * @param {HTMLElement[]} opts.children - avatar, body, etc.
 * @param {() => void} opts.onOpen
 * @param {() => void} [opts.onMenu] — long press
 * @param {() => void} opts.onDelete
 * @param {() => void} opts.onPin
 */
export function buildSwipeChatRow(opts) {
  const wrap = document.createElement("div");
  wrap.className = `wa-row-wrap${opts.wrapClass ?? ""}`;
  wrap.dataset.chatId = opts.id;

  const behind = document.createElement("div");
  behind.className = "wa-row-behind";
  behind.innerHTML = `
    <button type="button" class="wa-row-action wa-row-action-pin" aria-label="Pin chat">${icon("pin", 18)}<span>Pin</span></button>
    <button type="button" class="wa-row-action wa-row-action-delete" aria-label="Delete chat">${icon("trash", 18)}<span>Delete</span></button>`;

  const front = document.createElement("div");
  front.className = "wa-row-front";

  const row = document.createElement("button");
  row.type = "button";
  row.className = opts.className;
  for (const ch of opts.children) row.appendChild(ch);

  front.append(row);
  wrap.append(behind, front);

  row.addEventListener("click", () => {
    if (wrap.classList.contains("is-open-left") || wrap.classList.contains("is-open-right")) {
      closeRow(wrap);
      return;
    }
    opts.onOpen();
  });

  if (opts.onMenu) {
    wireLongPress(row, () => {
      closeAllRows();
      opts.onMenu();
    });
  }

  behind.querySelector(".wa-row-action-pin")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeRow(wrap);
    opts.onPin();
  });
  behind.querySelector(".wa-row-action-delete")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeRow(wrap);
    opts.onDelete();
  });

  wireRowSwipe(front, wrap, opts.onDelete);

  return wrap;
}

function wireRowSwipe(front, wrap, onFullDelete) {
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let tracking = false;
  let axis = null;

  front.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      closeAllRows(wrap);
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      axis = null;
      baseX = wrap.classList.contains("is-open-left")
        ? SWIPE_SNAP
        : wrap.classList.contains("is-open-right")
          ? -SWIPE_SNAP
          : 0;
      front.style.transition = "none";
    },
    { passive: true }
  );

  front.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "y") {
          tracking = false;
          return;
        }
      }
      if (axis !== "x") return;
      e.preventDefault();
      const x = Math.max(-SWIPE_SNAP, Math.min(SWIPE_SNAP, baseX + dx));
      front.style.transform = `translateX(${x}px)`;
    },
    { passive: false }
  );

  const end = () => {
    if (!tracking) return;
    tracking = false;
    front.style.transition = "";
    const m = /translateX\((-?\d+)/.exec(front.style.transform);
    const x = m ? parseInt(m[1], 10) : 0;
    wrap.classList.remove("is-open-left", "is-open-right");
    if (x <= -SWIPE_DELETE) {
      front.style.transform = "";
      onFullDelete();
      return;
    }
    if (x <= -SWIPE_SNAP / 2) {
      front.style.transform = `translateX(-${SWIPE_SNAP}px)`;
      wrap.classList.add("is-open-right");
      closeOpenRow = () => closeRow(wrap);
      return;
    }
    if (x >= SWIPE_DELETE) {
      front.style.transform = "";
      wrap.querySelector(".wa-row-action-pin")?.click();
      return;
    }
    if (x >= SWIPE_SNAP / 2) {
      front.style.transform = `translateX(${SWIPE_SNAP}px)`;
      wrap.classList.add("is-open-left");
      closeOpenRow = () => closeRow(wrap);
      return;
    }
    front.style.transform = "";
  };

  front.addEventListener("touchend", end);
  front.addEventListener("touchcancel", end);
}

export function dismissOpenSwipeRows() {
  closeAllRows();
  closeOpenRow = null;
}

/** Close open swipe rows when tapping outside or scrolling lists. */
export function wireTapDismissSwipeRows() {
  if (document.body.dataset.swipeDismissTap === "1") return;
  document.body.dataset.swipeDismissTap = "1";
  document.addEventListener(
    "touchstart",
    (e) => {
      if (!e.target.closest(".wa-row-wrap")) dismissOpenSwipeRows();
    },
    { passive: true }
  );
  for (const sel of ["#chats-list", "#files-list"]) {
    document.querySelector(sel)?.addEventListener("scroll", dismissOpenSwipeRows, { passive: true });
  }
}

/**
 * File row with optional menu + swipe-right to go up.
 * @param {object} opts
 */
export function buildFileRow(opts) {
  const wrap = document.createElement("div");
  wrap.className = `file-row-wrap${opts.grid ? " is-grid" : ""}`;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = opts.className;
  btn.innerHTML = opts.innerHtml;

  btn.addEventListener("click", () => opts.onOpen());

  if (opts.onMenu) {
    wireLongPress(btn, () => opts.onMenu());
  }

  if (opts.grid) {
    wrap.append(btn);
  } else {
    const front = document.createElement("div");
    front.className = "file-row-front";
    front.append(btn);
    wrap.append(front);
    if (opts.canSwipeBack) wireFileSwipeBack(front, opts.onSwipeBack);
  }

  return wrap;
}

function wireFileSwipeBack(front, onBack) {
  let startX = 0;
  let tracking = false;
  front.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      tracking = true;
      front.style.transition = "none";
    },
    { passive: true }
  );
  front.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      if (dx < 0) return;
      e.preventDefault();
      front.style.transform = `translateX(${Math.min(dx, 80)}px)`;
    },
    { passive: false }
  );
  const end = (e) => {
    if (!tracking) return;
    tracking = false;
    front.style.transition = "";
    const dx = e.changedTouches?.[0]?.clientX - startX;
    front.style.transform = "";
    if (dx > 60) onBack?.();
  };
  front.addEventListener("touchend", end);
  front.addEventListener("touchcancel", end);
}

/** Swipe down to dismiss bottom sheets. */
export function wireSheetDismiss() {
  document.querySelectorAll(".sheet .sheet-panel").forEach((panel) => {
    if (panel.dataset.swipeDismiss === "1") return;
    panel.dataset.swipeDismiss = "1";
    const sheet = panel.closest(".sheet");
    let startY = 0;
    let dragging = false;
    let moved = false;

    const reset = () => {
      panel.style.transition = "";
      panel.style.transform = "";
      dragging = false;
      moved = false;
    };

    panel.addEventListener(
      "touchstart",
      (e) => {
        if (panel.scrollTop > 4) return;
        startY = e.touches[0].clientY;
        dragging = true;
        moved = false;
        panel.style.transition = "none";
      },
      { passive: true }
    );

    panel.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging) return;
        const dy = e.touches[0].clientY - startY;
        if (dy < 0) return;
        if (dy > 8) moved = true;
        e.preventDefault();
        panel.style.transform = `translateY(${dy}px)`;
      },
      { passive: false }
    );

    const end = () => {
      if (!dragging) return;
      const m = /translateY\((\d+)/.exec(panel.style.transform);
      const dy = m ? parseInt(m[1], 10) : 0;
      if (dy > 100 && moved) {
        sheet?.classList.add("hidden");
        reset();
        return;
      }
      reset();
    };

    panel.addEventListener("touchend", end);
    panel.addEventListener("touchcancel", end);
  });
}

/** Edge swipe from left → back (thread). */
export function wireEdgeBack(el, onBack) {
  if (!el || el.dataset.edgeBack === "1") return;
  el.dataset.edgeBack = "1";
  const EDGE = 28;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  el.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      if (e.touches[0].clientX > EDGE) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      el.style.transition = "none";
    },
    { passive: true }
  );

  el.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
        tracking = false;
        el.style.transform = "";
        return;
      }
      if (dx < 0) return;
      e.preventDefault();
      el.style.transform = `translateX(${Math.min(dx, 120)}px)`;
    },
    { passive: false }
  );

  const end = (e) => {
    if (!tracking) return;
    tracking = false;
    el.style.transition = "";
    const dx = e.changedTouches?.[0]?.clientX - startX;
    el.style.transform = "";
    if (dx > 80) onBack();
  };

  el.addEventListener("touchend", end);
  el.addEventListener("touchcancel", () => {
    tracking = false;
    el.style.transform = "";
    el.style.transition = "";
  });
}

function resolvePullIndicator(scroller, indicatorEl) {
  if (indicatorEl) return indicatorEl;
  const host = scroller.closest("[data-pull-host]");
  if (host) {
    const found = host.querySelector(".pull-refresh-indicator");
    if (found) return found;
  }
  return scroller.previousElementSibling?.classList?.contains("pull-refresh-indicator")
    ? scroller.previousElementSibling
    : null;
}

function atScrollTop(scroller) {
  return (scroller.scrollTop ?? 0) <= 1;
}

/** Pull down on scroll container to refresh. Indicator must live outside scroller (not wiped on render). */
export function wirePullRefresh(scroller, onRefresh, { indicator: indicatorEl } = {}) {
  if (!scroller || scroller.dataset.pullRefresh === "1") return;
  scroller.dataset.pullRefresh = "1";

  const getIndicator = () => {
    let el = resolvePullIndicator(scroller, indicatorEl);
    if (!el) {
      el = document.createElement("div");
      el.className = "pull-refresh-indicator";
      el.setAttribute("aria-hidden", "true");
      const host = scroller.parentElement;
      if (host) host.insertBefore(el, scroller);
    }
    if (!el.innerHTML.trim()) {
      el.innerHTML = `${icon("refresh", 16)}<span>Pull to refresh</span>`;
    }
    return el;
  };

  let startY = 0;
  let pulling = false;
  let pullDy = 0;

  const resetPullUi = () => {
    const indicator = getIndicator();
    indicator.classList.remove("is-visible", "is-ready", "is-loading");
    indicator.style.height = "";
    scroller.style.transition = "";
    scroller.style.transform = "";
    pullDy = 0;
  };

  scroller.addEventListener(
    "touchstart",
    (e) => {
      if (!atScrollTop(scroller)) return;
      startY = e.touches[0].clientY;
      pulling = true;
      pullDy = 0;
    },
    { passive: true }
  );

  scroller.addEventListener(
    "touchmove",
    (e) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (!atScrollTop(scroller) && dy > 0) {
        pulling = false;
        resetPullUi();
        return;
      }
      if (dy <= 0) {
        pullDy = 0;
        resetPullUi();
        return;
      }
      pullDy = dy;
      e.preventDefault();
      const indicator = getIndicator();
      const clamp = Math.min(dy, PULL_MAX_PX);
      indicator.style.height = `${clamp}px`;
      indicator.classList.add("is-visible");
      indicator.classList.toggle("is-ready", dy > PULL_READY_PX);
      scroller.style.transition = "none";
      scroller.style.transform = `translateY(${clamp * 0.35}px)`;
    },
    { passive: false }
  );

  const end = async () => {
    if (!pulling) return;
    pulling = false;
    const indicator = getIndicator();
    const ready = pullDy > PULL_READY_PX;
    indicator.classList.remove("is-visible", "is-ready");
    scroller.style.transition = "";
    scroller.style.transform = "";

    if (ready) {
      indicator.classList.add("is-loading");
      indicator.style.height = "40px";
      try {
        await onRefresh();
      } finally {
        indicator.classList.remove("is-loading");
        indicator.style.height = "";
      }
    } else {
      indicator.style.height = "";
    }
    pullDy = 0;
  };

  scroller.addEventListener("touchend", end);
  scroller.addEventListener("touchcancel", end);
}
