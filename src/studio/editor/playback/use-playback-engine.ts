"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportPerfMetric } from "@/lib/performance";
import {
  normalizeClipTransform,
  type ClipTransform,
} from "../clipTransform";
import { normalizeTextTransform } from "../textLayout";
import { clipOpacityAtLocalTime, textAnimationStyle } from "../editorEffects";
import type { ClipEffects, EditorMediaItem, EditorProject } from "../types";
import { AudioMixer } from "./audio-mixer";
import { CompositorClient } from "./compositor-client";
import {
  detectDecoderCapabilities,
  MediaDecoderClient,
  type DecodedFrame,
} from "./media-decoder-client";
import { FrameScheduler, type FrameConsumer, type SchedulerMetrics } from "./frame-scheduler";
import { compileTimeline, sliceAt } from "./timeline-compiler";
import type { PlaybackPlan, RenderSlice } from "./timeline-compiler";
import { TransportClock } from "./transport-clock";
import { isLegacySystemFont, loadGoogleFont } from "../loadGoogleFont";

function transformTuple(
  effects: ClipEffects | undefined,
): [number, number, number, number] {
  const transform = normalizeClipTransform(effects);
  return [transform.scale, transform.x, transform.y, transform.rotation];
}

function mapTextItems(
  items: RenderSlice["textOver"],
  timelineTime: number,
): Array<{
  text: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  opacity: number;
  translateY: number;
  scale: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  strokeColor: string;
  strokeWidth: number;
  flipX: boolean;
  flipY: boolean;
  poseX: number;
  poseY: number;
  poseScale: number;
  rotation: number;
  clipId: string;
}> {
  return items
    .filter((item) => Boolean(item.clip.text?.text))
    .map((item) => {
      const local = timelineTime - item.timelineStart;
      const duration = item.timelineEnd - item.timelineStart;
      const animation = textAnimationStyle(
        item.clip.text?.animation,
        item.clip.text?.animationDuration ?? 0.5,
        local,
        duration,
      );
      const translateY = /translateY\((-?[\d.]+)px\)/.exec(animation.transform);
      const scale = /scale\(([\d.]+)\)/.exec(animation.transform);
      const pose = normalizeTextTransform(item.clip.effects);
      const t = item.clip.text;
      return {
        clipId: item.clipId,
        text: t?.text ?? "",
        fontSize: Math.max(12, Math.min(200, Number(t?.fontSize) || 42)),
        color: t?.color ?? "#fff",
        align: t?.align ?? "center",
        opacity:
          animation.opacity *
          clipOpacityAtLocalTime(item.clip.effects, duration, local) *
          Math.max(0, Math.min(1, Number(t?.opacity) ?? 1)),
        translateY: translateY ? Number(translateY[1]) : 0,
        scale: scale ? Number(scale[1]) : 1,
        fontFamily: t?.fontFamily ?? "system",
        bold: Boolean(t?.bold),
        italic: Boolean(t?.italic),
        strokeColor: t?.strokeColor ?? "#000000",
        strokeWidth: Math.max(0, Number(t?.strokeWidth) || 0),
        flipX: Boolean(t?.flipX),
        flipY: Boolean(t?.flipY),
        poseX: pose.x,
        poseY: pose.y,
        poseScale: pose.scale,
        rotation: pose.rotation,
        underline: Boolean(t?.underline),
        textCase: t?.textCase ?? "none",
        letterSpacing: Number(t?.letterSpacing) || 0,
        lineHeight: Math.max(0.8, Number(t?.lineHeight) || 1.2),
        verticalAlign: t?.verticalAlign ?? "middle",
        backgroundColor: t?.backgroundColor ?? null,
        backgroundPadding: Math.max(0, Number(t?.backgroundPadding) ?? 8),
        backgroundRadius: Math.max(0, Number(t?.backgroundRadius) ?? 0),
        shadowColor: t?.shadowColor ?? null,
        shadowBlur: Math.max(0, Number(t?.shadowBlur) || 0),
        shadowOffsetX: Number(t?.shadowOffsetX) || 0,
        shadowOffsetY: Number(t?.shadowOffsetY) || 0,
        glow: Boolean(t?.glow),
        glowColor: t?.glowColor ?? "#ffffff",
        glowBlur: Math.max(0, Number(t?.glowBlur) || 12),
      };
    });
}

