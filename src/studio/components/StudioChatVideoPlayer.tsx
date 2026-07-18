"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createSeekHandlers,
  formatMediaTime,
} from "@/studio/lib/mediaPlayback";
import { MediaLoadWave } from "./media-load-frame";
import "./studio-chat-video-player.css";

const CHROME_HIDE_MS = 2600;

type Props = {
  src: string;
  poster?: string;
  className?: string;
};

export function StudioChatVideoPlayer({ src, poster, className = "" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pointerSeekingRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const chromeVisibleRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [seekValue, setSeekValue] = useState(0);
  const [, setSeeking] = useState(false);
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playError, setPlayError] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hideChrome = useCallback(() => {
    clearHideTimer();
    chromeVisibleRef.current = false;
    setChromeVisible(false);
  }, [clearHideTimer]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      chromeVisibleRef.current = false;
      setChromeVisible(false);
      hideTimerRef.current = null;
    }, CHROME_HIDE_MS);
  }, [clearHideTimer]);

  const showChrome = useCallback(() => {
    chromeVisibleRef.current = true;
    setChromeVisible(true);
    const el = videoRef.current;
    if (el && !el.paused && !pointerSeekingRef.current) scheduleHide();
    else clearHideTimer();
  }, [clearHideTimer, scheduleHide]);

  const toggleChrome = useCallback(() => {
    if (chromeVisibleRef.current) hideChrome();
    else showChrome();
  }, [hideChrome, showChrome]);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setSeekValue(0);
    setSeeking(false);
    pointerSeekingRef.current = false;
    setReady(false);
    setBuffering(false);
    setFailed(false);
    setPlayError(false);
    hideChrome();
  }, [hideChrome, src]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;

    const onTime = () => {
      if (!pointerSeekingRef.current) setSeekValue(el.currentTime);
    };
    const onMeta = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      setReady(true);
      setFailed(false);
    };
    const onPlay = () => {
      setPlaying(true);
      setPlayError(false);
      if (chromeVisibleRef.current) scheduleHide();
    };
    const onPause = () => {
      setPlaying(false);
      clearHideTimer();
    };
    const onEnded = () => {
      setPlaying(false);
      showChrome();
    };
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);
    const onPlaying = () => setBuffering(false);
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
    el.addEventListener("error", onError);
    if (el.readyState >= 1) onMeta();

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
      el.removeEventListener("error", onError);
    };
  }, [clearHideTimer, scheduleHide, showChrome, src]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el || failed) return;
    if (el.paused) {
      void el.play().catch(() => {
        setPlayError(true);
        setPlaying(false);
      });
    } else {
      el.pause();
    }
    showChrome();
  }, [failed, showChrome]);

  const seekHandlers = useMemo(
    () =>
      createSeekHandlers({
        getMedia: () => videoRef.current,
        setSeekValue,
        setSeeking,
        pointerSeekingRef,
      }),
    [],
  );

  const progressPct = duration > 0 ? Math.min(100, (seekValue / duration) * 100) : 0;

  return (
    <div className={`studio-chat-video-player ${className}`.trim()}>
      <div className="studio-chat-video-player-stage">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          className="studio-chat-video-player-video"
        />
        <button
          type="button"
          className="studio-chat-video-player-surface"
          aria-label={chromeVisible ? "Hide video controls" : "Show video controls"}
          onClick={toggleChrome}
        />
        {(!ready && !failed) || (buffering && playing) ? (
          <span className="studio-chat-video-player-buffering" aria-hidden>
            <MediaLoadWave size="sm" />
          </span>
        ) : null}
        {failed ? (
          <span className="studio-chat-video-player-failure" role="status">
            Video unavailable
          </span>
        ) : null}
        {playError && !failed && !playing ? (
          <span className="studio-chat-video-player-failure is-soft" role="status">
            Tap play to start
          </span>
        ) : null}
        <div
          className={`studio-chat-video-player-chrome${chromeVisible ? " is-visible" : ""}`}
          aria-hidden={!chromeVisible}
        >
          <button
            type="button"
            className="studio-chat-video-player-toggle"
            aria-label={playing ? "Pause" : "Play"}
            tabIndex={chromeVisible ? 0 : -1}
            disabled={failed}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              togglePlay();
            }}
          >
            {playing ? (
              <Pause size={44} fill="currentColor" strokeWidth={0} aria-hidden />
            ) : (
              <Play size={44} fill="currentColor" strokeWidth={0} aria-hidden />
            )}
          </button>
          <div
            className="studio-chat-video-player-bar"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="studio-chat-video-player-time">
              {formatMediaTime(seekValue)}
            </span>
            <div
              className="studio-chat-video-player-scrub"
              style={{ "--chat-video-progress": `${progressPct}%` } as CSSProperties}
            >
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.05}
                value={seekValue}
                disabled={!duration || failed}
                aria-label="Seek"
                tabIndex={chromeVisible ? 0 : -1}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  clearHideTimer();
                  seekHandlers.onPointerDown();
                }}
                onChange={seekHandlers.onChange}
                onPointerUp={(event) => {
                  seekHandlers.onPointerUp(event);
                  if (videoRef.current && !videoRef.current.paused) scheduleHide();
                }}
                onPointerCancel={(event) => {
                  seekHandlers.onPointerCancel(event);
                  if (videoRef.current && !videoRef.current.paused) scheduleHide();
                }}
                onBlur={(event) => {
                  seekHandlers.onBlur(event);
                  if (videoRef.current && !videoRef.current.paused) scheduleHide();
                }}
              />
            </div>
            <span className="studio-chat-video-player-time">
              {ready ? formatMediaTime(duration) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
