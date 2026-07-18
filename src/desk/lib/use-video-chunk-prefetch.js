"use client";

import { useEffect, useRef } from "react";
import {
  getOrCreatePrefetcher,
  releaseVideoPrefetch,
  scheduleVideoPrefetch,
} from "@/desk/lib/video-chunk-prefetch.js";

/**
 * Warm HTTP range cache for media URLs and keep read-ahead during playback.
 * @param {{ url: string | null, mediaRef: React.RefObject<HTMLMediaElement>, enabled?: boolean, fileSize?: number }} opts
 */
export function useVideoChunkPrefetch({ url, mediaRef, enabled = true, fileSize = null }) {
  const prefetcherRef = useRef(null);
  const activeUrlRef = useRef(null);

  useEffect(() => {
    if (!enabled || !url) {
      if (activeUrlRef.current) {
        releaseVideoPrefetch(activeUrlRef.current);
        activeUrlRef.current = null;
      }
      prefetcherRef.current = null;
      return undefined;
    }
    const p = scheduleVideoPrefetch(url, { fileSize });
    prefetcherRef.current = p;
    activeUrlRef.current = url;
    return () => {
      releaseVideoPrefetch(url);
      if (activeUrlRef.current === url) activeUrlRef.current = null;
      prefetcherRef.current = null;
    };
  }, [url, enabled, fileSize]);

  useEffect(() => {
    if (!enabled || !url) return undefined;
    const el = mediaRef.current;
    if (!el) return undefined;
    const p = prefetcherRef.current ?? getOrCreatePrefetcher(url, { fileSize });

    const sample = () => {
      const duration = el.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      let sampleTime = el.currentTime;
      if (el.buffered.length > 0) {
        const bufferedEnd = el.buffered.end(el.buffered.length - 1);
        sampleTime = Math.max(sampleTime, bufferedEnd);
      }
      p?.onPlaybackSample(sampleTime, duration);
    };

    const onTime = () => sample();
    const onProgress = () => sample();
    const onSeeking = () => sample();
    const onLoaded = () => {
      void p?.start();
      sample();
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("progress", onProgress);
    el.addEventListener("seeking", onSeeking);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("durationchange", onLoaded);

    if (el.readyState >= 1) onLoaded();

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("seeking", onSeeking);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("durationchange", onLoaded);
    };
  }, [url, enabled, fileSize, mediaRef]);
}
