"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportPerfMetric } from "@/lib/performance";
import {
  normalizeClipTransform,
  type ClipTransform,
} from "../clipTransform";
import { normalizeTextTransform } from "../textLayout";
import { clipOpacityAtLocalTime, textClipAnimationStyle } from "../editorEffects";
import type { ClipEffects, EditorMediaItem, EditorProject } from "../types";
import { AudioMixer } from "./audio-mixer";
import { CompositorClient } from "./compositor-client";
import {
  detectDecoderCapabilities,
  MediaDecoderClient,
} from "./media-decoder-client";
import { FrameScheduler, type FrameConsumer, type SchedulerMetrics } from "./frame-scheduler";
import { compileTimeline, pictureStackPlan, playbackSignature, sliceAt } from "./timeline-compiler";
import type { PlaybackPlan, RenderSlice } from "./timeline-compiler";
import { TransportClock } from "./transport-clock";
import { isLegacySystemFont, loadGoogleFont } from "../loadGoogleFont";
import { clipSpeed } from "../projectContract";
import { playbackEndTime } from "../editorState";
import {
  DEFAULT_PREVIEW_LOAD_QUALITY,
  playbackUrlForMedia,
  previewImageMaxEdge,
} from "../previewLoadQuality";
import { previewTransitionWhilePlaying } from "./preview-transition-play";
import { setEditorPlaybackBusy } from "../filmstripGate";
import { PlayBus } from "./play-bus";

/**
 * Spinner only after a lasting cold-buffer on PlayBus (element waiting before
 * first paint). Clock never holds.
 */
const BUFFER_SPINNER_DELAY_MS = 400;

/** Transient decode waits — buffer/underrun / skip frame, never a red preview banner. */
export function isSoftDecodeFailure(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  return (
    /frame decode timeout/i.test(message) ||
    /no video sample at requested time/i.test(message)
  );
}

function clockDuration(project: EditorProject, playing: boolean): number {
  if (playing) {
    const end = playbackEndTime(project);
    if (end > 0) return end;
  }
  return compileTimeline(project).duration;
}

/** Idle: open demux so paused scrub is warm (not used for live play). */
function warmPlayheadVideos(
  decoder: MediaDecoderClient | null,
  plan: PlaybackPlan,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  timelineTime: number,
  generation: number,
  previewLoadQuality: number = DEFAULT_PREVIEW_LOAD_QUALITY,
): void {
  if (!decoder) return;
  const slice = sliceAt(plan, timelineTime);
  for (const sample of slice.video) {
    const assetId = sample.clip.assetId;
    if (!assetId) continue;
    const media = mediaById.get(assetId);
    const url = playbackUrlForMedia(media, previewLoadQuality);
    if (!media || media.kind !== "video" || !url) continue;
    decoder.warm(assetId, url, sample.sourceTime, generation);
  }
}

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
      const animation = textClipAnimationStyle(item.clip.text, local, duration);
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
  decoder: MediaDecoderClient | null;
  compositor: CompositorClient;
  audio: AudioMixer;
  consumer: EngineConsumer;
  playBus: PlayBus;
};

type Prepared = {
  slice: RenderSlice;
  generation: number;
  frameA?: VideoFrame;
  frameB?: VideoFrame;
  textureKeyA?: string;
  textureKeyB?: string;
  stack?: Array<{
    frame?: VideoFrame;
    textureKey?: string;
    transform: [number, number, number, number];
    opacity: number;
    width?: number;
    height?: number;
  }>;
};

class EngineConsumer implements FrameConsumer {
  private readonly decoder: MediaDecoderClient | null;
  private readonly compositor: CompositorClient;
  private readonly audio: AudioMixer;
  private playBus: PlayBus | null = null;
  private readonly mediaRef: React.MutableRefObject<ReadonlyMap<string, EditorMediaItem>>;
  private readonly previewLoadQualityRef: React.MutableRefObject<number>;
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
  private readonly warmedStills = new Set<string>();
  private transitionKey: string | null = null;
  private transitionStartedAt = 0;

