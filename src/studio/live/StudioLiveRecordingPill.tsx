"use client";

import { Check, Loader2, Square } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { StudioFloatingOverlay } from "@/studio/components/StudioFloatingOverlay";
import { liveMixerSession } from "./liveMixerSession";

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StudioLiveRecordingPill() {
  const snap = useSyncExternalStore(
    liveMixerSession.subscribe,
    liveMixerSession.getSnapshot,
    liveMixerSession.getSnapshot,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = snap.previewStream;
    if (snap.previewStream) void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [snap.previewStream]);

  if (typeof document === "undefined") return null;
  if (!snap.mounted || snap.tabActive) return null;

  const recLabel = snap.saving
    ? "Saving…"
    : snap.recording
      ? formatClock(snap.elapsedMs)
      : snap.savedFlash
        ? "Saved"
        : "Rec";
  const recTitle = snap.saving
    ? "Saving recording"
    : snap.recording
      ? "Stop recording"
      : "Record";

  return (
    <StudioFloatingOverlay corner="bottom-right" label="Record preview" zIndex={123}>
      <div
        className="studio-live-pip"
        style={{ "--pip-ar": String(snap.previewAr) } as CSSProperties}
      >
        <button
          type="button"
          className="studio-live-pip-preview"
          aria-label="Open Record"
          title="Open Record"
          onClick={() => liveMixerSession.openTab()}
        >
          <video ref={videoRef} muted playsInline autoPlay />
        </button>
        <div className="studio-live-pip-bar">
          <button
            type="button"
            className={`studio-live-rec${snap.recording ? " is-on" : ""}${snap.saving ? " is-saving" : ""}${snap.savedFlash ? " is-saved" : ""}`}
            disabled={
              snap.saving ||
              snap.savedFlash ||
              (!snap.recording && !snap.canStart)
            }
            aria-label={recTitle}
            aria-busy={snap.saving}
            title={recTitle}
            onClick={() => liveMixerSession.toggle()}
          >
            {snap.saving ? (
              <Loader2 className="studio-live-rec-spin" size={12} aria-hidden="true" />
            ) : snap.recording ? (
              <Square size={10} aria-hidden="true" />
            ) : snap.savedFlash ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <span className="studio-live-rec-dot" aria-hidden="true" />
            )}
            <span className="studio-live-rec-label">{recLabel}</span>
          </button>
        </div>
      </div>
    </StudioFloatingOverlay>
  );
}
