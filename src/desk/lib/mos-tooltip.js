/** Global glass tooltips — intercept native title= and data-mos-tip across the desk. */

const SHOW_MS = 400;
const HIDE_MS = 60;
const GAP = 10;
const VIEWPORT_PAD = 10;

/** @type {HTMLDivElement | null} */
let tipEl = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let showTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let hideTimer = null;
/** @type {HTMLElement | null} */
let currentAnchor = null;
/** @type {string | null} */
let storedTitle = null;

function getTipEl() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "mos-tooltip";
    tipEl.setAttribute("role", "tooltip");
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function clearTimers() {
  if (showTimer) clearTimeout(showTimer);
  if (hideTimer) clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
}

function restoreAnchorTitle() {
  if (!currentAnchor) return;
  if (storedTitle != null && storedTitle !== "") {
    currentAnchor.setAttribute("title", storedTitle);
  }
  currentAnchor.removeAttribute("data-mos-tip-active");
  currentAnchor = null;
  storedTitle = null;
}

function hideTip() {
  clearTimers();
  restoreAnchorTitle();
  if (tipEl) {
    tipEl.classList.remove("is-visible", "is-below");
    tipEl.hidden = true;
    tipEl.textContent = "";
  }
}

/**
 * @param {HTMLElement} anchor
 * @param {HTMLElement} tip
 */
function positionTip(anchor, tip) {
  tip.classList.remove("is-below");
  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let top = rect.top - tipRect.height - GAP;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;

  left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - tipRect.width - VIEWPORT_PAD));

  if (top < VIEWPORT_PAD) {
    top = rect.bottom + GAP;
    tip.classList.add("is-below");
  }

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/**
 * @param {HTMLElement} anchor
 * @param {string} text
 */
function revealTip(anchor, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return;

  const tip = getTipEl();
  tip.textContent = trimmed;
  tip.hidden = false;
  tip.classList.remove("is-visible");

  positionTip(anchor, tip);
  requestAnimationFrame(() => {
    if (currentAnchor === anchor) tip.classList.add("is-visible");
  });
}

/**
 * @param {EventTarget | null} target
 * @returns {{ el: HTMLElement; text: string } | null}
 */
function resolveTipTarget(target) {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-mos-tip], [title]");
  if (!(el instanceof HTMLElement)) return null;
  if (el.classList.contains("mos-tooltip")) return null;
  if (el.closest(".mos-tooltip")) return null;

  const text = el.getAttribute("data-mos-tip") ?? el.getAttribute("title") ?? "";
  if (!String(text).trim()) return null;

  if (el.disabled || el.getAttribute("aria-disabled") === "true") return null;

  return { el, text: String(text) };
}

/**
 * @param {Event} e
 */
function onPointerOver(e) {
  const hit = resolveTipTarget(e.target);
  if (!hit) return;
  if (currentAnchor === hit.el) return;

  hideTip();

  currentAnchor = hit.el;
  storedTitle = hit.el.getAttribute("title");
  if (storedTitle) hit.el.removeAttribute("title");
  hit.el.setAttribute("data-mos-tip-active", "");

  showTimer = setTimeout(() => {
    if (currentAnchor === hit.el) revealTip(hit.el, hit.text);
  }, SHOW_MS);
}

/**
 * @param {MouseEvent} e
 */
function onPointerOut(e) {
  if (!currentAnchor) return;
  const related = e.relatedTarget;
  if (related instanceof Node && currentAnchor.contains(related)) return;
  hideTimer = setTimeout(hideTip, HIDE_MS);
}

function onFocusIn(e) {
  const hit = resolveTipTarget(e.target);
  if (!hit) return;
  if (currentAnchor === hit.el) return;
  hideTip();
  currentAnchor = hit.el;
  storedTitle = hit.el.getAttribute("title");
  if (storedTitle) hit.el.removeAttribute("title");
  hit.el.setAttribute("data-mos-tip-active", "");
  revealTip(hit.el, hit.text);
}

function onFocusOut(e) {
  const related = e.relatedTarget;
  if (currentAnchor && related instanceof Node && currentAnchor.contains(related)) return;
  hideTip();
}

function onDismiss() {
  hideTip();
}

/** @returns {() => void} */
export function mountMosTooltip() {
  if (typeof document === "undefined") return () => {};

  document.addEventListener("mouseover", onPointerOver, true);
  document.addEventListener("mouseout", onPointerOut, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("scroll", onDismiss, true);
  document.addEventListener("mousedown", onDismiss, true);
  window.addEventListener("blur", onDismiss);

  return () => {
    document.removeEventListener("mouseover", onPointerOver, true);
    document.removeEventListener("mouseout", onPointerOut, true);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    document.removeEventListener("scroll", onDismiss, true);
    document.removeEventListener("mousedown", onDismiss, true);
    window.removeEventListener("blur", onDismiss);
    hideTip();
    tipEl?.remove();
    tipEl = null;
  };
}
