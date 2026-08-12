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
  onLoop?: () => void;
  loop?: boolean;
  onError?: (error: Error) => void;
  uiIntervalMs?: number;
};

const requestFrameDefault = (callback: FrameRequestCallback): number =>
  requestAnimationFrame(callback);
const cancelFrameDefault = (id: number): void => cancelAnimationFrame(id);

/**
 * Only hold the clock on a true underrun (prepare returned false / took too
 * long). While the continuous decode pump is healthy, time keeps advancing.
 */
const UNDERRUN_HOLD_MS = 80;

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

  private beginBuffering(now: number): void {
    if (this.bufferingSince != null) return;
    this.bufferingSince = now;
    this.options.onBuffering?.(true);
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
      if (this.options.loop && this.plan.duration > 0) {
        this.clock.seek(0);
        this.options.onTime?.(0);
        this.options.onLoop?.();
        this.queueFrame();
        return;
      }
      this.clock.pause();
      this.options.onTime?.(this.plan.duration);
      this.options.onEnded?.();
      this.stop();
      return;
    }

    if (this.renderPending) {
      // Drop this display frame — clock keeps running (real player behavior).
      this.metricsValue.droppedFrames += 1;
      this.queueFrame();
      return;
    }

    this.renderPending = true;
    const workStarted = performance.now();
    const wasPlaying = this.clock.playing;
    // Only freeze transport on a lasting underrun — not on every prepare.
    let heldForUnderrun = false;
    const underrunTimer = setTimeout(() => {
      if (!this.clock.playing) return;
      this.clock.hold();
      heldForUnderrun = true;
      this.beginBuffering(performance.now());
    }, UNDERRUN_HOLD_MS);
    try {
      const slice = sliceAt(this.plan, timelineTime);
      const ready = await this.consumer.prepare(slice, generation);
      if (!this.started || generation !== this.clock.generation) return;
      if (!ready) {
        if (wasPlaying && this.clock.playing) {
          this.clock.hold();
          heldForUnderrun = true;
        }
        this.beginBuffering(performance.now());
        return;
      }
      const wasBuffering = this.bufferingSince != null;
      this.finishBuffering(performance.now());
      await this.consumer.render(slice, generation);
      if (generation === this.clock.generation) {
        this.metricsValue.renderedFrames += 1;
      }
      if (
        this.started &&
        !this.clock.ended() &&
        (heldForUnderrun || wasBuffering) &&
        !this.clock.playing &&
        (wasPlaying || wasBuffering)
      ) {
        this.clock.play();
      }
    } catch (reason) {
      if (generation === this.clock.generation) {
        this.options.onError?.(
          reason instanceof Error ? reason : new Error(String(reason)),
        );
      }
    } finally {
      clearTimeout(underrunTimer);
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
