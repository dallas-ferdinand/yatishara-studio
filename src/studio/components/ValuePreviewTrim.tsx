"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Pause, Play } from "lucide-react";
import { clampHelpPreviewRange } from "../../../convex/lib/helpAnswer";
import {
  clampPlayheadToPreview,
  clampMsToPreview,
  filmEndCovered,
  movePreviewWindow,
  msAtClientX,
  playheadPercent,
  rangePercents,
  timeLabel,
  togglePreviewPlayback,
} from "@/studio/lib/valuePreviewTrim";

const FRAME_COUNT = 12;

async function captureFilmstrip(src: string, durationMs: number): Promise<string[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  if (!src.startsWith("blob:")) video.crossOrigin = "anonymous";
  video.src = src;
  await new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error("video"));
    const timer = window.setTimeout(fail, 10_000);
    const ready = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.addEventListener("loadedmetadata", ready, { once: true });
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
  const durationSec = Math.max(
    0.2,
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : durationMs / 1000,
  );
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const frames: string[] = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const t = ((i + 0.5) / FRAME_COUNT) * durationSec;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("seeked", done);
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(done, 900);
      video.addEventListener("seeked", done);
      try {
        video.currentTime = Math.min(durationSec - 0.05, Math.max(0, t));
      } catch {
        done();
      }
    });
    const vw = video.videoWidth || 160;
    const vh = video.videoHeight || 90;
    const scale = Math.min(1, 72 / vw);
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      frames.push(canvas.toDataURL("image/jpeg", 0.55));
    } catch {
      break;
    }
  }
  video.removeAttribute("src");
  video.load();
  return frames;
}

