"use client";

import { Loader2, Mic, MicOff, Monitor, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  isScreenShareSaving,
  screenShareSaveLabel,
  screenShareSavePercent,
  screenShareSession,
} from "@/studio/lib/screenShareSession";

function timeLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function screenShareSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getDisplayMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function useScreenShareSnapshot() {
  return useSyncExternalStore(
    screenShareSession.subscribe,
    screenShareSession.getSnapshot,
    screenShareSession.getSnapshot,
  );
}

export function useScreenShareRecordedHandler(
  onRecorded: (file: File, durationMs: number) => void,
): void {
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  useEffect(() => {
    const handler = (file: File, durationMs: number) => {
      onRecordedRef.current(file, durationMs);
    };
    screenShareSession.setRecordedHandler(handler);
    const held = screenShareSession.consumePending();
    if (held) handler(held.file, held.durationMs);
    return () => screenShareSession.setRecordedHandler(null);
  }, []);
}

export function ScreenShareSaveStatus({
  variant,
}: {
  variant: "stage" | "overlay" | "pill";
}) {
  const snap = useScreenShareSnapshot();
  const saving = isScreenShareSaving(snap.phase);
  const [, setBeat] = useState(0);
  useEffect(() => {
    if (!saving) return;
    const id = window.setInterval(() => setBeat((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [saving, snap.phase]);
  const live = saving ? screenShareSession.getSnapshot() : snap;
  const now = Date.now();
  const label = screenShareSaveLabel(live, now);
  const percent = screenShareSavePercent(live, now);
  if (!label) return null;
  const className =
    variant === "overlay"
      ? "post-compose-save-overlay"
      : variant === "pill"
        ? "studio-screen-share-save"
        : "post-compose-save-stage";
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <Loader2 className="post-compose-spin" size={variant === "pill" ? 14 : 18} aria-hidden="true" />
      <span className="post-compose-save-label">{label}</span>
      {live.phase !== "preparing" ? (
        <span
          className="post-compose-save-track"
          aria-hidden="true"
        >
          <span
            className="post-compose-save-fill"
            style={{ width: `${percent ?? 0}%` }}
          />
        </span>
      ) : (
        <span className="post-compose-save-track is-wait" aria-hidden="true">
          <span className="post-compose-save-fill is-pulse" />
        </span>
      )}
    </div>
  );
}

export function ScreenShareRecorder({
  disabled,
  busy,
}: {
  disabled?: boolean;
  busy?: boolean;
}) {
  const snap = useScreenShareSnapshot();
  const saving = isScreenShareSaving(snap.phase);

  async function start() {
    if (!screenShareSupported()) {
      toast.error("Screen recording for Value is desktop only.");
      return;
    }
    const result = await screenShareSession.start();
    if (result === "unsupported") {
      toast.error("Screen recording for Value is desktop only.");
    } else if (result === "cancelled") {
      toast.error("Screen share was cancelled or isn’t available.");
    }
  }

  const supported = screenShareSupported();
  if (saving) return <ScreenShareSaveStatus variant="stage" />;

  return (
    <div className="post-compose-record">
      {snap.recording ? (
        <button
          type="button"
          className="post-compose-btn is-ghost"
          onClick={() => screenShareSession.stop()}
          disabled={busy}
        >
          <span className="post-compose-record-live" aria-hidden="true" />
          <Square size={14} aria-hidden="true" />
          Stop {timeLabel(snap.elapsedMs)}
        </button>
      ) : (
        <button
          type="button"
          className="post-compose-btn is-primary"
          onClick={() => void start()}
          disabled={disabled || busy || !supported}
        >
          <Monitor size={14} aria-hidden="true" />
          Record screen
        </button>
      )}
      <button
        type="button"
        className={`post-compose-record-mic${snap.includeMic ? " is-on" : ""}`}
        aria-pressed={snap.includeMic}
        aria-label={snap.includeMic ? "Microphone on" : "Microphone off"}
        disabled={snap.recording || disabled || busy}
        onClick={() => screenShareSession.setIncludeMic(!snap.includeMic)}
      >
        {snap.includeMic ? (
          <Mic size={14} aria-hidden="true" />
        ) : (
          <MicOff size={14} aria-hidden="true" />
        )}
      </button>
      {!supported ? (
        <p className="post-compose-record-hint">Desktop only — no camera.</p>
      ) : null}
    </div>
  );
}

/** Overlay on document.body — never a .studio-polish flex child. */
export function ScreenShareRecordingPill({ hidden = false }: { hidden?: boolean }) {
  const snap = useScreenShareSnapshot();
  const saving = isScreenShareSaving(snap.phase);
  if (typeof document === "undefined") return null;
  if (hidden || (!saving && !snap.recording)) return null;
  const chip = saving ? (
    <div className="studio-screen-share-pill is-saving" role="status">
      <ScreenShareSaveStatus variant="pill" />
    </div>
  ) : (
    <div className="studio-screen-share-pill" role="status">
      <span className="post-compose-record-live" aria-hidden="true" />
      <span className="studio-screen-share-pill-label">
        Rec {timeLabel(snap.elapsedMs)}
      </span>
      <button
        type="button"
        className="studio-screen-share-pill-stop"
        onClick={() => screenShareSession.stop()}
      >
        Stop
      </button>
    </div>
  );
  return createPortal(
    <div className="studio-screen-share-layer">{chip}</div>,
    document.body,
  );
}
