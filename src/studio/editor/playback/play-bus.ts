import type { EditorMediaItem } from "../types";
import { clipSpeed } from "../projectContract";
import {
  DEFAULT_PREVIEW_LOAD_QUALITY,
  playbackUrlForMedia,
} from "../previewLoadQuality";
import type { PlaybackPlan, RenderSlice, VideoSample } from "./timeline-compiler";
import { sliceAt } from "./timeline-compiler";

export type PlayBusSlot = {
  clipId: string;
  assetId: string;
  url: string;
  trimIn: number;
  trimOut: number;
  timelineStart: number;
  timelineEnd: number;
  speed: number;
};

export type PlayBusStackFrame = {
  frame?: VideoFrame;
  textureKey?: string;
  width?: number;
  height?: number;
  /** Index into slice.video (top→bottom) for opacity/transform. */
  sampleIndex: number;
};

export type PlayBusFrames = {
  frameA?: VideoFrame;
  frameB?: VideoFrame;
  textureKeyA?: string;
  textureKeyB?: string;
  widthA?: number;
  heightA?: number;
  widthB?: number;
  heightB?: number;
  assetIdA?: string;
  /** Middle picture lanes (between top A and bottom B), bottom→top paint order. */
  stack?: PlayBusStackFrame[];
  /** Every video lane keyed by slice.video index (stills are omitted). */
  layers?: PlayBusStackFrame[];
};

type SlotId = "a" | "b";

type SlotState = {
  assignment: PlayBusSlot | null;
  video: HTMLVideoElement;
  /** Last sourceTime we seeked to while paused / assigning. */
  parkedSource: number;
  /** rVFC presented count — skip capture when unchanged. */
  presented: number;
  lastCaptured: number;
  rvfcId: number | null;
  /** Index into slice.video when this is a middle stack slot. */
  sampleIndex?: number;
};

export type PlayBusOptions = {
  createVideo?: () => HTMLVideoElement;
  previewLoadQuality?: number;
};

const HAVE_CURRENT_DATA = 2;
/**
 * Top + bottom use A/B; remaining slots hold middle stacked lanes.
 * Keep in sync with MAX_PREVIEW_VIDEO_STACK (8) in timeline-compiler.
 * Do not import that const at module init — circular eval can leave it undefined.
 */
const MAX_STACK_SLOTS = 6;

function makeVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  // Keep out of layout / accessibility tree.
  video.setAttribute("aria-hidden", "true");
  video.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:0";
  if (typeof document !== "undefined" && document.body) {
    document.body.appendChild(video);
  }
  return video;
}

function slotFromSample(sample: VideoSample, url: string): PlayBusSlot {
  const clip = sample.clip;
  return {
    clipId: clip.clipId,
    assetId: clip.assetId!,
    url,
    trimIn: clip.sourceStart,
    trimOut: clip.sourceEnd,
    timelineStart: clip.timelineStart,
    timelineEnd: clip.timelineEnd,
    speed: Math.max(0.1, clipSpeed(clip.clip.effects)),
  };
}

/**
 * Realtime play clock + hidden HTMLVideoElements (program + partner + middles).
 * Time never waits on decode — Chrome owns GOP/Range/hardware decode.
 */
export class PlayBus {
  private readonly mediaRef: { current: ReadonlyMap<string, EditorMediaItem> };
  private previewLoadQuality: number;
  private readonly createVideo: () => HTMLVideoElement;
  private duration = 0;
  private playing = false;
  private pausedTimeline = 0;
  /** Wall-clock fallback when every picture lane is a still (no HTMLVideo clock). */
  private stillPlayOriginSec = 0;
  private stillPlayOriginPerf = 0;
  private plan: PlaybackPlan | null = null;
  private paintedOnce = false;
  private waiting = false;
  private corsWarned = false;
  private disposed = false;
  private program: SlotId = "a";
  private readonly slots: Record<SlotId, SlotState>;
  /** Middle stacked lanes (slice.video[1..n-2]), paint order bottom→top. */
  private readonly stackSlots: SlotState[];
  private onWaitingChange: ((waiting: boolean) => void) | null = null;
  private syncChain: Promise<void> = Promise.resolve();

  constructor(
    mediaRef: { current: ReadonlyMap<string, EditorMediaItem> },
    options: PlayBusOptions = {},
  ) {
    this.mediaRef = mediaRef;
    this.previewLoadQuality =
      options.previewLoadQuality ?? DEFAULT_PREVIEW_LOAD_QUALITY;
    this.createVideo = options.createVideo ?? makeVideo;
    this.slots = {
      a: this.wrap(this.createVideo()),
      b: this.wrap(this.createVideo()),
    };
    this.stackSlots = [];
    for (let i = 0; i < MAX_STACK_SLOTS; i += 1) {
      this.stackSlots.push(this.wrap(this.createVideo()));
    }
  }

