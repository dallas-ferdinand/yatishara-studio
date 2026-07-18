// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FastForward,
  Music,
  Pause,
  Play,
  Rewind,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useVideoChunkPrefetch } from "@/desk/lib/use-video-chunk-prefetch.js";
import {
  createSeekHandlers,
  formatMediaTime,
} from "@/studio/lib/mediaPlayback";
import { MediaLoadWave } from "@/studio/components/media-load-frame";

const mediaIcon = (size = 14) => ({
  size,
  strokeWidth: 2,
  "aria-hidden": true,
});

export function DeskMediaPlayer({
  kind = "video",
  src,
  name,
  onDownload,
  poster,
  fileSize = null,
  prefetch = true,
  layout = "default",
}) {
  const mediaRef = useRef(null);
  const pointerSeekingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [ready, setReady] = useState(false);
  const [aspect, setAspect] = useState(null);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);

  const isVideo = kind === "video";
  const Tag = isVideo ? "video" : "audio";
  const shouldPrefetch = prefetch && Boolean(src) && !String(src).startsWith("blob:");

  useVideoChunkPrefetch({
    url: src,
    mediaRef,
    enabled: shouldPrefetch,
    fileSize,
  });

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setSeekValue(0);
    setSeeking(false);
    pointerSeekingRef.current = false;
    setReady(false);
    setAspect(null);
    setBuffering(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return undefined;

    const onTime = () => {
      if (!pointerSeekingRef.current) {
        setCurrent(el.currentTime);
        setSeekValue(el.currentTime);
      }
    };
    const onMeta = () => {
      setDuration(el.duration || 0);
      setReady(true);
      setFailed(false);
      if (isVideo && el.videoWidth > 0 && el.videoHeight > 0) {
        setAspect(el.videoWidth / el.videoHeight);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);
    const onPlaying = () => setBuffering(false);
    const onStalled = () => setBuffering(true);
    const onError = () => {
      setFailed(true);
      setReady(false);
      setPlaying(false);
      setBuffering(false);
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("stalled", onStalled);
    el.addEventListener("error", onError);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("stalled", onStalled);
      el.removeEventListener("error", onError);
    };
  }, [isVideo, src]);

  const togglePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el || failed) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [failed]);

  const skip = useCallback((delta) => {
    const el = mediaRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const next = Math.min(Math.max(0, el.currentTime + delta), el.duration);
    el.currentTime = next;
    setCurrent(next);
    setSeekValue(next);
  }, []);

  const seekHandlers = useMemo(
    () =>
      createSeekHandlers({
        getMedia: () => mediaRef.current,
        setSeekValue,
        setSeeking,
        setCurrent,
        pointerSeekingRef,
      }),
    [],
  );

  const onVolume = useCallback((e) => {
    const el = mediaRef.current;
    const v = Number(e.target.value);
    if (!el) return;
    el.volume = v;
    el.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (!el.muted && el.volume === 0) {
      el.volume = 0.8;
      setVolume(0.8);
    }
  }, []);

  const progressPct = duration > 0 ? Math.min(100, (seekValue / duration) * 100) : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : Volume2;
  const aspectClass =
    aspect != null && aspect < 0.9
      ? " desk-media-player--portrait"
      : aspect != null && aspect > 1.1
        ? " desk-media-player--landscape"
        : "";
  const playerStyle = aspect ? { "--desk-media-aspect": String(aspect) } : undefined;
  const isStudioPreview = layout === "studio-preview";

  const transportControls = (
    <>
      <button type="button" className="cursor-icon-btn" title="Back 10s" onClick={() => skip(-10)}>
        <Rewind {...mediaIcon(14)} />
      </button>
      <button
        type="button"
        className="cursor-icon-btn desk-media-player-play"
        title={playing ? "Pause" : "Play"}
        onClick={togglePlay}
      >
        {playing ? <Pause {...mediaIcon(16)} /> : <Play {...mediaIcon(16)} />}
      </button>
      <button type="button" className="cursor-icon-btn" title="Forward 10s" onClick={() => skip(10)}>
        <FastForward {...mediaIcon(14)} />
      </button>
      <span className="desk-media-player-time">
        {formatMediaTime(current)}
        <span className="desk-media-player-time-sep">/</span>
        {ready ? formatMediaTime(duration) : "—"}
      </span>
    </>
  );

  const volumeControls = (
    <>
      <button type="button" className="cursor-icon-btn" title={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
        <VolumeIcon {...mediaIcon(14)} />
      </button>
      <input
        type="range"
        className="desk-media-player-volume"
        min={0}
        max={1}
        step={0.02}
        value={muted ? 0 : volume}
        onChange={onVolume}
        aria-label="Volume"
      />
    </>
  );

  const scrubBar = (
    <div className="desk-media-player-scrub">
      <div
        className="desk-media-player-scrub-track"
        style={{ "--desk-media-progress": `${progressPct}%` }}
      >
        <input
          type="range"
          className="desk-media-player-scrub-input"
          min={0}
          max={duration || 0}
          step={0.05}
          value={seekValue}
          disabled={!duration || failed}
          onPointerDown={seekHandlers.onPointerDown}
          onChange={seekHandlers.onChange}
          onPointerUp={seekHandlers.onPointerUp}
          onPointerCancel={seekHandlers.onPointerCancel}
          onBlur={seekHandlers.onBlur}
          aria-label="Seek"
        />
      </div>
    </div>
  );

  const controls = (
    <div className="desk-media-player-controls">
      {scrubBar}
      <div className="desk-media-player-toolbar">
        <div className="desk-media-player-toolbar-left">
          {transportControls}
        </div>
        <div className="desk-media-player-toolbar-right">
          <span className="desk-media-player-name truncate" title={name}>
            {name}
          </span>
          {volumeControls}
          {onDownload ? (
            <button type="button" className="cursor-icon-btn" title="Download" onClick={onDownload}>
              <Download {...mediaIcon(14)} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  const studioPreviewControls = (
    <div className="desk-media-player-controls desk-media-player-controls--studio-preview">
      {scrubBar}
      <div className="desk-media-player-toolbar">
        <div className="desk-media-player-toolbar-left">{transportControls}</div>
        <div className="desk-media-player-toolbar-right">
          {volumeControls}
        </div>
      </div>
    </div>
  );

  const videoStage = (
    <div className="desk-media-player-stage" onClick={togglePlay}>
      <Tag
        ref={mediaRef}
        src={src}
        poster={poster}
        playsInline
        preload={shouldPrefetch ? "auto" : "metadata"}
        className="desk-media-player-video"
      />
      {(buffering && playing) || (!ready && !failed) ? (
        <div className="desk-media-player-buffering" aria-busy="true" aria-label="Loading">
          <MediaLoadWave size="sm" />
        </div>
      ) : null}
      {failed ? (
        <div className="desk-media-player-buffering is-error" role="status">
          Media unavailable
        </div>
      ) : null}
      {!playing && !failed && ready && !buffering ? (
        <button
          type="button"
          className="desk-media-player-overlay-play"
          title="Play"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
        >
          <Play size={28} strokeWidth={2.75} aria-hidden />
        </button>
      ) : null}
    </div>
  );

  const audioBody = (
    <div className="desk-media-player-audio-body">
      <div className="desk-media-player-audio-art" aria-hidden>
        <Music size={32} strokeWidth={1.75} />
      </div>
      <Tag
        ref={mediaRef}
        src={src}
        preload={shouldPrefetch ? "auto" : "metadata"}
        className="desk-media-player-audio-el"
      />
    </div>
  );

  if (isStudioPreview) {
    return (
      <div
        className={`desk-image-viewer desk-media-player desk-media-player--${kind} desk-media-player--studio-preview${aspectClass}`}
        style={playerStyle}
      >
        <div className="desk-image-viewer-toolbar">
          <div className="desk-image-viewer-toolbar-left">
            {name ? (
              <span className="desk-image-viewer-name truncate" title={name}>
                {name}
              </span>
            ) : null}
          </div>
          <div className="desk-image-viewer-toolbar-center" />
          <div className="desk-image-viewer-toolbar-right">
            {onDownload ? (
              <button type="button" className="cursor-icon-btn" title="Download" onClick={onDownload}>
                <Download {...mediaIcon(14)} />
              </button>
            ) : null}
          </div>
        </div>
        {isVideo ? videoStage : <div className="desk-image-viewer-stage">{audioBody}</div>}
        {studioPreviewControls}
      </div>
    );
  }

  return (
    <div
      className={`desk-media-player desk-media-player--${kind}${aspectClass}`}
      style={playerStyle}
    >
      {isVideo ? videoStage : audioBody}
      {controls}
    </div>
  );
}