type EngineRuntime = {
  plan: PlaybackPlan;
  clock: TransportClock;
  scheduler: FrameScheduler;
  decoder: MediaDecoderClient;
  compositor: CompositorClient;
  audio: AudioMixer;
  consumer: EngineConsumer;
};

type Prepared = {
  slice: RenderSlice;
  generation: number;
  frameA?: VideoFrame;
  frameB?: VideoFrame;
};

class EngineConsumer implements FrameConsumer {
  private readonly decoder: MediaDecoderClient;
  private readonly compositor: CompositorClient;
  private readonly audio: AudioMixer;
  private readonly mediaRef: React.MutableRefObject<ReadonlyMap<string, EditorMediaItem>>;
  private readonly playingRef: React.MutableRefObject<boolean>;
  private readonly onAudioReady: () => void;
  private readonly onSourceSize: (size: {
    assetId: string;
    width: number;
    height: number;
  } | null) => void;
  private prepared: Prepared | null = null;
  private readonly imageFrames = new Map<string, VideoFrame>();
  private readonly imageLoads = new Map<string, Promise<VideoFrame>>();
  private transitionKey: string | null = null;
  private transitionStartedAt = 0;

  constructor(args: {
    decoder: MediaDecoderClient;
    compositor: CompositorClient;
    audio: AudioMixer;
    mediaRef: React.MutableRefObject<ReadonlyMap<string, EditorMediaItem>>;
    playingRef: React.MutableRefObject<boolean>;
    onAudioReady: () => void;
    onSourceSize: (size: {
      assetId: string;
      width: number;
      height: number;
    } | null) => void;
  }) {
    this.decoder = args.decoder;
    this.compositor = args.compositor;
    this.audio = args.audio;
    this.mediaRef = args.mediaRef;
    this.playingRef = args.playingRef;
    this.onAudioReady = args.onAudioReady;
    this.onSourceSize = args.onSourceSize;
  }

  async prepare(slice: RenderSlice, generation: number): Promise<boolean> {
    this.closePrepared();
    const transitionKey = slice.transition?.key ?? null;
    if (transitionKey && transitionKey !== this.transitionKey) {
      this.transitionKey = transitionKey;
      this.transitionStartedAt = performance.now();
    } else if (!transitionKey) {
      this.transitionKey = null;
    }
    // Warm beds in parallel with video — never gate video frames on audio I/O
    // (long voiceovers would stall the whole preview). Sync kicks in via
    // onAudioReady once decode settles (even partial — sync plays what it has).
    const audioReady = this.audio.prepare(slice, this.mediaRef.current).then(() => {
      this.onAudioReady();
    });
    const decoded = await Promise.all(
      slice.video.map(async (sample): Promise<DecodedFrame | null> => {
        const assetId = sample.clip.assetId;
        if (!assetId) return null;
        const media = this.mediaRef.current.get(assetId);
        const url = media?.proxyUrl ?? media?.url;
        if (!media || !url) return null;
        if (media.kind === "image") {
          const frame = await this.imageFrame(assetId, url);
          return {
            assetId,
            sourceTime: sample.sourceTime,
            generation,
            frame: frame.clone(),
          };
        }
        return await this.decoder.requestFrame(
          assetId,
          url,
          sample.sourceTime,
          generation,
        );
      }),
    );
    // Touch the promise so failures aren't unhandled; do not await for readiness.
    void audioReady;
    const valid = decoded.filter((item): item is DecodedFrame => item != null);
    const hasText = slice.textOver.length > 0 || slice.textUnder.length > 0;
    if (valid.length < slice.video.length) {
      // Keep fade envelopes moving even when video decode isn't ready yet.
      this.audio.sync(
        slice,
        generation,
        this.mediaRef.current,
        this.playingRef.current,
      );
      // Still paint text style changes — don't gate the canvas on video decode.
      if (!hasText) {
        for (const item of valid) item.frame.close();
        return false;
      }
    }
    // Sync whatever audio is already cached (video stems and/or beds).
    this.onAudioReady();
    const primary = valid[0];
    this.onSourceSize(
      primary
        ? {
            assetId: primary.assetId,
            width: primary.frame.displayWidth,
            height: primary.frame.displayHeight,
          }
        : null,
    );
    const frameA = valid[0]?.frame;
    let frameB = valid[1]?.frame;
    // Distinct transferables required for compositor postMessage.
    if (frameA && frameB && frameA === frameB) {
      frameB = frameA.clone();
    }
    this.prepared = {
      slice,
      generation,
      frameA,
      frameB,
    };

    // Pre-roll an upcoming transition partner from MP4 sample offsets.
    // The scheduler invokes this before entry, eliminating transition-start I/O.
    for (const sample of [...slice.video, ...slice.preload]) {
      if (!sample.clip.assetId) continue;
      const media = this.mediaRef.current.get(sample.clip.assetId);
      const url = media?.proxyUrl ?? media?.url;
      if (url && media?.kind === "video") {
        this.decoder.prefetch(
          sample.clip.assetId,
          url,
          sample.sourceTime,
          generation,
          1.5,
        );
      }
    }
    // Decode-ahead the first frames of upcoming clips so boundaries render
    // from cache instead of stalling on a cold keyframe decode.
    for (const sample of slice.preload) {
      if (!sample.clip.assetId) continue;
      const media = this.mediaRef.current.get(sample.clip.assetId);
      const url = media?.proxyUrl ?? media?.url;
      if (url && media?.kind === "video") {
        this.decoder.warm(sample.clip.assetId, url, sample.sourceTime, generation);
      }
    }
    return true;
  }

