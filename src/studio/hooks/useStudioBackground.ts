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
            || mutation.attributeName === "data-appearance"
            || mutation.attributeName === "data-wallpaper-kind"
            || mutation.attributeName === "data-wallpaper-asset-id",
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
        "data-wallpaper-kind",
        "data-wallpaper-asset-id",
      ],
    });
    window.addEventListener("mercuryos-theme-change", onChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("mercuryos-theme-change", onChange);
    };
  }, []);
}
