/**
 * Mobile browser/gesture Back should dismiss Studio overlays before navigating.
 * History entries are breadcrumbs; the live stack lives in this module so
 * URL replaceState({}) cleanup cannot wipe identity.
 */

export const YS_OVERLAY_STATE_KEY = "__ysOverlay";

type CloseFn = () => void;

type StackEntry = {
  id: string;
  close: CloseFn;
};

function createMobileBackStack() {
  const stack: StackEntry[] = [];
  let suppressCount = 0;
  let bindCount = 0;

  function onPopState() {
    if (suppressCount > 0) {
      suppressCount -= 1;
      return;
    }
    const top = stack.pop();
    if (!top) return;
    // Balance ensureListener from push.
    releaseListener();
    try {
      top.close();
    } catch {
      /* ignore close errors */
    }
  }

  function ensureListener() {
    if (typeof window === "undefined") return;
    if (bindCount === 0) {
      window.addEventListener("popstate", onPopState);
    }
    bindCount += 1;
  }

  function releaseListener() {
    if (typeof window === "undefined") return;
    if (bindCount <= 0) return;
    bindCount -= 1;
    if (bindCount === 0) {
      window.removeEventListener("popstate", onPopState);
    }
  }

  /** Ref-counted popstate listener. Safe to call from Host + open layers. */
  function bind() {
    if (typeof window === "undefined") return () => {};
    ensureListener();
    return () => releaseListener();
  }

  function push(id: string, close: CloseFn) {
    if (typeof window === "undefined") return;
    const existing = stack.find((entry) => entry.id === id);
    if (existing) {
      existing.close = close;
      return;
    }
    // Auto-bind so Back works even if Host isn't mounted (public CN pages).
    ensureListener();
    stack.push({ id, close });
    const prev =
      window.history.state && typeof window.history.state === "object"
        ? (window.history.state as Record<string, unknown>)
        : {};
    window.history.pushState(
      { ...prev, [YS_OVERLAY_STATE_KEY]: id },
      "",
    );
  }

  /**
   * Drop a layer when UI/Escape closes it. If it is buried, also drop layers
   * above it and rewind history by that many entries (without re-running close).
   * Skip rewind when the browser already popped this overlay (swipe-back / gesture)
   * so we do not walk off the Studio page.
   */
  function release(id: string) {
    if (typeof window === "undefined") return;
    const idx = stack.findIndex((entry) => entry.id === id);
    if (idx < 0) return;
    const top = stack[stack.length - 1];
    const removeCount = stack.length - idx;
    const raw = window.history.state;
    const stateId =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)[YS_OVERLAY_STATE_KEY]
        : null;
    const shouldRewind =
      typeof stateId === "string" &&
      (stateId === id || stateId === top?.id || stack.some((entry) => entry.id === stateId));
    stack.splice(idx);
    // One ensureListener per successful push — release one per removed entry.
    for (let i = 0; i < removeCount; i += 1) releaseListener();
    if (removeCount <= 0 || !shouldRewind) return;
    suppressCount += removeCount;
    window.history.go(-removeCount);
  }

  /** Leave mobile: clear stack and rewind overlay history entries. */
  function dismissAll() {
    if (typeof window === "undefined") return;
    const removeCount = stack.length;
    stack.length = 0;
    for (let i = 0; i < removeCount; i += 1) releaseListener();
    if (removeCount <= 0) return;
    suppressCount += removeCount;
    window.history.go(-removeCount);
  }

  function has(id: string) {
    return stack.some((entry) => entry.id === id);
  }

  function depth() {
    return stack.length;
  }

  return {
    bind,
    push,
    release,
    dismissAll,
    has,
    depth,
  };
}

export const mobileBackStack = createMobileBackStack();
