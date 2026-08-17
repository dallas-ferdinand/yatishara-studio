"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useMobileLayout } from "@/hooks/use-mobile-layout";

function readAppearance(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const value = document.documentElement.getAttribute("data-appearance");
  return value === "light" ? "light" : "dark";
}

/** Sit under studio header — desktop top-right. */
const DESKTOP_TOP_OFFSET =
  "calc(var(--studio-toast-top, 52px) + env(safe-area-inset-top, 0px) + 10px)";

const MOBILE_TOP_FALLBACK =
  "calc(var(--studio-mobile-top-chrome, calc(42px + env(safe-area-inset-top, 0px))) + 8px)";

const TOP_CHROME_SELECTOR = [
  ".studio-fullscreen-status",
  ".cursor-workspace-head",
  ".cursor-panel-head",
  ".cursor-sidebar-head",
  ".studio-folder-pathbar",
  ".studio-cn-secondary-head",
  ".studio-academy-course-head",
].join(", ");

const SKIP_CHROME_CLOSEST = [
  "[data-sonner-toaster]",
  ".studio-mobile-bottom-nav",
  ".studio-history-mobile-sheet",
  ".studio-mobile-app-menu-sheet",
  ".profile-comments-sheet",
  ".studio-cn-book-sheet",
  ".studio-files-nav-mobile-sheet",
  ".studio-explorer-context-sheet",
].join(", ");

function measureMobileToastTop(): string {
  if (typeof document === "undefined") return MOBILE_TOP_FALLBACK;
  const visual = window.visualViewport;
  const viewTop = visual?.offsetTop ?? 0;
  const viewH = visual?.height ?? window.innerHeight;
  const nodes = document.querySelectorAll(TOP_CHROME_SELECTOR);
  let bottom = 0;
  const maxTop = viewTop + Math.min(168, viewH * 0.36);
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest(SKIP_CHROME_CLOSEST)) continue;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (Number(style.opacity) === 0) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 24 || rect.height > 96) continue;
    if (rect.top > maxTop) continue;
    if (rect.bottom > viewTop + viewH * 0.45) continue;
    if (rect.bottom > bottom) bottom = rect.bottom;
  }
  if (bottom < viewTop + 24) return MOBILE_TOP_FALLBACK;
  const top = Math.round(bottom + 8);
  const cap = Math.round(viewTop + Math.min(176, viewH * 0.38));
  return `${Math.min(top, cap)}px`;
}

function useMobileToastTop(isMobile: boolean): string {
  const [top, setTop] = useState(isMobile ? MOBILE_TOP_FALLBACK : DESKTOP_TOP_OFFSET);

  useEffect(() => {
    if (!isMobile) {
      setTop(DESKTOP_TOP_OFFSET);
      return;
    }

    let frame = 0;
    let timer = 0;
    const applyNow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTop(measureMobileToastTop()));
    };
    const apply = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(applyNow, 48);
    };

    applyNow();
    const polish = document.querySelector(".studio-polish") ?? document.body;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(document.documentElement);
    if (polish instanceof Element) ro?.observe(polish);
    const mo = new MutationObserver(apply);
    mo.observe(polish, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
    };
  }, [isMobile]);

  return top;
}

export function StudioToaster() {
  const { isMobile } = useMobileLayout();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const toastTop = useMobileToastTop(isMobile);

  useEffect(() => {
    const sync = () => setTheme(readAppearance());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-appearance"],
    });
    return () => observer.disconnect();
  }, []);

  const edge = isMobile
    ? { top: toastTop, right: 12, left: 12 }
    : { top: DESKTOP_TOP_OFFSET, right: 14, left: 14 };

  return (
    <Toaster
      theme={theme}
      position={isMobile ? "top-center" : "top-right"}
      richColors={false}
      // Sonner's default close sits outside the card as a floating X — drop it.
      // Auto-dismiss (+ swipe on mobile) is enough.
      closeButton={false}
      expand={false}
      visibleToasts={isMobile ? 2 : 3}
      gap={isMobile ? 8 : 8}
      offset={edge}
      mobileOffset={edge}
      toastOptions={{
        duration: isMobile ? 2600 : 3000,
        classNames: {
          toast: "studio-sonner-toast",
          title: "studio-sonner-title",
          description: "studio-sonner-description",
          success: "studio-sonner-success",
          error: "studio-sonner-error",
          info: "studio-sonner-info",
          warning: "studio-sonner-warning",
        },
      }}
    />
  );
}
