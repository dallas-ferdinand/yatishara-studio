"use client";

import { useCallback, useEffect, useState } from "react";

/** Shared mobile layout breakpoint for the desk PWA. */
export const MOBILE_BREAKPOINT = 900;

/** 0 = Agent, 1 = Files, 2 = Editor */
export type MobileTab = 0 | 1 | 2;

const TAB_KEY = "desk2-mobile-tab";

export function loadMobileTab(): MobileTab {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(TAB_KEY);
  const n = raw == null ? 0 : Number(raw);
  if (n === 1 || n === 2) return n;
  return 0;
}

export function saveMobileTab(tab: MobileTab) {
  try {
    sessionStorage.setItem(TAB_KEY, String(tab));
  } catch {
    /* ignore */
  }
}

function readIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
}

export function useMobileLayout() {
  // Initialize from the viewport on the client so the first paint matches mobile
  // chrome instead of flashing desktop structure after hydration.
  const [isMobile, setIsMobile] = useState(readIsMobile);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onMq = () => setIsMobile(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setKeyboardOpen(false);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const threshold = 80;
    const baseline = window.innerHeight;

    const onResize = () => {
      setKeyboardOpen(baseline - vv.height > threshold);
    };

    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [isMobile]);

  const onComposerFocus = useCallback(() => {
    if (isMobile) setKeyboardOpen(true);
  }, [isMobile]);

  const onComposerBlur = useCallback(() => {
    if (!isMobile) return;
    window.setTimeout(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement &&
        active.closest(".cursor-composer")
      ) {
        return;
      }
      const vv = window.visualViewport;
      const open = vv ? window.innerHeight - vv.height > 80 : false;
      setKeyboardOpen(open);
    }, 120);
  }, [isMobile]);

  return { isMobile, keyboardOpen, onComposerFocus, onComposerBlur };
}