  constructor(args: {
    decoder: MediaDecoderClient | null;
    compositor: CompositorClient;
    audio: AudioMixer;
    mediaRef: React.MutableRefObject<ReadonlyMap<string, EditorMediaItem>>;
    previewLoadQualityRef: React.MutableRefObject<number>;
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
    this.previewLoadQualityRef = args.previewLoadQualityRef;
    this.playingRef = args.playingRef;
    this.onAudioReady = args.onAudioReady;
    this.onSourceSize = args.onSourceSize;
  }

  setPlayBus(playBus: PlayBus | null): void {
    this.playBus = playBus;
  }

  isPlayWaiting(): boolean {
    return this.playBus?.isWaiting() ?? false;
  }

  hasPlayPainted(): boolean {
    return this.playBus?.hasPainted ?? false;
  }

  /**
   * Live play — never awaits decode. Clock is PlayBus; compositor paint is FF.
   */
  paintPlay(slice: RenderSlice, generation: number): void {
    const bus = this.playBus;
    if (!bus || !this.playingRef.current) return;

    const transitionKey = slice.transition?.key ?? null;
    if (transitionKey && transitionKey !== this.transitionKey) {
      this.transitionKey = transitionKey;
      this.transitionStartedAt = performance.now();
    } else if (!transitionKey) {
      this.transitionKey = null;
    }

    bus.syncSlice(slice, this.mediaRef.current);
    const captured = bus.captureFrames();
    const byIndex = new Map(
      (captured.layers ?? captured.stack ?? []).map((layer) => [layer.sampleIndex, layer]),
    );
    const roles = pictureStackPlan(slice);
    const opacityFor = (sample: RenderSlice["video"][number] | undefined) => {
      if (!sample) return 1;
      const duration = sample.clip.timelineEnd - sample.clip.timelineStart;
      const local = slice.timelineTime - sample.clip.timelineStart;
      return clipOpacityAtLocalTime(sample.clip.clip.effects, duration, local);
    };

    const stillForSample = (
      sample: (typeof slice.video)[number] | undefined,
    ): { frame?: VideoFrame; textureKey: string } | null => {
      if (!sample?.clip.assetId) return null;
      const media = this.mediaRef.current.get(sample.clip.assetId);
      if (media?.kind !== "image") return null;
      const url = playbackUrlForMedia(media, this.previewLoadQualityRef.current);
      if (!url) return null;
      const key = `image:${sample.clip.assetId}`;
      const cacheKey = `${sample.clip.assetId}@${previewImageMaxEdge(this.previewLoadQualityRef.current)}:${url}`;
      const cached = this.imageFrames.get(cacheKey);
      void this.imageFrame(sample.clip.assetId, url, this.previewLoadQualityRef.current);
      if (!this.warmedStills.has(key) && cached) {
        return { frame: cached.clone(), textureKey: key };
      }
      return { textureKey: key };
    };

    const usedBusFrames = new Set<VideoFrame>();
    const resolveLane = (index: number) => {
      const sample = slice.video[index];
      if (!sample) return null;
      const still = stillForSample(sample);
      if (still) {
        return {
          sample,
          frame: still.frame,
          textureKey: still.textureKey,
          width: still.frame?.displayWidth,
          height: still.frame?.displayHeight,
        };
      }
      const fromBus = byIndex.get(index);
      if (fromBus?.frame) usedBusFrames.add(fromBus.frame);
      if (!fromBus) return { sample, frame: undefined, textureKey: undefined };
      return {
        sample,
        frame: fromBus.frame,
        textureKey: fromBus.textureKey,
        width: fromBus.width,
        height: fromBus.height,
      };
    };

    const top = roles.topIndex >= 0 ? resolveLane(roles.topIndex) : null;
    const bottom =
      roles.bottomIndex >= 0 && roles.bottomIndex !== roles.topIndex
        ? resolveLane(roles.bottomIndex)
        : null;
    const stack: Array<{
      frame?: VideoFrame;
      textureKey?: string;
      transform: [number, number, number, number];
      opacity: number;
      width?: number;
      height?: number;
    }> = [];
    for (let i = roles.middleIndexes.length - 1; i >= 0; i -= 1) {
      const layer = resolveLane(roles.middleIndexes[i]!);
      if (!layer || (!layer.frame && !layer.textureKey)) continue;
      stack.push({
        frame: layer.frame,
        textureKey: layer.textureKey,
        transform: transformTuple(layer.sample.clip.clip.effects),
        opacity: opacityFor(layer.sample),
        width: layer.width,
        height: layer.height,
      });
    }
    for (const layer of captured.layers ?? captured.stack ?? []) {
      if (layer.frame && !usedBusFrames.has(layer.frame)) {
        try {
          layer.frame.close();
        } catch {
          /* already closed */
        }
      }
    }

    const sampleA = top?.sample;
    const sampleB = bottom?.sample;
    const frameA = top?.frame;
    const frameB = bottom?.frame;
    const textureKeyA = top?.textureKey;
    const textureKeyB = bottom?.textureKey;

    if (sampleA?.clip.assetId && top?.width && top.height) {
      this.onSourceSize({
        assetId: sampleA.clip.assetId,
        width: top.width,
        height: top.height,
      });
    } else if (sampleB?.clip.assetId && bottom?.width && bottom.height) {
      this.onSourceSize({
        assetId: sampleB.clip.assetId,
        width: bottom.width,
        height: bottom.height,
      });
    }

    const textsUnder = mapTextItems(slice.textUnder, slice.timelineTime);
    const textsOver = mapTextItems(slice.textOver, slice.timelineTime);

    const painted = this.compositor.paint({
      frameA,
      frameB,
      textureKeyA,
      textureKeyB,
      transformA: transformTuple(sampleA?.clip.clip.effects),
      transformB: transformTuple(sampleB?.clip.clip.effects),
      opacityA: opacityFor(sampleA),
      opacityB: opacityFor(sampleB),
      stack: stack.length ? stack : undefined,
      transition: previewTransitionWhilePlaying(slice.transition?.type, true),
      progress: slice.transition?.progress,
      textsUnder,
      textsOver,
    });
    if (painted && textureKeyA?.startsWith("image:")) {
      this.warmedStills.add(textureKeyA);
    }
    if (painted && textureKeyB?.startsWith("image:")) {
      this.warmedStills.add(textureKeyB);
    }
    if (painted) {
      for (const layer of stack) {
        if (layer.textureKey?.startsWith("image:")) this.warmedStills.add(layer.textureKey);
      }
    }

    if (slice.transition && this.transitionStartedAt > 0 && painted) {
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

    void this.audio.prepare(slice, this.mediaRef.current).then(() => {
      this.onAudioReady();
    });
    this.audio.sync(slice, generation, this.mediaRef.current, true);
  }

  /** Paused scrub — WebCodecs exact frames. */
  async prepare(slice: RenderSlice, generation: number): Promise<boolean> {
    this.closePrepared();
    if (!this.decoder) return false;
    const transitionKey = slice.transition?.key ?? null;
    if (transitionKey && transitionKey !== this.transitionKey) {
      this.transitionKey = transitionKey;
      this.transitionStartedAt = performance.now();
    } else if (!transitionKey) {
      this.transitionKey = null;
    }
    const audioReady = this.audio.prepare(slice, this.mediaRef.current).then(() => {
      this.onAudioReady();
    });
    type DecodedLayer = {
      assetId: string;
      sourceTime: number;
      generation: number;
      frame?: VideoFrame;
      textureKey?: string;
      width?: number;
      height?: number;
      sample: (typeof slice.video)[number];
    };
    const decodeSample = async (
      sample: (typeof slice.video)[number],
    ): Promise<DecodedLayer | null> => {
      const assetId = sample.clip.assetId;
      if (!assetId) return null;
      const media = this.mediaRef.current.get(assetId);
      const url = playbackUrlForMedia(media, this.previewLoadQualityRef.current);
      if (!media || !url) return null;
      if (media.kind === "image") {
        const frame = await this.imageFrame(
          assetId,
          url,
          this.previewLoadQualityRef.current,
        );
        const textureKey = `image:${assetId}`;
        const warmed = this.warmedStills.has(textureKey);
        return {
          assetId,
          sourceTime: sample.sourceTime,
          generation,
          textureKey,
          frame: warmed ? undefined : frame.clone(),
          width: frame.displayWidth,
          height: frame.displayHeight,
          sample,
        };
      }
      try {
        const decoded = await this.decoder!.requestFrame(
          assetId,
          url,
          sample.sourceTime,
          generation,
          {
            speed: clipSpeed(sample.clip.clip.effects),
            aheadSec: 0.35,
            exact: true,
            soft: false,
          },
        );
        if (!decoded) return null;
        return {
          ...decoded,
          textureKey: `video:${assetId}:${sample.sourceTime.toFixed(3)}`,
          sample,
        };
      } catch {
        return null;
      }
    };
    const decoded = await Promise.all(slice.video.map((sample) => decodeSample(sample)));
    void audioReady;
    const valid = decoded.filter((item): item is NonNullable<typeof item> => item != null);
    const hasText = slice.textOver.length > 0 || slice.textUnder.length > 0;
    if (valid.length === 0 && slice.video.length > 0 && !hasText) {
      this.audio.sync(slice, generation, this.mediaRef.current, false);
      return false;
    }
    this.onAudioReady();
    const roles = pictureStackPlan(slice);
    const top = roles.topIndex >= 0 ? decoded[roles.topIndex] ?? undefined : undefined;
    const bottom =
      roles.bottomIndex >= 0 && roles.bottomIndex !== roles.topIndex
        ? decoded[roles.bottomIndex] ?? undefined
        : undefined;
    const middles = roles.middleIndexes
      .map((index) => decoded[index])
      .filter((item): item is NonNullable<typeof item> => item != null)
      .reverse();
    const primary = top ?? bottom ?? valid[0];
    this.onSourceSize(
      primary
        ? {
            assetId: primary.assetId,
            width: primary.width ?? primary.frame?.displayWidth ?? 0,
            height: primary.height ?? primary.frame?.displayHeight ?? 0,
          }
        : null,
    );
    // Match compositor lanes to slice.video indexes so a failed middle decode
    // cannot steal top/bottom (or hide videos under an image overlay).
    const frameA = top?.frame;
    let frameB = bottom?.frame;
    if (frameA && frameB && frameA === frameB) {
      frameB = frameA.clone();
    }
    this.prepared = {
      slice,
      generation,
      frameA,
      frameB,
      textureKeyA: top?.textureKey,
      textureKeyB: bottom?.textureKey,
      stack: middles.map((item) => {
        const sample = item.sample;
        const duration = sample.clip.timelineEnd - sample.clip.timelineStart;
        const local = slice.timelineTime - sample.clip.timelineStart;
        return {
          frame: item.frame,
          textureKey: item.textureKey,
          transform: transformTuple(sample.clip.clip.effects),
          opacity: clipOpacityAtLocalTime(sample.clip.clip.effects, duration, local),
          width: item.width ?? item.frame?.displayWidth,
          height: item.height ?? item.frame?.displayHeight,
        };
      }),
    };

    for (const sample of [...slice.video, ...slice.preload]) {
      if (!sample.clip.assetId) continue;
      const media = this.mediaRef.current.get(sample.clip.assetId);
      const url = playbackUrlForMedia(media, this.previewLoadQualityRef.current);
      if (url && media?.kind === "video") {
        this.decoder.prefetch(
          sample.clip.assetId,
          url,
          sample.sourceTime,
          generation,
          2.0,
        );
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
    const videos = prepared.slice.video;
    const roles = pictureStackPlan(prepared.slice);
    const sampleA = roles.topIndex >= 0 ? videos[roles.topIndex] : undefined;
    const sampleB =
      roles.bottomIndex >= 0 && roles.bottomIndex !== roles.topIndex
        ? videos[roles.bottomIndex]
        : undefined;
    const opacityFor = (sample: typeof sampleA | undefined) => {
      if (!sample) return 1;
      const duration = sample.clip.timelineEnd - sample.clip.timelineStart;
      const local = slice.timelineTime - sample.clip.timelineStart;
      return clipOpacityAtLocalTime(sample.clip.clip.effects, duration, local);
    };
    await this.compositor.render({
      frameA: prepared.frameA,
      frameB: prepared.frameB,
      textureKeyA: prepared.textureKeyA,
      textureKeyB: prepared.textureKeyB,
      transformA: transformTuple(sampleA?.clip.clip.effects),
      transformB: transformTuple(sampleB?.clip.clip.effects),
      opacityA: opacityFor(sampleA),
      opacityB: opacityFor(sampleB),
      // Overlay lanes stay painted through a transition window; dropping the stack
      // here made every extra media row vanish while paused or scrubbing over one.
      stack: prepared.stack?.length ? prepared.stack : undefined,
      transition: previewTransitionWhilePlaying(
        slice.transition?.type,
        this.playingRef.current,
      ),
      progress: slice.transition?.progress,
      textsUnder,
      textsOver,
    });
    const warm = (key?: string) => {
      if (key?.startsWith("image:")) this.warmedStills.add(key);
    };
    warm(prepared.textureKeyA);
    warm(prepared.textureKeyB);
    for (const layer of prepared.stack ?? []) warm(layer.textureKey);
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
    this.clearImageFrames();
  }

  /** Drop cached stills when preview quality / signed URLs change. */
  clearImageFrames(): void {
    for (const frame of this.imageFrames.values()) frame.close();
    this.imageFrames.clear();
    this.imageLoads.clear();
    this.warmedStills.clear();
  }

  private imageFrame(
    assetId: string,
    url: string,
    quality: number,
  ): Promise<VideoFrame> {
    const cacheKey = `${assetId}@${previewImageMaxEdge(quality)}:${url}`;
    const cached = this.imageFrames.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    const pending = this.imageLoads.get(cacheKey);
    if (pending) return pending;
    const maxEdge = previewImageMaxEdge(quality);
    const request = fetch(url, { credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(`Image preview failed (${response.status}).`);
        return response.blob();
      })
      .then((blob) =>
        createImageBitmap(blob, {
          // Decode straight; upload path premultiplies for GPU filter + over.
          premultiplyAlpha: "none",
          colorSpaceConversion: "default",
        }).then(async (full) => {
          const scale = Math.min(1, maxEdge / Math.max(full.width, full.height, 1));
          if (scale >= 0.999) return full;
          try {
            const scaled = await createImageBitmap(full, {
              resizeWidth: Math.max(1, Math.round(full.width * scale)),
              resizeHeight: Math.max(1, Math.round(full.height * scale)),
              // Medium is much cheaper than high for multi‑megapixel PNGs.
              resizeQuality: "medium",
              premultiplyAlpha: "none",
            });
            full.close();
            return scaled;
          } catch {
            return full;
          }
        }),
      )
      .then((bitmap) => {
        const frame = new VideoFrame(bitmap, { timestamp: 0 });
        bitmap.close();
        this.imageFrames.set(cacheKey, frame);
        this.imageLoads.delete(cacheKey);
        return frame;
      })
      .catch((error) => {
        this.imageLoads.delete(cacheKey);
        throw error;
      });
    this.imageLoads.set(cacheKey, request);
    return request;
  }

  private closePrepared(): void {
    this.prepared?.frameA?.close();
    this.prepared?.frameB?.close();
    for (const layer of this.prepared?.stack ?? []) layer.frame?.close();
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
  previewTransform: (
    transform: ClipTransform,
    target?: "a" | "b",
  ) => void;
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
  /** 40–100; ≥80 prefers 1080 edit proxy, lower prefers faster 720. */
  previewLoadQuality?: number;
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
    previewLoadQuality = DEFAULT_PREVIEW_LOAD_QUALITY,
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
  const previewLoadQualityRef = useRef(previewLoadQuality);
  const playingRef = useRef(playing);
  const callbacksRef = useRef({ onPlayheadChange, onPlayingChange });
  const emittedTimeRef = useRef(playhead);
  const projectRef = useRef(project);
  const disposeTimerRef = useRef<number | null>(null);
  const metricsTimerRef = useRef<number | null>(null);
  const scrubRafRef = useRef<number | null>(null);
  const pendingScrubRef = useRef<number | null>(null);
  const scrubBusyRef = useRef(false);
  const bufferSpinnerTimerRef = useRef<number | null>(null);
  const playbackSignatureRef = useRef<string | null>(null);
  mediaRef.current = mediaById;
  previewLoadQualityRef.current = previewLoadQuality;
  playingRef.current = playing;
  callbacksRef.current = { onPlayheadChange, onPlayingChange };
  projectRef.current = project;

  // Pause timeline filmstrip HTML5 seeks while frames are flowing. While the
  // preview is buffering / cold-loading, release the gate so strip posters can
  // still paint — otherwise lanes stay on logos for the whole underrun.
  useEffect(() => {
    setEditorPlaybackBusy(playing && !buffering);
    return () => setEditorPlaybackBusy(false);
  }, [playing, buffering]);

  const canvasRef = useCallback((element: HTMLCanvasElement | null) => {
    setCanvas(element);
  }, []);

  const disposeRuntime = useCallback(() => {
    if (metricsTimerRef.current != null) {
      window.clearInterval(metricsTimerRef.current);
      metricsTimerRef.current = null;
    }
    if (bufferSpinnerTimerRef.current != null) {
      window.clearTimeout(bufferSpinnerTimerRef.current);
      bufferSpinnerTimerRef.current = null;
    }
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    runtime?.scheduler.stop();
    runtime?.consumer.dispose();
    runtime?.playBus.dispose();
    runtime?.decoder?.dispose();
    runtime?.compositor.dispose();
    void runtime?.audio.dispose();
  }, []);

  useEffect(() => {
    // Play uses HTMLVideoElement — WebCodecs is optional (scrub / frame-step).
    if (!canvas) return;
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
      audio.setNaturalAudioUrls(naturalAudioByClipId);
      const clock = new TransportClock(
        compileTimeline(projectRef.current).duration,
        audio.clockSeconds,
      );
      clock.seek(playhead);
      const decoder = capabilities.supported ? new MediaDecoderClient() : null;
      if (!capabilities.supported) {
        // Scrub exact frames unavailable — play still works via PlayBus.
        console.warn(
          "[playback]",
          capabilities.reason ?? "WebCodecs unavailable; scrub exact disabled.",
        );
      }
      const compositor = new CompositorClient(canvas, width, height);
      const playBus = new PlayBus(mediaRef, {
        previewLoadQuality: previewLoadQualityRef.current,
      });
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
        previewLoadQualityRef,
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
      consumer.setPlayBus(playBus);
      const plan = compileTimeline(projectRef.current);
      playBus.setPlan(plan);
      playBus.setDuration(plan.duration);
      playbackSignatureRef.current = playbackSignature(plan);
      const scheduler = new FrameScheduler(plan, clock, consumer, {
        loop: true,
        onTime: (time) => {
          emittedTimeRef.current = time;
          callbacksRef.current.onPlayheadChange(time);
        },
        onLoop: () => {
          const runtime = runtimeRef.current;
          if (!runtime || !playingRef.current) return;
          // Pin time at 0 immediately so the next rAF does not re-trigger ended().
          runtime.clock.setExternalTimeSource(() => 0);
          void runtime.playBus
            .play(runtime.plan, 0, mediaRef.current)
            .then(() => {
              if (!playingRef.current || runtimeRef.current !== runtime) return;
              runtime.clock.setExternalTimeSource(() => runtime.playBus.timelineTime());
              void runtime.audio.prepare(sliceAt(runtime.plan, 0), mediaRef.current).then(() => {
                if (!playingRef.current || runtimeRef.current !== runtime) return;
                runtime.audio.sync(
                  sliceAt(runtime.plan, runtime.clock.currentTime()),
                  runtime.clock.generation,
                  mediaRef.current,
                  true,
                );
              });
            });
        },
        onBuffering: (value) => {
          // Spinner only — clock never holds. Soft-pause audio on cold wait.
          if (value) {
            audio.softPause();
            if (bufferSpinnerTimerRef.current != null) return;
            bufferSpinnerTimerRef.current = window.setTimeout(() => {
              bufferSpinnerTimerRef.current = null;
              if (runtimeRef.current && playingRef.current) setBuffering(true);
            }, BUFFER_SPINNER_DELAY_MS);
            return;
          }
          if (bufferSpinnerTimerRef.current != null) {
            window.clearTimeout(bufferSpinnerTimerRef.current);
            bufferSpinnerTimerRef.current = null;
          }
          setBuffering(false);
          if (playingRef.current) {
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
          }
        },
        onEnded: () => callbacksRef.current.onPlayingChange(false),
        onError: (reason) => {
          if (isSoftDecodeFailure(reason)) return;
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
        playBus,
      };
      metricsTimerRef.current = window.setInterval(() => {
        const metrics = scheduler.metrics();
        const decoderMetrics = decoder?.metrics() ?? {
          pendingRequests: 0,
          framesReceived: 0,
          errors: 0,
          cacheBytes: 0,
        };
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
            playBus: 1,
          },
          "video-editor",
        );
      }, 10_000);
      playBus.idleAt(plan, playhead, mediaRef.current);
      void scheduler.renderNow(playhead).catch((reason) => {
        if (!runtimeRef.current || isSoftDecodeFailure(reason)) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    } catch (reason) {
      if (!isSoftDecodeFailure(reason)) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }
    return () => {
      disposeTimerRef.current = window.setTimeout(disposeRuntime, 0);
    };
    // Canvas owns one OffscreenCanvas transfer for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, disposeRuntime]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const plan = compileTimeline(project);
    runtime.plan = plan;
    runtime.scheduler.setPlan(plan);
    runtime.playBus.setPlan(plan);
    runtime.playBus.setDuration(clockDuration(projectRef.current, playingRef.current));
    runtime.clock.setDuration(clockDuration(projectRef.current, playingRef.current));
    const time = runtime.clock.currentTime();
    const slice = sliceAt(plan, time);
    // Only a timeline change touches media. Dragging a transform or restyling
    // text must not restart PlayBus / scrub decode.
    const signature = playbackSignature(plan);
    const structural = signature !== playbackSignatureRef.current;
    playbackSignatureRef.current = signature;
    if (structural) {
      runtime.audio.stopAll();
      runtime.decoder?.stopPlayback();
      if (playingRef.current) {
        void runtime.playBus.play(plan, time, mediaRef.current).then(() => {
          if (!playingRef.current || runtimeRef.current !== runtime) return;
          runtime.clock.setExternalTimeSource(() => runtime.playBus.timelineTime());
        });
      }
      void runtime.audio.prepare(slice, mediaRef.current).then(() => {
        if (!playingRef.current || runtimeRef.current !== runtime) return;
        runtime.audio.sync(
          sliceAt(runtime.plan, runtime.clock.currentTime()),
          runtime.clock.generation,
          mediaRef.current,
          true,
        );
      });
    }
    if (playingRef.current) return;
    runtime.playBus.idleAt(plan, time, mediaRef.current);
    warmPlayheadVideos(
      runtime.decoder,
      plan,
      mediaRef.current,
      time,
      runtime.clock.generation,
      previewLoadQualityRef.current,
    );
    void runtime.scheduler.renderNow(time).catch((reason) => {
      if (isSoftDecodeFailure(reason)) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [project]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    // Resizing an OffscreenCanvas clears its buffer — always repaint or the
    // preview stays blank after aspect-ratio changes (including while playing).
    runtime.compositor.resize(width, height);
    if (playingRef.current) return;
    void runtime.scheduler
      .renderNow(runtime.clock.currentTime())
      .catch((reason) => {
        if (isSoftDecodeFailure(reason)) return;
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
          runtime.decoder?.stopPlayback();
          const end = clockDuration(projectRef.current, true);
          runtime.clock.setDuration(end);
          runtime.playBus.setDuration(end);
          let startAt = time;
          if (end > 0 && startAt >= end - 0.0005) startAt = 0;
          // Do not await WebCodecs renderNow — PlayBus owns the first paint.
          void runtime.audio.prepare(sliceAt(runtime.plan, startAt), mediaRef.current).then(() => {
            if (!playingRef.current || runtimeRef.current !== runtime) return;
            runtime.audio.sync(
              sliceAt(runtime.plan, runtime.clock.currentTime()),
              runtime.clock.generation,
              mediaRef.current,
              true,
            );
          });
          await runtime.playBus.play(runtime.plan, startAt, mediaRef.current);
          if (!playingRef.current) return;
          runtime.clock.seek(startAt);
          runtime.clock.setExternalTimeSource(() => runtime.playBus.timelineTime());
          runtime.clock.play();
          runtime.scheduler.start();
        })
        .catch((reason) => {
          if (isSoftDecodeFailure(reason)) return;
          setError(reason instanceof Error ? reason.message : String(reason));
          callbacksRef.current.onPlayingChange(false);
        });
    } else {
      const pausedAt = runtime.playBus.pause();
      runtime.clock.pause();
      runtime.clock.seek(pausedAt);
      runtime.clock.setDuration(clockDuration(projectRef.current, false));
      runtime.scheduler.stop();
      runtime.audio.stopAll();
      runtime.decoder?.stopPlayback();
      runtime.playBus.idleAt(runtime.plan, pausedAt, mediaRef.current);
      warmPlayheadVideos(
        runtime.decoder,
        runtime.plan,
        mediaRef.current,
        pausedAt,
        runtime.clock.generation,
        previewLoadQualityRef.current,
      );
      void runtime.scheduler.renderNow(pausedAt).catch(() => undefined);
    }
  }, [playing]);

  /**
   * Keep one seek in flight and retarget it on completion. Firing a seek per
   * animation frame queues work behind the decoder, so a fast drag ends up
   * painting positions the playhead left seconds ago.
   */
  const drainScrub = useCallback(async () => {
    if (scrubBusyRef.current) return;
    scrubBusyRef.current = true;
    try {
      while (true) {
        const runtime = runtimeRef.current;
        const time = pendingScrubRef.current;
        if (!runtime || time == null || playingRef.current) return;
        pendingScrubRef.current = null;
        // Paused seek keeps decode generation so cached frames stay paintable.
        runtime.clock.seek(time);
        runtime.audio.stopAll();
        emittedTimeRef.current = time;
        runtime.playBus.idleAt(runtime.plan, time, mediaRef.current);
        const slice = sliceAt(runtime.plan, time);
        if (runtime.decoder) {
          for (const sample of slice.video) {
            const assetId = sample.clip.assetId;
            if (!assetId) continue;
            const media = mediaRef.current.get(assetId);
            const url = playbackUrlForMedia(media, previewLoadQualityRef.current);
            if (!media || media.kind !== "video" || !url) continue;
            runtime.decoder.scrub({
              assetId,
              url,
              sourceTime: sample.sourceTime,
              generation: runtime.clock.generation,
            });
          }
        }
        const paint = async () => {
          try {
            await runtime.scheduler.renderNow(time);
          } catch (reason) {
            if (!isSoftDecodeFailure(reason)) {
              setError(reason instanceof Error ? reason.message : String(reason));
            }
          }
        };
        await paint();
        if (pendingScrubRef.current != null) continue;
        await paint();
      }
    } finally {
      scrubBusyRef.current = false;
    }
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    // While playing, PlayBus owns time. Echoed onPlayheadChange must not seek.
    if (playing) return;
    pendingScrubRef.current = playhead;
    if (scrubRafRef.current != null) return;
    scrubRafRef.current = window.requestAnimationFrame(() => {
      scrubRafRef.current = null;
      void drainScrub();
    });
  }, [playhead, playing, drainScrub]);

  useEffect(() => {
    return () => {
      if (scrubRafRef.current != null) {
        window.cancelAnimationFrame(scrubRafRef.current);
        scrubRafRef.current = null;
      }
    };
  }, []);

  // Proxy URLs, signed URLs, and preview load quality can change after hydrate.
  const playbackUrlSignature = useMemo(() => {
    const parts: string[] = [];
    for (const media of mediaById.values()) {
      parts.push(
        `${media.assetId}:${media.kind}:${
          playbackUrlForMedia(media, previewLoadQuality) ?? ""
        }`,
      );
    }
    return parts.sort().join("|");
  }, [mediaById, previewLoadQuality]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setError(null);
    const time = runtime.clock.currentTime();
    const slice = sliceAt(runtime.plan, time);
    runtime.playBus.setPreviewLoadQuality(previewLoadQualityRef.current);
    runtime.decoder?.stopPlayback();
    runtime.consumer.clearImageFrames();
    if (playingRef.current) {
      void runtime.playBus.play(runtime.plan, time, mediaRef.current).then(() => {
        if (!playingRef.current || runtimeRef.current !== runtime) return;
        runtime.clock.setExternalTimeSource(() => runtime.playBus.timelineTime());
      });
    } else {
      runtime.playBus.idleAt(runtime.plan, time, mediaRef.current);
      if (runtime.decoder) {
        for (const sample of slice.video) {
          const assetId = sample.clip.assetId;
          if (!assetId) continue;
          const media = mediaRef.current.get(assetId);
          const url = playbackUrlForMedia(media, previewLoadQualityRef.current);
          if (!media || media.kind !== "video" || !url) continue;
          runtime.decoder.scrub({
            assetId,
            url,
            sourceTime: sample.sourceTime,
            generation: runtime.clock.generation,
          });
        }
      }
      warmPlayheadVideos(
        runtime.decoder,
        runtime.plan,
        mediaRef.current,
        time,
        runtime.clock.generation,
        previewLoadQualityRef.current,
      );
    }
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
        if (isSoftDecodeFailure(reason)) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    }
  }, [playbackUrlSignature]);

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
    supported: true,
    sourceSize,
    previewTransform: (transform, target = "a") => {
      runtimeRef.current?.compositor.updateTransform(
        [
          transform.scale,
          transform.x,
          transform.y,
          transform.rotation,
        ],
        target,
      );
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