export function ValuePreviewTrim({
  durationMs,
  startMs,
  endMs,
  src,
  videoRef,
  onChange,
}: {
  durationMs: number;
  startMs: number;
  endMs: number;
  src?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onChange: (startMs: number, endMs: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<"start" | "end" | "window" | "seek" | "playhead" | null>(null);
  const originRef = useRef({ startMs, endMs, x: 0, playheadMs: 0 });
  const movedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(startMs);
  const [frames, setFrames] = useState<string[]>([]);
  const [scrubbing, setScrubbing] = useState(false);
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => setTrackW(el.clientWidth);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!src || durationMs <= 0) {
      setFrames([]);
      return;
    }
    let cancelled = false;
    void captureFilmstrip(src, durationMs)
      .then((next) => {
        if (!cancelled) setFrames(next);
      })
      .catch(() => {
        if (!cancelled) setFrames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [src, durationMs]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    const onTime = () => {
      if (dragRef.current === "playhead") return;
      const ms = video.currentTime * 1000;
      setPlayheadMs(ms);
      if (!video.paused && clampPlayheadToPreview(ms, startMs, endMs) === "ended") {
        video.pause();
        setPlaying(false);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [videoRef, startMs, endMs]);

  const seekVideo = useCallback(
    (ms: number, pause = true) => {
      const video = videoRef?.current;
      const at = Math.max(0, Math.min(durationMs, ms));
      setPlayheadMs(at);
      if (!video) return;
      video.currentTime = at / 1000;
      if (pause && !video.paused) video.pause();
    },
    [durationMs, videoRef],
  );

  const applyFromClientX = useCallback(
    (clientX: number, mode: "start" | "end" | "window" | "seek" | "playhead") => {
      const track = trackRef.current;
      if (!track || durationMs <= 0) return;
      const rect = track.getBoundingClientRect();
      if (mode === "window") {
        const delta =
          ((clientX - originRef.current.x) / rect.width) * durationMs;
        const next = movePreviewWindow({
          durationMs,
          startMs: originRef.current.startMs,
          endMs: originRef.current.endMs,
          deltaMs: delta,
        });
        onChange(next.previewStartMs, next.previewEndMs);
        return;
      }
      const at = msAtClientX(clientX, rect, durationMs);
      if (mode === "seek" || mode === "playhead") {
        seekVideo(clampMsToPreview(at, startMs, endMs), true);
        return;
      }
      const next = clampHelpPreviewRange({
        recordingDurationMs: durationMs,
        previewStartMs: mode === "start" ? at : startMs,
        previewEndMs: mode === "end" ? at : endMs,
      });
      onChange(next.previewStartMs, next.previewEndMs);
    },
    [durationMs, endMs, onChange, seekVideo, startMs],
  );

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    mode: "start" | "end" | "window" | "seek" | "playhead",
  ) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = mode;
    movedRef.current = false;
    originRef.current = { startMs, endMs, x: event.clientX, playheadMs };
    setScrubbing(mode === "playhead");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const mode = dragRef.current;
    if (!mode) return;
    if (Math.abs(event.clientX - originRef.current.x) > 3) movedRef.current = true;
    if (mode === "seek" && !movedRef.current) return;
    applyFromClientX(event.clientX, mode);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const mode = dragRef.current;
    if (!mode) return;
    if ((mode === "seek" || mode === "window") && !movedRef.current) {
      applyFromClientX(event.clientX, "seek");
    }
    dragRef.current = null;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function togglePlay() {
    const video = videoRef?.current;
    if (!video) return;
    togglePreviewPlayback(video, startMs, endMs);
  }

  const { startPct, widthPct } = rangePercents(startMs, endMs, durationMs);
  const headPct = playheadPercent(playheadMs, durationMs);
  const leftCovered = filmEndCovered(
    trackW > 0 ? (startPct / 100) * trackW : startMs <= 0 ? 0 : Number.POSITIVE_INFINITY,
  );
  const rightCovered = filmEndCovered(
    trackW > 0
      ? ((100 - startPct - widthPct) / 100) * trackW
      : endMs >= durationMs - 1
        ? 0
        : Number.POSITIVE_INFINITY,
  );

  return (
    <div className="post-compose-trim">
      <div className="post-compose-trim-meta">
        <button
          type="button"
          className="post-compose-trim-play"
          aria-label={playing ? "Pause preview" : "Play preview"}
          onClick={togglePlay}
        >
          {playing ? (
            <Pause size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
        </button>
        <span className="post-compose-trim-title">Free preview</span>
        <span className="post-compose-trim-time">
          {timeLabel(playheadMs)} · {timeLabel(startMs)}–{timeLabel(endMs)}
        </span>
      </div>
      <div
        ref={trackRef}
        className="post-compose-trim-film"
        style={{
          ["--pc-trim-r-l" as string]: leftCovered ? "0px" : "10px",
          ["--pc-trim-r-r" as string]: rightCovered ? "0px" : "10px",
        }}
        onPointerDown={(event) => beginDrag(event, "seek")}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="post-compose-trim-body">
          <div className="post-compose-trim-frames" aria-hidden="true">
            {frames.length
              ? frames.map((frame, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${index}-${frame.slice(-12)}`} src={frame} alt="" draggable={false} />
                ))
              : Array.from({ length: FRAME_COUNT }, (_, index) => (
                  <span key={index} className="post-compose-trim-frame-slot" />
                ))}
          </div>
          <div className="post-compose-trim-veil is-left" style={{ width: `${startPct}%` }} />
          <div
            className="post-compose-trim-veil is-right"
            style={{ width: `${Math.max(0, 100 - startPct - widthPct)}%` }}
          />
          <div
            className="post-compose-trim-window"
            style={{ left: `${startPct}%`, width: `${widthPct}%` }}
            onPointerDown={(event) => beginDrag(event, "window")}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
        <button
          type="button"
          className="post-compose-trim-handle is-start"
          aria-label="Preview start"
          style={{ left: `${startPct}%` }}
          onPointerDown={(event) => beginDrag(event, "start")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <button
          type="button"
          className="post-compose-trim-handle is-end"
          aria-label="Preview end"
          style={{ left: `${startPct + widthPct}%` }}
          onPointerDown={(event) => beginDrag(event, "end")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div
          className={`post-compose-trim-playhead${scrubbing ? " is-scrubbing" : ""}`}
          style={{ left: `${headPct}%` }}
        >
          <span
            className="post-compose-trim-playhead-grip"
            role="button"
            tabIndex={0}
            aria-label="Drag to scrub"
            onPointerDown={(event) => beginDrag(event, "playhead")}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
      </div>
    </div>
  );
}
