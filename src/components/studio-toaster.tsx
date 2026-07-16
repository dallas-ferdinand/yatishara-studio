"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useMobileLayout } from "@/hooks/use-mobile-layout";

function readAppearance(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const value = document.documentElement.getAttribute("data-appearance");
  return value === "light" ? "light" : "dark";
}

/** Sit just under the studio header / mobile top chrome. */
const TOAST_TOP_OFFSET =
  "calc(var(--studio-toast-top, 52px) + env(safe-area-inset-top, 0px) + 8px)";

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
      position={isMobile ? "top-center" : "top-right"}
      richColors={false}
      closeButton
      expand={false}
      visibleToasts={3}
      gap={8}
      offset={{
        top: TOAST_TOP_OFFSET,
        right: isMobile ? 12 : 16,
        left: isMobile ? 12 : 16,
      }}
      mobileOffset={{
        top: TOAST_TOP_OFFSET,
        right: 12,
        left: 12,
      }}
      toastOptions={{
        duration: 3200,
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
