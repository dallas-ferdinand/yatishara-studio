"use client";

import { useEffect, useState } from "react";
import {
  applyStudioUpdate,
  dismissStudioUpdate,
  startStudioUpdatePoll,
  stopStudioUpdatePoll,
  type StudioUpdateOffer,
} from "@/studio/lib/studio-web-update";

/**
 * Full-width top banner when /version.json reports a newer deploy than this tab.
 * Update → soft reload (keep tabs). Dismiss → hide until the next build.
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
    <div className="studio-update-banner" role="status" aria-live="polite">
      <span className="studio-update-banner-copy">
        <span className="studio-update-banner-label">New Studio build ready</span>
        <span className="studio-update-banner-meta">Update keeps your open tabs</span>
      </span>
      <span className="studio-update-banner-actions">
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
          {applying ? "Updating…" : "Update"}
        </button>
        <button
          type="button"
          className="studio-update-banner-btn"
          disabled={applying}
          onClick={(event) => {
            event.stopPropagation();
            dismissStudioUpdate(offer.buildId);
            setOffer(null);
          }}
        >
          Dismiss
        </button>
      </span>
      <style jsx>{`
        .studio-update-banner {
          position: relative;
          z-index: 2147482000;
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          margin: 0;
          border-bottom: 1px solid
            color-mix(in srgb, var(--cursor-accent, #c9a227) 35%, transparent);
          padding: max(8px, env(safe-area-inset-top, 0px)) 16px 8px;
          background: color-mix(
            in srgb,
            var(--cursor-accent, #c9a227) 18%,
            var(--mos-plate, #ececf0)
          );
          color: var(--color-cursor-text, inherit);
          font: inherit;
          font-size: 13px;
          line-height: 1.3;
          text-align: center;
        }
        .studio-update-banner-copy {
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .studio-update-banner-label {
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .studio-update-banner-meta {
          opacity: 0.72;
          font-size: 12px;
        }
        .studio-update-banner-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .studio-update-banner-btn {
          margin: 0;
          border: 1px solid
            color-mix(in srgb, var(--cursor-accent, #c9a227) 28%, var(--color-cursor-border-soft, transparent));
          border-radius: 8px;
          padding: 5px 12px;
          background: var(--mos-plate-strong, #d4d4da);
          color: inherit;
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .studio-update-banner-btn:hover:not(:disabled) {
          background: color-mix(
            in srgb,
            var(--cursor-accent, #c9a227) 22%,
            var(--mos-plate-strong, #d4d4da)
          );
        }
        .studio-update-banner-btn-primary {
          border-color: color-mix(in srgb, var(--cursor-accent, #c9a227) 45%, transparent);
          background: color-mix(
            in srgb,
            var(--cursor-accent, #c9a227) 32%,
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
