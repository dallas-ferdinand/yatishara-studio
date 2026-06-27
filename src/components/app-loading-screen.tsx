"use client";

import { useEffect, useState } from "react";
import { BootBackdrop } from "./boot-backdrop";
import { BrandMark } from "./brand-mark";

type Props = {
  message?: string;
};

export function AppLoadingScreen({ message = "Starting…" }: Props) {
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowRecovery(true), 4500);
    return () => window.clearTimeout(timeout);
  }, []);

  const resetHref =
    typeof window === "undefined"
      ? "/?resetDesk=1"
      : `${window.location.origin}${window.location.pathname}?resetDesk=1&clearDeskCache=1`;

  return (
    <div className="relative flex h-full flex-col bg-mos-bg">
      <BootBackdrop />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <BrandMark size={52} />
        <p
          className="mt-3 text-[13px] font-semibold tracking-[0.06em] text-mos-text-soft"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          MercuryOS
        </p>
        <div className="mos-slim-progress-track mt-5 h-1 w-32 overflow-hidden rounded-full bg-mos-border">
          <div className="mos-slim-progress h-full w-2/5 rounded-full bg-mos-accent" />
        </div>
        <p className="mt-4 text-[11px] text-mos-muted">{message}</p>
        {showRecovery ? (
          <div className="mt-5 flex max-w-[280px] flex-col items-center gap-2 text-center">
            <p className="text-[11px] leading-5 text-mos-muted">
              Still here? Your browser may be holding an old Desk bundle.
            </p>
            <a
              className="rounded-xl border border-mos-border bg-mos-panel px-4 py-2 text-[12px] font-semibold text-mos-text transition hover:border-mos-accent/50"
              href={resetHref}
            >
              Reset Desk cache
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
