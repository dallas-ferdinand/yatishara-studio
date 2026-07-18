import type { PlaybackPlan, RenderSlice } from "./timeline-compiler";
import { sliceAt } from "./timeline-compiler";
import type { TransportClock } from "./transport-clock";

export type SchedulerMetrics = {
  requestedFrames: number;
  renderedFrames: number;
  droppedFrames: number;
  bufferingMs: number;
  maxLatenessMs: number;
};

export type FrameConsumer = {
  /**
   * Prepare all media needed for a slice. Implementations must discard work
   * whose generation no longer matches after a seek/project edit.
   */
  prepare(slice: RenderSlice, generation: number): Promise<boolean>;
  render(slice: RenderSlice, generation: number): Promise<void> | void;
};

export type SchedulerOptions = {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  onTime?: (time: number) => void;
  onBuffering?: (buffering: boolean) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  uiIntervalMs?: number;
};

const requestFrameDefault = (callback: FrameRequestCallback): number =>
  requestAnimationFrame(callback);
const cancelFrameDefault = (id: number): void => cancelAnimationFrame(id);

export class FrameScheduler {
  private plan: PlaybackPlan;
  private readonly clock: TransportClock;
  private readonly consumer: FrameConsumer;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly options: SchedulerOptions;
  private frameId: number | null = null;
  private started = false;
  private renderPending = false;
  private lastUiAt = 0;
  private bufferingSince: number | null = null;
  private metricsValue: SchedulerMetrics = {
    requestedFrames: 0,
    renderedFrames: 0,
    droppedFrames: 0,
    bufferingMs: 0,
    maxLatenessMs: 0,
  };

  constructor(
    plan: PlaybackPlan,
    clock: TransportClock,
    consumer: FrameConsumer,
    options: SchedulerOptions = {},
  ) {
    this.plan = plan;
    this.clock = clock;
    this.consumer = consumer;
    this.options = options;
    this.requestFrame = options.requestFrame ?? requestFrameDefault;
    this.cancelFrame = options.cancelFrame ?? cancelFrameDefault;
  }

  setPlan(plan: PlaybackPlan): void {
    this.plan = plan;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.queueFrame();
  }

  stop(): void {
    this.started = false;
    if (this.frameId != null) this.cancelFrame(this.frameId);
    this.frameId = null;
    this.finishBuffering(performance.now());
  }

  async renderNow(time = this.clock.currentTime()): Promise<void> {
    const generation = this.clock.generation;
    const slice = sliceAt(this.plan, time);
    const ready = await this.consumer.prepare(slice, generation);
    if (generation !== this.clock.generation) return;
    if (!ready) return;
    await this.consumer.render(slice, generation);
  }

  metrics(): SchedulerMetrics {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      ...this.metricsValue,
      bufferingMs:
        this.metricsValue.bufferingMs +
        (this.bufferingSince == null ? 0 : Math.max(0, now - this.bufferingSince)),
    };
  }

  private queueFrame(): void {
    if (!this.started || this.frameId != null) return;
    this.frameId = this.requestFrame((now) => {
      this.frameId = null;
      void this.tick(now);
    });
  }

  private async tick(now: number): Promise<void> {
    if (!this.started) return;
    this.metricsValue.requestedFrames += 1;
    const timelineTime = this.clock.currentTime();
    const generation = this.clock.generation;
    const uiInterval = this.options.uiIntervalMs ?? 33;
    if (now - this.lastUiAt >= uiInterval) {
      this.lastUiAt = now;
      this.options.onTime?.(timelineTime);
    }

    if (this.clock.ended()) {
      this.clock.pause();
      this.options.onTime?.(this.plan.duration);
      this.options.onEnded?.();
      this.stop();
      return;
    }

    if (this.renderPending) {
      this.metricsValue.droppedFrames += 1;
      this.queueFrame();
      return;
    }

    this.renderPending = true;
    const workStarted = performance.now();
    // If decode work outlasts a few frames, freeze the transport through the
    // buffering path. Otherwise the clock keeps running during the stall and
    // playback visibly skips forward once decode completes.
    const stallTimer = setTimeout(() => {
      if (this.bufferingSince == null && this.clock.playing) {
        this.bufferingSince = performance.now();
        this.options.onBuffering?.(true);
      }
    }, 150);
    try {
      const slice = sliceAt(this.plan, timelineTime);
      const ready = await this.consumer.prepare(slice, generation);
      if (!this.started || generation !== this.clock.generation) return;
      if (!ready) {
        if (this.bufferingSince == null) {
          this.bufferingSince = performance.now();
          this.options.onBuffering?.(true);
        }
        return;
      }
      this.finishBuffering(performance.now());
      await this.consumer.render(slice, generation);
      if (generation === this.clock.generation) {
        this.metricsValue.renderedFrames += 1;
      }
    } catch (reason) {
      if (generation === this.clock.generation) {
        this.options.onError?.(
          reason instanceof Error ? reason : new Error(String(reason)),
        );
      }
    } finally {
      clearTimeout(stallTimer);
      const elapsed = Math.max(0, performance.now() - workStarted);
      this.metricsValue.maxLatenessMs = Math.max(
        this.metricsValue.maxLatenessMs,
        Math.max(0, elapsed - 16.67),
      );
      this.renderPending = false;
      this.queueFrame();
    }
  }

  private finishBuffering(now: number): void {
    if (this.bufferingSince == null) return;
    this.metricsValue.bufferingMs += Math.max(0, now - this.bufferingSince);
    this.bufferingSince = null;
    this.options.onBuffering?.(false);
  }
}
