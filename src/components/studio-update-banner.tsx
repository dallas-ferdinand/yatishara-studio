"use client";

import { useEffect, useState } from "react";
import {
  applyStudioUpdate,
  startStudioUpdatePoll,
  stopStudioUpdatePoll,
  type StudioUpdateOffer,
} from "@/studio/lib/studio-web-update";

/** 32px chrome head — click anywhere to soft-reload. */
export function StudioUpdateBanner() {
  const [offer, setOffer] = useState<StudioUpdateOffer | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    startStudioUpdatePoll((next) => setOffer(next));
    return () => stopStudioUpdatePoll();
  }, []);

  if (!offer) return null;

  return (
    <button
      type="button"
      className="studio-update-banner"
      disabled={applying}
      aria-live="polite"
      onClick={() => {
        if (applying) return;
        setApplying(true);
        void applyStudioUpdate(offer.buildId).finally(() => {
          // Reload should unload this tab; if purge hung past the timeout
          // and navigation failed, unlock so Dallas can click again.
          window.setTimeout(() => setApplying(false), 4000);
        });
      }}
    >
      {applying ? "Updating…" : "Update"}
      <style jsx>{`
        .studio-update-banner {
          box-sizing: border-box;
          position: relative;
          z-index: 2147482000;
          display: flex;
          width: 100%;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          height: calc(var(--cursor-head-h, 32px) + env(safe-area-inset-top, 0px));
          min-height: calc(var(--cursor-head-h, 32px) + env(safe-area-inset-top, 0px));
          max-height: calc(var(--cursor-head-h, 32px) + env(safe-area-inset-top, 0px));
          margin: 0;
          border: 0;
          border-bottom: 1px solid var(--studio-chrome-divider, var(--color-cursor-border-soft));
          padding: env(safe-area-inset-top, 0px) 8px 0;
          background: color-mix(
            in srgb,
            var(--cursor-accent, #c9a227) 14%,
            var(--mos-plate, #ececf0)
          );
          color: var(--color-cursor-text, inherit);
          font: inherit;
          font-size: 12px;
          font-weight: 650;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
        }
        .studio-update-banner:hover:not(:disabled) {
          background: color-mix(
            in srgb,
            var(--cursor-accent, #c9a227) 22%,
            var(--mos-plate, #ececf0)
          );
        }
        .studio-update-banner:disabled {
          cursor: wait;
          opacity: 0.8;
        }
      `}</style>
    </button>
  );
}