  private wrap(video: HTMLVideoElement): SlotState {
    const state: SlotState = {
      assignment: null,
      video,
      parkedSource: 0,
      presented: 0,
      lastCaptured: -1,
      rvfcId: null,
    };
    const onWaiting = () => this.refreshWaiting();
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("playing", onWaiting);
    video.addEventListener("canplay", onWaiting);
    video.addEventListener("seeked", onWaiting);
    this.armRvfc(state);
    return state;
  }

  private armRvfc(state: SlotState): void {
    const video = state.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        cb: (now: number, meta: { presentedFrames?: number }) => void,
      ) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    if (typeof video.requestVideoFrameCallback !== "function") return;
    const tick = () => {
      state.presented += 1;
      state.rvfcId = video.requestVideoFrameCallback!(tick);
    };
    state.rvfcId = video.requestVideoFrameCallback(tick);
  }

  setOnWaitingChange(cb: ((waiting: boolean) => void) | null): void {
    this.onWaitingChange = cb;
  }

  setPreviewLoadQuality(quality: number): void {
    this.previewLoadQuality = quality;
  }

  setDuration(duration: number): void {
    this.duration = Math.max(0, duration);
  }

  setPlan(plan: PlaybackPlan): void {
    this.plan = plan;
    this.duration = Math.max(this.duration, plan.duration);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get hasPainted(): boolean {
    return this.paintedOnce;
  }

  isWaiting(): boolean {
    return this.waiting;
  }

  private clockState(): SlotState | null {
    const program = this.slots[this.program];
    if (program.assignment) return program;
    const partner = this.slots[this.program === "a" ? "b" : "a"];
    if (partner.assignment && partner.sampleIndex != null) return partner;
    for (const state of this.stackSlots) {
      if (state.assignment && state.sampleIndex != null) return state;
    }
    return null;
  }

  /**
   * Timeline seconds from a playing video lane. An image overlay must never
   * own this clock or middle video rows freeze / drop out of the composite.
   */
  timelineTime(): number {
    if (!this.playing) {
      return Math.max(0, Math.min(this.duration, this.pausedTimeline));
    }
    const state = this.clockState();
    const slot = state?.assignment;
    if (!slot || !state) {
      const elapsed = performance.now() / 1000 - this.stillPlayOriginPerf;
      return Math.max(
        0,
        Math.min(this.duration, this.stillPlayOriginSec + Math.max(0, elapsed)),
      );
    }
    const source = state.video.currentTime;
    const local = Math.max(0, (source - slot.trimIn) / slot.speed);
    const t = slot.timelineStart + local;
    return Math.max(0, Math.min(this.duration, t));
  }

  /**
   * Park program (and preroll partner) at the playhead while paused so Play
   * is not a cold src assign.
   */
  idleAt(
    plan: PlaybackPlan,
    timelineTime: number,
    mediaById?: ReadonlyMap<string, EditorMediaItem>,
  ): void {
    if (this.disposed) return;
    this.plan = plan;
    this.pausedTimeline = Math.max(0, Math.min(this.duration || plan.duration, timelineTime));
    const slice = sliceAt(plan, this.pausedTimeline);
    this.assignFromSlice(slice, mediaById ?? this.mediaRef.current, {
      playProgram: false,
    });
  }

  async play(
    plan: PlaybackPlan,
    timelineTime: number,
    mediaById?: ReadonlyMap<string, EditorMediaItem>,
  ): Promise<void> {
    if (this.disposed) return;
    this.plan = plan;
    this.duration = Math.max(this.duration, plan.duration);
    this.pausedTimeline = Math.max(0, Math.min(this.duration, timelineTime));
    this.stillPlayOriginSec = this.pausedTimeline;
    this.stillPlayOriginPerf = performance.now() / 1000;
    const slice = sliceAt(plan, this.pausedTimeline);
    await this.assignFromSlice(slice, mediaById ?? this.mediaRef.current, {
      playProgram: true,
    });
    this.playing = true;
    this.paintedOnce = false;
    this.refreshWaiting();
  }

  pause(): number {
    const t = this.timelineTime();
    this.playing = false;
    this.pausedTimeline = t;
    for (const id of ["a", "b"] as SlotId[]) {
      const state = this.slots[id];
      try {
        state.video.pause();
      } catch {
        /* ignore */
      }
    }
    for (const state of this.stackSlots) {
      try {
        state.video.pause();
      } catch {
        /* ignore */
      }
    }
    this.refreshWaiting();
    return t;
  }

  /**
   * Keep A/B/stack assignments in sync with the current slice (cuts + transitions).
   * Call from the play tick after reading timelineTime().
   */
  syncSlice(
    slice: RenderSlice,
    mediaById?: ReadonlyMap<string, EditorMediaItem>,
  ): void {
    if (this.disposed || !this.playing) return;
    this.syncChain = this.syncChain
      .then(() =>
        this.assignFromSlice(slice, mediaById ?? this.mediaRef.current, {
          playProgram: true,
        }),
      )
      .catch(() => undefined);
  }

  /**
   * Capture every playing video lane, tagged with slice.video index.
   * Stills are omitted — the play tick fills those from the PNG cache.
   */
  captureFrames(): PlayBusFrames {
    const out: PlayBusFrames = {};
    const layers: PlayBusStackFrame[] = [];
    const captureState = (state: SlotState) => {
      if (!state.assignment || state.sampleIndex == null) return;
      const frame = this.captureStackSlot(state);
      if (!frame) return;
      layers.push({
        frame,
        textureKey: `play:${state.sampleIndex}`,
        width: frame.displayWidth,
        height: frame.displayHeight,
        sampleIndex: state.sampleIndex,
      });
    };
    captureState(this.slots.a);
    captureState(this.slots.b);
    for (const state of this.stackSlots) captureState(state);
    if (layers.length) {
      out.layers = layers;
      out.stack = layers;
    }
    return out;
  }

  private captureStackSlot(state: SlotState): VideoFrame | null {
    // Stack layers re-upload every paint (no sticky GPU key across frames).
    if (state.video.readyState < HAVE_CURRENT_DATA) return null;
    try {
      const frame = new VideoFrame(state.video);
      state.lastCaptured = state.presented;
      this.paintedOnce = true;
      return frame;
    } catch {
      if (!this.corsWarned) {
        this.corsWarned = true;
        console.warn(
          "[PlayBus] VideoFrame(video) failed (CORS?). Skipping frame; not falling back to WebCodecs play.",
        );
      }
      return null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playing = false;
    const all = [this.slots.a, this.slots.b, ...this.stackSlots];
    for (const state of all) {
      const video = state.video as HTMLVideoElement & {
        cancelVideoFrameCallback?: (id: number) => void;
      };
      if (state.rvfcId != null && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(state.rvfcId);
      }
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      } catch {
        /* ignore */
      }
      state.assignment = null;
    }
  }

  private refreshWaiting(): void {
    const clock = this.clockState();
    const next =
      this.playing &&
      Boolean(clock?.assignment) &&
      Boolean(clock && (clock.video.readyState < HAVE_CURRENT_DATA || clock.video.seeking));
    if (next === this.waiting) return;
    this.waiting = next;
    this.onWaitingChange?.(next);
  }

  private resolveUrl(
    sample: VideoSample,
    mediaById: ReadonlyMap<string, EditorMediaItem>,
  ): string | null {
    const assetId = sample.clip.assetId;
    if (!assetId) return null;
    const media = mediaById.get(assetId);
    if (!media || media.kind !== "video") return null;
    return playbackUrlForMedia(media, this.previewLoadQuality) ?? null;
  }

  private async assignFromSlice(
    slice: RenderSlice,
    mediaById: ReadonlyMap<string, EditorMediaItem>,
    opts: { playProgram: boolean },
  ): Promise<void> {
    const videos = slice.video;
    const stacking = !slice.transition && videos.length >= 2;

    type VideoBind = { sample: VideoSample; sampleIndex: number; url: string };
    const binds: VideoBind[] = [];
    for (let index = 0; index < videos.length; index += 1) {
      const sample = videos[index]!;
      const url = this.resolveUrl(sample, mediaById);
      if (!url) continue;
      binds.push({ sample, sampleIndex: index, url });
    }

    // Clock = bottom-most video so an image overlay never owns transport.
    // During a transition prefer the outgoing (then incoming) movie.
    let clock: VideoBind | null = null;
    if (slice.transition) {
      clock =
        binds.find((bind) => bind.sample.role === "outgoing") ??
        binds.find((bind) => bind.sample.role === "incoming") ??
        binds[binds.length - 1] ??
        null;
    } else if (binds.length) {
      clock = binds.reduce((best, bind) =>
        bind.sampleIndex > best.sampleIndex ? bind : best,
      );
    }

    const rest = clock
      ? binds.filter((bind) => bind.sampleIndex !== clock!.sampleIndex)
      : binds;
    // Top-most remaining video on the partner element; extras on stack slots.
    const partnerLive = rest[0] ?? null;
    const stackBinds = rest.slice(1, 1 + MAX_STACK_SLOTS);

    const prerollSample =
      !slice.transition && videos.length <= 1 ? slice.preload[0] ?? null : null;
    const prerollUrl = prerollSample ? this.resolveUrl(prerollSample, mediaById) : null;
    const partnerBind = partnerLive;
    const prerollWant =
      !partnerBind && prerollSample && prerollUrl
        ? slotFromSample(prerollSample, prerollUrl)
        : null;

    const wantProgram = clock ? slotFromSample(clock.sample, clock.url) : null;
    const wantPartner = partnerBind
      ? slotFromSample(partnerBind.sample, partnerBind.url)
      : prerollWant;

    if (
      wantProgram &&
      this.slots[this.program].assignment?.clipId !== wantProgram.clipId
    ) {
      const other: SlotId = this.program === "a" ? "b" : "a";
      if (this.slots[other].assignment?.clipId === wantProgram.clipId) {
        this.program = other;
      }
    }

    this.slots[this.program].sampleIndex = clock?.sampleIndex;
    await this.ensureSlot(this.program, wantProgram, {
      play: opts.playProgram,
      sourceTime: clock?.sample.sourceTime,
    });

    const partnerId: SlotId = this.program === "a" ? "b" : "a";
    this.slots[partnerId].sampleIndex = partnerBind?.sampleIndex;
    await this.ensureSlot(partnerId, wantPartner, {
      play: Boolean(opts.playProgram && (slice.transition || stacking) && partnerBind),
      sourceTime: partnerBind?.sample.sourceTime ?? wantPartner?.trimIn,
      preroll: Boolean(prerollWant && !partnerBind),
    });

    const stackPlay = Boolean(
      opts.playProgram && (stacking || (slice.transition && stackBinds.length > 0)),
    );
    for (let i = 0; i < this.stackSlots.length; i += 1) {
      const bind = stackBinds[i];
      const want = bind ? slotFromSample(bind.sample, bind.url) : null;
      const state = this.stackSlots[i]!;
      state.sampleIndex = bind?.sampleIndex;
      await this.ensureSlotState(state, want, {
        play: Boolean(stackPlay && want),
        sourceTime: bind?.sample.sourceTime ?? want?.trimIn,
        preroll: false,
      });
    }

    this.refreshWaiting();
  }

  private async ensureSlot(
    id: SlotId,
    next: PlayBusSlot | null,
    opts: { play: boolean; sourceTime?: number; preroll?: boolean },
  ): Promise<void> {
    await this.ensureSlotState(this.slots[id], next, opts);
  }

  private async ensureSlotState(
    state: SlotState,
    next: PlayBusSlot | null,
    opts: { play: boolean; sourceTime?: number; preroll?: boolean },
  ): Promise<void> {
    if (!next) {
      if (state.assignment) {
        try {
          state.video.pause();
        } catch {
          /* ignore */
        }
        state.assignment = null;
      }
      return;
    }

    const sameClip =
      state.assignment?.clipId === next.clipId &&
      state.assignment?.url === next.url;
    const sourceTarget =
      opts.sourceTime ??
      (opts.preroll ? next.trimIn : next.trimIn);

    if (!sameClip) {
      state.assignment = next;
      state.lastCaptured = -1;
      const video = state.video;
      if (video.src !== next.url) {
        video.src = next.url;
      }
      video.playbackRate = next.speed;
      await this.seekVideo(video, sourceTarget);
      state.parkedSource = sourceTarget;
    } else {
      state.assignment = next;
      state.video.playbackRate = next.speed;
      const drift = Math.abs(state.video.currentTime - sourceTarget);
      // Only force-seek when paused park / cut swap / large drift — never
      // keyframe-seek the playing program every tick.
      if (!opts.play || drift > 0.35) {
        if (drift > 0.05) {
          await this.seekVideo(state.video, sourceTarget);
          state.parkedSource = sourceTarget;
        }
      }
    }

    if (opts.play) {
      try {
        await state.video.play();
      } catch {
        /* autoplay / abort — next tick retries via syncSlice */
      }
    } else {
      try {
        state.video.pause();
      } catch {
        /* ignore */
      }
    }
  }

  private seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      if (!Number.isFinite(time)) {
        resolve();
        return;
      }
      const target = Math.max(0, time);
      if (Math.abs(video.currentTime - target) < 0.04 && video.readyState >= HAVE_CURRENT_DATA) {
        resolve();
        return;
      }
      const done = () => {
        video.removeEventListener("seeked", done);
        video.removeEventListener("error", done);
        resolve();
      };
      video.addEventListener("seeked", done, { once: true });
      video.addEventListener("error", done, { once: true });
      try {
        video.currentTime = target;
      } catch {
        done();
      }
      // If already at target and loaded, seeked may not fire.
      const timeout = globalThis.setTimeout ?? setTimeout;
      timeout(done, 80);
    });
  }
}
