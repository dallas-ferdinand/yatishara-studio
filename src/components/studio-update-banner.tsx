"use client";

import { useEffect, useState } from "react";
import {
  applyStudioUpdate,
  dismissStudioUpdate,
  startStudioUpdatePoll,
  stopStudioUpdatePoll,
  type StudioUpdateOffer,
} from "@/studio/lib/studio-web-update";

/** 32px chrome head when a newer deploy is live. Update keeps tabs. */
export function StudioUpdateBanner() {
  const [offer, setOffer] = useState<StudioUpdateOffer | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    startStudioUpdatePoll((next) => setOffer(next));
    return () => stopStudioUpdatePoll();
  }, []);

  if (!offer) return null;

  return (
    <div className="studio-update-banner" role="status" aria-live="polite">
      <button
        type="button"
        className="studio-update-banner-btn studio-update-banner-btn-primary"
        disabled={applying}
        onClick={() => {
          if (applying) return;
          setApplying(true);
          void applyStudioUpdate(offer.buildId);
        }}
      >
        {applying ? "…" : "Update"}
      </button>
      <button
        type="button"
        className="studio-update-banner-btn"
        disabled={applying}
        onClick={() => {
          dismissStudioUpdate(offer.buildId);
          setOffer(null);
        }}
      >
        Dismiss
      </button>
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
          gap: 6px;
          height: calc(var(--cursor-head-h, 32px) + env(safe-area-inset-top, 0px));
          min-height: calc(var(--cursor-head-h, 32px) + env(safe-area-inset-top, 0px));
          max-height: calc(var(--cursor-head-h, 32px) + env(safe-area-inset-top, 0px));
          margin: 0;
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
          line-height: 1;
          white-space: nowrap;
        }
        .studio-update-banner-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          margin: 0;
          border: 1px solid var(--color-cursor-border-soft, transparent);
          border-radius: 6px;
          padding: 0 10px;
          background: var(--mos-plate-strong, #d4d4da);
          color: inherit;
          font: inherit;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .studio-update-banner-btn:hover:not(:disabled) {
          background: var(--mos-hover, var(--color-cursor-hover));
        }
        .studio-update-banner-btn-primary {
          border-color: color-mix(in srgb, var(--cursor-accent, #c9a227) 40%, transparent);
          background: color-mix(
            in srgb,
            var(--cursor-accent, #c9a227) 28%,
            var(--mos-plate-strong, #d4d4da)
          );
        }
        .studio-update-banner-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
      `}</style>
    </div>
  );
}
