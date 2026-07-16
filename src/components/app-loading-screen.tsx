"use client";

import { useEffect, useState } from "react";
import { StudioBootLoader } from "./studio-boot-loader";

type Props = {
  message?: string;
};

export function AppLoadingScreen({ message: _message }: Props) {
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowRecovery(true), 4500);
    return () => window.clearTimeout(timeout);
  }, []);

  const resetHref =
    typeof window === "undefined"
      ? "/?resetStudio=1"
      : `${window.location.origin}${window.location.pathname}?resetStudio=1&clearStudioCache=1`;

  return (
    <StudioBootLoader
      recovery={
        showRecovery ? (
          <div className="mt-6 flex max-w-[280px] flex-col items-center gap-2 text-center">
            <p className="text-[11px] leading-5 opacity-60">
              Still here? Your browser may be holding an old Studio bundle.
            </p>
            <a
              className="rounded-xl border border-current/15 px-4 py-2 text-[12px] font-semibold opacity-80 transition hover:opacity-100"
              href={resetHref}
            >
              Reset Studio cache
            </a>
          </div>
        ) : null
      }
    />
  );
}
