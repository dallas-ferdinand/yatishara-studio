"use client";

import { useEffect, useState } from "react";
import {
  applyStudioUpdate,
  startStudioUpdatePoll,
  stopStudioUpdatePoll,
  type StudioUpdateOffer,
} from "@/studio/lib/studio-web-update";

/**
 * Full-width top banner when /version.json reports a newer deploy than this tab.
 * Click → soft update (keep tabs/prefs, drop SW/caches, reload shell).
 */
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
        void applyStudioUpdate(offer.buildId);
      }}
    >
      <span className="studio-update-banner-label">
        {applying ? "Updating…" : "Click to update"}
      </span>
      <span className="studio-update-banner-meta">New Studio build ready</span>
      <style jsx>{`
        .studio-update-banner {
          position: relative;
          z-index: 2147482000;
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
          margin: 0;
          border: 0;
          border-bottom: 1px solid color-mix(in srgb, var(--cursor-accent, #c9a227) 35%, transparent);
          padding: max(8px, env(safe-area-inset-top, 0px)) 16px 8px;
          background: color-mix(in srgb, var(--cursor-accent, #c9a227) 18%, var(--mos-plate, #ececf0));
          color: var(--color-cursor-text, inherit);
          font: inherit;
          font-size: 13px;
          line-height: 1.3;
          cursor: pointer;
          text-align: center;
        }
        .studio-update-banner:hover:not(:disabled) {
          background: color-mix(in srgb, var(--cursor-accent, #c9a227) 28%, var(--mos-plate-strong, #d4d4da));
        }
        .studio-update-banner:disabled {
          opacity: 0.85;
          cursor: wait;
        }
        .studio-update-banner-label {
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .studio-update-banner-meta {
          opacity: 0.72;
          font-size: 12px;
        }
      `}</style>
    </button>
  );
}
