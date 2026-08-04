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
const TOAST_TOP_OFFSET =
  "calc(var(--studio-toast-top, 52px) + env(safe-area-inset-top, 0px) + 10px)";

/** Sit above mobile bottom nav + home indicator. */
const TOAST_BOTTOM_OFFSET =
  "calc(var(--studio-mobile-bottom-chrome, calc(38px + env(safe-area-inset-bottom, 0px))) + 10px)";

export function StudioToaster() {
  const { isMobile } = useMobileLayout();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

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

  return (
    <Toaster
      theme={theme}
      position={isMobile ? "bottom-center" : "top-right"}
      richColors={false}
      // Sonner's default close sits outside the card as a floating X — drop it.
      // Auto-dismiss (+ swipe on mobile) is enough.
      closeButton={false}
      expand={false}
      visibleToasts={isMobile ? 2 : 3}
      gap={isMobile ? 8 : 8}
      offset={
        isMobile
          ? {
              bottom: TOAST_BOTTOM_OFFSET,
              right: 12,
              left: 12,
            }
          : {
              top: TOAST_TOP_OFFSET,
              right: 14,
              left: 14,
            }
      }
      mobileOffset={{
        bottom: TOAST_BOTTOM_OFFSET,
        right: 12,
        left: 12,
      }}
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
