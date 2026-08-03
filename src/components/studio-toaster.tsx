"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useMobileLayout } from "@/hooks/use-mobile-layout";

function readAppearance(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const value = document.documentElement.getAttribute("data-appearance");
  return value === "light" ? "light" : "dark";
}

/** Sit just under the studio header on desktop. */
const TOAST_TOP_OFFSET =
  "calc(var(--studio-toast-top, 52px) + env(safe-area-inset-top, 0px) + 8px)";

/** Sit above mobile bottom nav + home indicator. */
const TOAST_BOTTOM_OFFSET =
  "calc(var(--studio-mobile-nav-height, 44px) + env(safe-area-inset-bottom, 0px) + 12px)";

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
      closeButton={!isMobile}
      expand={false}
      visibleToasts={isMobile ? 2 : 3}
      gap={isMobile ? 6 : 8}
      offset={
        isMobile
          ? {
              bottom: TOAST_BOTTOM_OFFSET,
              right: 14,
              left: 14,
            }
          : {
              top: TOAST_TOP_OFFSET,
              right: 16,
              left: 16,
            }
      }
      mobileOffset={{
        bottom: TOAST_BOTTOM_OFFSET,
        right: 14,
        left: 14,
      }}
      toastOptions={{
        duration: isMobile ? 2800 : 3200,
        classNames: {
          toast: "studio-sonner-toast",
          title: "studio-sonner-title",
          description: "studio-sonner-description",
          closeButton: "studio-sonner-close",
          success: "studio-sonner-success",
          error: "studio-sonner-error",
          info: "studio-sonner-info",
          warning: "studio-sonner-warning",
        },
      }}
    />
  );
}
