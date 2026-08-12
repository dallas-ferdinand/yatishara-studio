/**
 * Script / doc prompt fences: max-height + internal scroll only after click.
 * Hover must not steal wheel from the page — same idea as chat flow-shell terminals.
 */

const SHELL_SELECTOR = ".mos-code, .code-shell";

/** @param {HTMLElement} host */
function scrollSurface(host) {
  return (
    host.querySelector(".mos-code-body, pre.code-block, pre") ?? host
  );
}

/** @param {HTMLElement} el @param {number} deltaY */
function canScrollInternally(el, deltaY) {
  if (!el || el.scrollHeight <= el.clientHeight + 1) return false;
  if (deltaY < 0) return el.scrollTop > 0;
  if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  return false;
}

/**
 * @param {HTMLElement} scrollRoot - `.cursor-doc-scroll` (page scroller)
 * @returns {() => void}
 */
export function mountDocCodeScrollFocus(scrollRoot) {
  if (!scrollRoot || scrollRoot.dataset.docCodeScrollMounted === "1") {
    return () => {};
  }
  scrollRoot.dataset.docCodeScrollMounted = "1";

  /** @type {HTMLElement | null} */
  let activeHost = null;

  const clearActive = () => {
    if (!activeHost) return;
    activeHost.classList.remove("is-scroll-active");
    activeHost = null;
  };

  /** @param {HTMLElement} host */
  const setActive = (host) => {
    if (activeHost === host) return;
    if (activeHost) activeHost.classList.remove("is-scroll-active");
    activeHost = host;
    host.classList.add("is-scroll-active");
    if (!host.hasAttribute("tabindex")) host.setAttribute("tabindex", "-1");
  };

  const onWheel = (e) => {
    const host =
      e.target instanceof Element ? e.target.closest(SHELL_SELECTOR) : null;
    if (!(host instanceof HTMLElement) || !scrollRoot.contains(host)) return;

    if (!host.classList.contains("is-scroll-active")) {
      // Pass scroll to the doc page — never let the fence eat the wheel on hover.
      e.preventDefault();
      scrollRoot.scrollTop += e.deltaY;
      return;
    }

    const surface = scrollSurface(host);
    if (canScrollInternally(surface, e.deltaY)) return;

    e.preventDefault();
    scrollRoot.scrollTop += e.deltaY;
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const host =
      e.target instanceof Element ? e.target.closest(SHELL_SELECTOR) : null;
    if (!(host instanceof HTMLElement) || !scrollRoot.contains(host)) {
      clearActive();
      return;
    }
    setActive(host);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") clearActive();
  };

  const onDocPointerDown = (e) => {
    if (!activeHost) return;
    if (!(e.target instanceof Node)) return;
    if (activeHost.contains(e.target)) return;
    clearActive();
  };

  scrollRoot.addEventListener("wheel", onWheel, { passive: false, capture: true });
  scrollRoot.addEventListener("pointerdown", onPointerDown, true);
  scrollRoot.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onDocPointerDown, true);

  return () => {
    scrollRoot.removeAttribute("data-doc-code-scroll-mounted");
    scrollRoot.removeEventListener("wheel", onWheel, true);
    scrollRoot.removeEventListener("pointerdown", onPointerDown, true);
    scrollRoot.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    clearActive();
  };
}