  async render(slice: RenderSlice, generation: number): Promise<void> {
    const prepared = this.prepared;
    if (
      !prepared ||
      prepared.generation !== generation ||
      prepared.slice.timelineTime !== slice.timelineTime
    ) {
      this.closePrepared();
      return;
    }
    this.prepared = null;
    const textsUnder = mapTextItems(slice.textUnder, slice.timelineTime);
    const textsOver = mapTextItems(slice.textOver, slice.timelineTime);
    const families = [
      ...textsUnder.map((item) => item.fontFamily),
      ...textsOver.map((item) => item.fontFamily),
    ].filter((family) => family && !isLegacySystemFont(family));
    // Document + worker FontFace sets are separate — load both before paint.
    await Promise.all(families.map((family) => loadGoogleFont(family)));
    await this.compositor.ensureFonts(families);
    await this.compositor.render({
      frameA: prepared.frameA,
      frameB: prepared.frameB,
      transformA: transformTuple(prepared.slice.video[0]?.clip.clip.effects),
      transformB: transformTuple(prepared.slice.video[1]?.clip.clip.effects),
      transition: slice.transition?.type,
      progress: slice.transition?.progress,
      textsUnder,
      textsOver,
    });
    if (slice.transition && this.transitionStartedAt > 0) {
      reportPerfMetric(
        "editor-transition-start",
        performance.now() - this.transitionStartedAt,
        {
          transition: slice.transition.type,
          transitionKey: slice.transition.key,
        },
        "video-editor",
      );
      this.transitionStartedAt = 0;
    }
    this.audio.sync(
      slice,
      generation,
      this.mediaRef.current,
      this.playingRef.current,
    );
  }

  dispose(): void {
    this.closePrepared();
    for (const frame of this.imageFrames.values()) frame.close();
    this.imageFrames.clear();
    this.imageLoads.clear();
  }

