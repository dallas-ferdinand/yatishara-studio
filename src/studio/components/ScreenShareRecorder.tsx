"use client";

import { useAction, useMutation } from "convex/react";
import { Loader2, Mic, MicOff, Monitor, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
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

export function useScreenShareSnapshot() {
  return useSyncExternalStore(
    screenShareSession.subscribe,
    screenShareSession.getSnapshot,
    screenShareSession.getSnapshot,
  );
}

export async function startScreenShareRecording(): Promise<boolean> {
  if (!screenShareSupported()) {
    toast.error("This browser can’t capture the screen. Chrome on Android can.");
    return false;
  }
  const result = await screenShareSession.start();
  if (result === "unsupported") {
    toast.error("This browser can’t capture the screen. Chrome on Android can.");
    return false;
  }
  if (result === "cancelled") {
    toast.error("Screen share was cancelled or isn’t available.");
    return false;
  }
  return true;
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
    const unsub = screenShareSession.addRecordedHandler(handler);
    const held = screenShareSession.consumePending();
    if (held) handler(held.file, held.durationMs);
    return unsub;
  }, []);
}

/** Always-on save to Screen Recordings. Compose overlays this when a post is open. */
export function useScreenShareLibraryBackup(): void {
  const ensureScreenRecordings = useMutation(
    api.folders.ensureScreenRecordingsFolderForMe,
  );
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);

  const save = useCallback(
    async (file: File) => {
      try {
        const folderId = await ensureScreenRecordings({});
        screenShareSession.setSaveProgress(0, file.size);
        await uploadStudioAsset({
          file,
          folderId,
          kind: "video",
          name: file.name,
          reserveUpload,
          commitStagingUpload,
          onProgress: (loaded, total) =>
            screenShareSession.setSaveProgress(loaded, total),
          onCommitting: () => screenShareSession.beginFinishing(),
        });
        toast.success("Saved to Screen Recordings");
      } catch (error) {
        toast.error(friendlyConvexError(error, "Could not save recording"));
      } finally {
        screenShareSession.clearSave();
      }
    },
    [commitStagingUpload, ensureScreenRecordings, reserveUpload],
  );

  useScreenShareRecordedHandler((file) => {
    void save(file);
  });
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
  compact = false,
}: {
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
}) {
  const snap = useScreenShareSnapshot();
  const saving = isScreenShareSaving(snap.phase);

  async function start() {
    await startScreenShareRecording();
  }

  const supported = screenShareSupported();
  if (saving) return <ScreenShareSaveStatus variant={compact ? "pill" : "stage"} />;

  return (
    <div className={`post-compose-record${compact ? " is-compact" : ""}`}>
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
          disabled={disabled || busy}
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
      {!supported && !compact ? (
        <p className="post-compose-record-hint">
          Screen capture needs Chrome on Android, or a computer.
        </p>
      ) : null}
    </div>
  );
}

/** Overlay on document.body — never a .studio-polish flex child. */
export function ScreenShareRecordingPill() {
  const snap = useScreenShareSnapshot();
  const saving = isScreenShareSaving(snap.phase);
  if (typeof document === "undefined") return null;
  const open = snap.panelOpen || snap.recording || saving;
  if (!open || snap.stageControls) return null;
  const chip = saving ? (
    <div className="studio-screen-share-pill is-saving" role="status">
      <ScreenShareSaveStatus variant="pill" />
    </div>
  ) : (
    <div className="studio-screen-share-pill is-controls" role="region" aria-label="Screen recording">
      <ScreenShareRecorder compact />
      {snap.recording ? null : (
        <button
          type="button"
          className="studio-screen-share-pill-close"
          aria-label="Hide recorder"
          onClick={() => screenShareSession.disarmPanel()}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
  return createPortal(
    <div className="studio-screen-share-layer">{chip}</div>,
    document.body,
  );
}
