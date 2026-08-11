"use client";

import { useEffect, useRef, useState } from "react";
import { useMercuryLogoAssets } from "@/lib/use-appearance-mode";
import { playUiSound } from "@/mos-app/sounds.js";
import { randomizeStudioAppearance } from "@/mos-app/theme.js";

/** Centered Yatishara logo mark — same empty-state chip as Create / workspace empty. */
export function StudioEmptyLogoButton() {
  const emptyLogo = useMercuryLogoAssets(96);
  const [pressed, setPressed] = useState(false);
  const pressStartedRef = useRef(0);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MIN_PRESS_MS = 120;

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    };
  }, []);

  function beginPress() {
    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    pressStartedRef.current = performance.now();
    setPressed(true);
  }

  function scheduleRelease() {
    const elapsed = performance.now() - pressStartedRef.current;
    const remain = Math.max(0, MIN_PRESS_MS - elapsed);
    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      setPressed(false);
    }, remain);
  }

  function shuffleTheme() {
    playUiSound("shuffle");
    try {
      navigator.vibrate?.(12);
    } catch {
      /* best-effort */
    }
    randomizeStudioAppearance();
  }

  return (
    <div className="studio-empty-logo-wrap">
      <button
        type="button"
        className={`studio-empty-logo-btn${pressed ? " is-pressed" : ""}`}
        aria-label="Shuffle background style, theme, and appearance"
        title="Shuffle style"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          beginPress();
        }}
        onPointerUp={scheduleRelease}
        onPointerLeave={scheduleRelease}
        onPointerCancel={scheduleRelease}
        onClick={shuffleTheme}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            beginPress();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            scheduleRelease();
          }
        }}
      >
        <span className="studio-empty-logo" aria-hidden="true">
          <span className="studio-empty-logo-blur" aria-hidden="true" />
          <img
            src={emptyLogo.src}
            srcSet={emptyLogo.srcSet}
            sizes={emptyLogo.sizes}
            alt=""
            width={104}
            height={104}
            draggable={false}
          />
        </span>
      </button>
    </div>
  );
}
