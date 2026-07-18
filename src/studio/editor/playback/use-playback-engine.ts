"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportPerfMetric } from "@/lib/performance";
import {
  normalizeClipTransform,
  type ClipTransform,
} from "../clipTransform";
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

function transformTuple(
  effects: ClipEffects | undefined,
): [number, number, number, number] {
  const transform = normalizeClipTransform(effects);
  return [transform.scale, transform.x, transform.y, transform.rotation];
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
    // Warm audio even when video isn't ready yet (new beds added mid-play).
    void this.audio.prepare(slice, this.mediaRef.current).then(() => {
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
    const valid = decoded.filter((item): item is DecodedFrame => item != null);
    if (valid.length < slice.video.length) {
      for (const item of valid) item.frame.close();
      return false;
    }
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
    this.prepared = {
      slice,
      generation,
      frameA: valid[0]?.frame,
      frameB: valid[1]?.frame,
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
    await this.compositor.render({
      frameA: prepared.frameA,
      frameB: prepared.frameB,
      transformA: transformTuple(prepared.slice.video[0]?.clip.clip.effects),
      transformB: transformTuple(prepared.slice.video[1]?.clip.clip.effects),
      transition: slice.transition?.type,
      progress: slice.transition?.progress,
      texts: slice.text
        .filter((item) => Boolean(item.clip.text?.text))
        .map((item) => {
          const local = slice.timelineTime - item.timelineStart;
          const duration = item.timelineEnd - item.timelineStart;
          const animation = textAnimationStyle(
            item.clip.text?.animation,
            item.clip.text?.animationDuration ?? 0.5,
            local,
            duration,
          );
          const translateY = /translateY\((-?[\d.]+)px\)/.exec(
            animation.transform,
          );
          const scale = /scale\(([\d.]+)\)/.exec(animation.transform);
          return {
            text: item.clip.text?.text ?? "",
            fontSize: item.clip.text?.fontSize ?? 42,
            color: item.clip.text?.color ?? "#fff",
            align: item.clip.text?.align ?? "center",
            opacity:
              animation.opacity *
              clipOpacityAtLocalTime(item.clip.effects, duration, local),
            translateY: translateY ? Number(translateY[1]) : 0,
            scale: scale ? Number(scale[1]) : 1,
          };
        }),
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
  metrics: () => SchedulerMetrics | null;
};

export function usePlaybackEngine(args: {
  project: EditorProject;
  playhead: number;
  playing: boolean;
  mediaById: ReadonlyMap<string, EditorMediaItem>;
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
    try {
      const audio = new AudioMixer();
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
      let resumeAfterBuffer = false;
      const scheduler = new FrameScheduler(plan, clock, consumer, {
        onTime: (time) => {
          emittedTimeRef.current = time;
          callbacksRef.current.onPlayheadChange(time);
        },
        onBuffering: (value) => {
          if (value && clock.playing) {
            clock.pause();
            audio.stopAll();
            resumeAfterBuffer = true;
          } else if (!value && resumeAfterBuffer && playingRef.current) {
            resumeAfterBuffer = false;
            clock.play();
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
          // Decode the first frame before starting the monotonic clock.
          await runtime.scheduler.renderNow(runtime.clock.currentTime());
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
    if (playing && Math.abs(playhead - emittedTimeRef.current) < 0.08) return;
    runtime.clock.seek(playhead);
    runtime.audio.stopAll();
    void runtime.scheduler.renderNow(playhead).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [playhead, playing]);

  // Proxy URLs and signed URLs arrive asynchronously after the project is
  // hydrated. Repaint a paused preview when media resolution changes.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || playingRef.current) return;
    setError(null);
    void runtime.scheduler.renderNow(runtime.clock.currentTime()).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [mediaById]);

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
    metrics: () => runtimeRef.current?.scheduler.metrics() ?? null,
  };
}
