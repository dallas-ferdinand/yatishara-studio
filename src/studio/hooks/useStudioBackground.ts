import { useEffect } from "react";
import { applyStudioBackgroundNow } from "@/studio/lib/studio-background-apply";

export function useStudioBackground() {
  if (typeof window !== "undefined") {
    applyStudioBackgroundNow();
  }

  useEffect(() => {
    applyStudioBackgroundNow();

    const onChange = () => applyStudioBackgroundNow();
    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.attributeName === "data-theme"
            || mutation.attributeName === "data-studio-bg-family"
            || mutation.attributeName === "data-studio-bg-pack"
            || mutation.attributeName === "data-appearance",
        )
      ) {
        onChange();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "data-theme",
        "data-studio-bg-family",
        "data-studio-bg-pack",
        "data-appearance",
      ],
    });
    window.addEventListener("mercuryos-theme-change", onChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("mercuryos-theme-change", onChange);
    };
  }, []);
}