  private imageFrame(assetId: string, url: string): Promise<VideoFrame> {
    const cached = this.imageFrames.get(assetId);
    if (cached) return Promise.resolve(cached);
    const pending = this.imageLoads.get(assetId);
    if (pending) return pending;
    const request = fetch(url, { credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(`Image preview failed (${response.status}).`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        const frame = new VideoFrame(bitmap, { timestamp: 0 });
        bitmap.close();
        this.imageFrames.set(assetId, frame);
        this.imageLoads.delete(assetId);
        return frame;
      })
      .catch((error) => {
        this.imageLoads.delete(assetId);
        throw error;
      });
    this.imageLoads.set(assetId, request);
    return request;
  }

  private closePrepared(): void {
    this.prepared?.frameA?.close();
    this.prepared?.frameB?.close();
    this.prepared = null;
  }
}

export type PlaybackEngineState = {
  canvasRef: (canvas: HTMLCanvasElement | null) => void;
  buffering: boolean;
  error: string | null;
  supported: boolean;
  sourceSize: {
    assetId: string;
    width: number;
    height: number;
  } | null;
  previewTransform: (transform: ClipTransform) => void;
  previewTextTransform: (clipId: string, transform: ClipTransform) => void;
  setMasterVolume: (volume: number) => void;
  metrics: () => SchedulerMetrics | null;
};

export function usePlaybackEngine(args: {
  project: EditorProject;
  playhead: number;
  playing: boolean;
  mediaById: ReadonlyMap<string, EditorMediaItem>;
  /** Natural atempo+EQ preview URLs for sped clips. */
  naturalAudioByClipId?: ReadonlyMap<string, string>;
  width: number;
  height: number;
  onPlayheadChange: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
}): PlaybackEngineState {
  const {
    project,
    playhead,
    playing,
    mediaById,
    naturalAudioByClipId,
    width,
    height,
    onPlayheadChange,
    onPlayingChange,
  } = args;
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<{
    assetId: string;
    width: number;
    height: number;
  } | null>(null);
  const capabilities = detectDecoderCapabilities();
  const runtimeRef = useRef<EngineRuntime | null>(null);
  const mediaRef = useRef<ReadonlyMap<string, EditorMediaItem>>(mediaById);
  const playingRef = useRef(playing);
  const callbacksRef = useRef({ onPlayheadChange, onPlayingChange });
  const emittedTimeRef = useRef(playhead);
  const projectRef = useRef(project);
  const disposeTimerRef = useRef<number | null>(null);
  const metricsTimerRef = useRef<number | null>(null);
  mediaRef.current = mediaById;
  playingRef.current = playing;
  callbacksRef.current = { onPlayheadChange, onPlayingChange };
  projectRef.current = project;

  const canvasRef = useCallback((element: HTMLCanvasElement | null) => {
    setCanvas(element);
  }, []);

  const disposeRuntime = useCallback(() => {
    if (metricsTimerRef.current != null) {
      window.clearInterval(metricsTimerRef.current);
      metricsTimerRef.current = null;
    }
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    runtime?.scheduler.stop();
    runtime?.consumer.dispose();
    runtime?.decoder.dispose();
    runtime?.compositor.dispose();
    void runtime?.audio.dispose();
  }, []);

  useEffect(() => {
    if (!canvas || !capabilities.supported) {
      if (!capabilities.supported) setError(capabilities.reason ?? "Preview unsupported.");
      return;
    }
    if (disposeTimerRef.current != null) {
      window.clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }
    // React Strict Mode replays this effect. Reuse the first transferred canvas
    // and worker graph instead of attempting transferControlToOffscreen twice.
    if (runtimeRef.current) {
      return () => {
        disposeTimerRef.current = window.setTimeout(disposeRuntime, 0);
      };
    }
    const bufferHold = {
      resumeAfterBuffer: false,
      hardStopTimer: null as number | null,
    };
    try {
      const audio = new AudioMixer();
      audio.setNaturalAudioUrls(naturalAudioByClipId);
      const clock = new TransportClock(
        compileTimeline(projectRef.current).duration,
        audio.clockSeconds,
      );
      clock.seek(playhead);
      const decoder = new MediaDecoderClient();
      const compositor = new CompositorClient(canvas, width, height);
      const syncAudioNow = () => {
        const runtime = runtimeRef.current;
        if (!runtime || !playingRef.current) return;
        const time = runtime.clock.currentTime();
        runtime.audio.sync(
          sliceAt(runtime.plan, time),
          runtime.clock.generation,
          mediaRef.current,
          true,
        );
      };
      const consumer = new EngineConsumer({
        decoder,
        compositor,
        audio,
        mediaRef,
        playingRef,
        onAudioReady: syncAudioNow,
        onSourceSize: (next) => {
          setSourceSize((current) => {
            if (
              current?.assetId === next?.assetId &&
              current?.width === next?.width &&
              current?.height === next?.height
            ) {
              return current;
            }
            return next;
          });
        },
      });
      const plan = compileTimeline(projectRef.current);
      const scheduler = new FrameScheduler(plan, clock, consumer, {
        onTime: (time) => {
          emittedTimeRef.current = time;
          callbacksRef.current.onPlayheadChange(time);
        },
        onBuffering: (value) => {
          if (value) {
            // Clock is already held by the scheduler during prepare. Soft-pause
            // audio for brief stalls; only tear down media elements if held long.
            if (!bufferHold.resumeAfterBuffer) {
              audio.softPause();
              bufferHold.resumeAfterBuffer = true;
              bufferHold.hardStopTimer = window.setTimeout(() => {
                if (bufferHold.resumeAfterBuffer) audio.stopAll();
              }, 300);
            }
          } else if (bufferHold.resumeAfterBuffer && playingRef.current) {
            bufferHold.resumeAfterBuffer = false;
            if (bufferHold.hardStopTimer != null) {
              window.clearTimeout(bufferHold.hardStopTimer);
              bufferHold.hardStopTimer = null;
            }
            if (!clock.playing) clock.play();
            // Restart beds after soft/hard pause once video is moving again.
            const runtime = runtimeRef.current;
            if (runtime) {
              const time = clock.currentTime();
              void audio.prepare(sliceAt(runtime.plan, time), mediaRef.current).then(() => {
                if (!playingRef.current || runtimeRef.current !== runtime) return;
                audio.sync(
                  sliceAt(runtime.plan, clock.currentTime()),
                  clock.generation,
                  mediaRef.current,
                  true,
                );
              });
            }
          } else {
            bufferHold.resumeAfterBuffer = false;
            if (bufferHold.hardStopTimer != null) {
              window.clearTimeout(bufferHold.hardStopTimer);
              bufferHold.hardStopTimer = null;
            }
          }
          if (runtimeRef.current) setBuffering(value);
        },
        onEnded: () => callbacksRef.current.onPlayingChange(false),
        onError: (reason) => {
          if (runtimeRef.current) setError(reason.message);
          callbacksRef.current.onPlayingChange(false);
        },
        uiIntervalMs: 33,
      });
      runtimeRef.current = {
        plan,
        clock,
        scheduler,
        decoder,
        compositor,
        audio,
        consumer,
      };
      metricsTimerRef.current = window.setInterval(() => {
        const metrics = scheduler.metrics();
        const decoderMetrics = decoder.metrics();
        const audioMetrics = audio.metrics();
        const videoAssets = [...mediaRef.current.values()].filter(
          (media) => media.kind === "video",
        );
        const proxyHits = videoAssets.filter((media) => Boolean(media.proxyUrl)).length;
        const dropRate =
          metrics.requestedFrames > 0
            ? metrics.droppedFrames / metrics.requestedFrames
            : 0;
        reportPerfMetric(
          "editor-frame",
          metrics.maxLatenessMs,
          {
            requestedFrames: metrics.requestedFrames,
            renderedFrames: metrics.renderedFrames,
            droppedFrames: metrics.droppedFrames,
            dropRate,
            bufferingMs: Math.round(metrics.bufferingMs),
            decodeQueueDepth: decoderMetrics.pendingRequests,
            decoderErrors: decoderMetrics.errors,
            decoderCacheBytes: decoderMetrics.cacheBytes,
            audioCacheBytes: audioMetrics.cacheBytes,
            activeAudioSources: audioMetrics.activeSources,
            proxyHitRate: videoAssets.length ? proxyHits / videoAssets.length : 1,
          },
          "video-editor",
        );
      }, 10_000);
      void scheduler.renderNow(playhead).catch((reason) => {
        if (runtimeRef.current) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    return () => {
      bufferHold.resumeAfterBuffer = false;
      if (bufferHold.hardStopTimer != null) {
        window.clearTimeout(bufferHold.hardStopTimer);
        bufferHold.hardStopTimer = null;
      }
      disposeTimerRef.current = window.setTimeout(disposeRuntime, 0);
    };
    // Canvas owns one OffscreenCanvas transfer for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, capabilities.reason, capabilities.supported, disposeRuntime]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const plan = compileTimeline(project);
    runtime.plan = plan;
    runtime.scheduler.setPlan(plan);
    runtime.clock.setDuration(plan.duration);
    runtime.audio.stopAll();
    const time = runtime.clock.currentTime();
    const slice = sliceAt(plan, time);
    // Newly added audio beds decode async — resync once buffers land.
    void runtime.audio.prepare(slice, mediaRef.current).then(() => {
      if (!playingRef.current || runtimeRef.current !== runtime) return;
      runtime.audio.sync(
        sliceAt(runtime.plan, runtime.clock.currentTime()),
        runtime.clock.generation,
        mediaRef.current,
        true,
      );
    });
    void runtime.scheduler.renderNow(time).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [project]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    // Resizing an OffscreenCanvas clears its buffer — always repaint or the
    // preview stays blank after aspect-ratio changes (including while playing).
    runtime.compositor.resize(width, height);
    void runtime.scheduler
      .renderNow(runtime.clock.currentTime())
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [width, height]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (playing) {
      setError(null);
      void runtime.audio
        .resume()
        .then(async () => {
          if (!playingRef.current) return;
          const time = runtime.clock.currentTime();
          // Kick bed decode before the first paint; don't block play on it.
          void runtime.audio.prepare(sliceAt(runtime.plan, time), mediaRef.current).then(() => {
            if (!playingRef.current || runtimeRef.current !== runtime) return;
            runtime.audio.sync(
              sliceAt(runtime.plan, runtime.clock.currentTime()),
              runtime.clock.generation,
              mediaRef.current,
              true,
            );
          });
          // Decode the first frame before starting the monotonic clock.
          await runtime.scheduler.renderNow(time);
          if (!playingRef.current) return;
          runtime.clock.play();
          runtime.scheduler.start();
        })
        .catch((reason) => {
          setError(reason instanceof Error ? reason.message : String(reason));
          callbacksRef.current.onPlayingChange(false);
        });
    } else {
      runtime.clock.pause();
      runtime.scheduler.stop();
      runtime.audio.stopAll();
      void runtime.scheduler.renderNow(runtime.clock.currentTime()).catch(() => undefined);
    }
  }, [playing]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    // While playing, the transport clock owns time. Echoed onPlayheadChange
    // updates must not seek/stopAll — that continuously kills audio beds.
    if (playing) return;
    runtime.clock.seek(playhead);
    runtime.audio.stopAll();
    emittedTimeRef.current = playhead;
    void runtime.scheduler.renderNow(playhead).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [playhead, playing]);

  // Proxy URLs and signed URLs arrive asynchronously after the project is
  // hydrated. Repaint a paused preview when media resolution changes, and
  // re-prepare/sync audio beds while playing so late URLs still start.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setError(null);
    const time = runtime.clock.currentTime();
    const slice = sliceAt(runtime.plan, time);
    void runtime.audio.prepare(slice, mediaRef.current).then(() => {
      if (runtimeRef.current !== runtime) return;
      if (playingRef.current) {
        runtime.audio.sync(
          sliceAt(runtime.plan, runtime.clock.currentTime()),
          runtime.clock.generation,
          mediaRef.current,
          true,
        );
      }
    });
    if (!playingRef.current) {
      void runtime.scheduler.renderNow(time).catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    }
  }, [mediaById]);

  useEffect(() => {
    runtimeRef.current?.audio.setNaturalAudioUrls(naturalAudioByClipId);
    const runtime = runtimeRef.current;
    if (!runtime || !playingRef.current) return;
    const time = runtime.clock.currentTime();
    void runtime.audio.prepare(sliceAt(runtime.plan, time), mediaRef.current).then(() => {
      if (!playingRef.current || runtimeRef.current !== runtime) return;
      runtime.audio.sync(
        sliceAt(runtime.plan, runtime.clock.currentTime()),
        runtime.clock.generation,
        mediaRef.current,
        true,
      );
    });
  }, [naturalAudioByClipId]);

  return {
    canvasRef,
    buffering,
    error,
    supported: capabilities.supported,
    sourceSize,
    previewTransform: (transform) => {
      runtimeRef.current?.compositor.updateTransform([
        transform.scale,
        transform.x,
        transform.y,
        transform.rotation,
      ]);
    },
    previewTextTransform: (clipId: string, transform: ClipTransform) => {
      const compositor = runtimeRef.current?.compositor;
      if (!compositor) return;
      const tuple: [number, number, number, number] = [
        transform.scale,
        transform.x,
        transform.y,
        transform.rotation,
      ];
      // Prefer instance method; fall back to current prototype so HMR-stale
      // compositor instances (created before updateTextTransform shipped) still work.
      if (typeof compositor.updateTextTransform === "function") {
        compositor.updateTextTransform(clipId, tuple);
        return;
      }
      const protoFn = CompositorClient.prototype.updateTextTransform;
      if (typeof protoFn === "function") {
        protoFn.call(compositor, clipId, tuple);
      }
    },
    setMasterVolume: (volume: number) => {
      runtimeRef.current?.audio.setMasterVolume(volume);
    },
    metrics: () => runtimeRef.current?.scheduler.metrics() ?? null,
  };
}
