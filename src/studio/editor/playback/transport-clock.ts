export type TransportSnapshot = {
  playing: boolean;
  timelineTime: number;
  playbackRate: number;
  generation: number;
};

export type ClockSource = () => number;

function defaultClock(): number {
  if (typeof performance !== "undefined") return performance.now() / 1_000;
  return Date.now() / 1_000;
}

/**
 * Monotonic timeline transport. While playing with an external source (PlayBus),
 * currentTime() reads that source — media never waits on the display tick.
 * Paused scrub uses seek() without generation wipe.
 */
export class TransportClock {
  private readonly now: ClockSource;
  private anchorClock = 0;
  private anchorTimeline = 0;
  private duration = 0;
  private rate = 1;
  private running = false;
  private generationValue = 0;
  /** Live play master (e.g. PlayBus.timelineTime). Null when paused / scrubbing. */
  private externalTime: (() => number) | null = null;

  constructor(duration: number, now: ClockSource = defaultClock) {
    this.duration = Math.max(0, duration);
    this.now = now;
  }

  get generation(): number {
    return this.generationValue;
  }

  get playing(): boolean {
    return this.running;
  }

  get playbackRate(): number {
    return this.rate;
  }

  /**
   * While playing, drive currentTime from PlayBus (or similar). Pass null on
   * pause so scrub uses the anchored timeline again.
   */
  setExternalTimeSource(source: (() => number) | null): void {
    this.externalTime = source;
  }

  currentTime(): number {
    if (this.running && this.externalTime) {
      return Math.max(0, Math.min(this.duration, this.externalTime()));
    }
    if (!this.running) return this.anchorTimeline;
    const elapsed = Math.max(0, this.now() - this.anchorClock) * this.rate;
    return Math.max(0, Math.min(this.duration, this.anchorTimeline + elapsed));
  }

  play(): TransportSnapshot {
    if (!this.running && this.anchorTimeline < this.duration) {
      this.anchorClock = this.now();
      this.running = true;
    }
    return this.snapshot();
  }

  pause(): TransportSnapshot {
    if (this.running) {
      this.anchorTimeline = this.currentTime();
      this.running = false;
      this.externalTime = null;
    }
    return this.snapshot();
  }

  /**
   * Freeze transport without bumping generation. Unused on the HTMLVideo play
   * path (clock must never wait on a picture). Kept for tests / scrub tools.
   */
  hold(): TransportSnapshot {
    if (this.running) {
      this.anchorTimeline = this.currentTime();
      this.running = false;
    }
    return this.snapshot();
  }

  /**
   * Move the playhead. Paused scrub does not bump generation (keeps decoded
   * frames). Playing seek / explicit invalidate cancels in-flight prepares.
   */
  seek(time: number, opts?: { invalidate?: boolean }): TransportSnapshot {
    this.anchorTimeline = Math.max(0, Math.min(this.duration, time));
    this.anchorClock = this.now();
    if (opts?.invalidate === true || this.running) {
      this.generationValue += 1;
    }
    return this.snapshot();
  }

  setPlaybackRate(rate: number): TransportSnapshot {
    const next = Math.max(0.1, Math.min(4, rate));
    if (next === this.rate) return this.snapshot();
    this.anchorTimeline = this.currentTime();
    this.anchorClock = this.now();
    this.rate = next;
    this.generationValue += 1;
    return this.snapshot();
  }

  setDuration(duration: number): TransportSnapshot {
    const next = Math.max(0, duration);
    // Same duration (e.g. frameRatio-only project patch) must not bump
    // generation — that cancels in-flight frames and blanks the preview.
    if (next === this.duration) return this.snapshot();
    this.anchorTimeline = Math.min(this.currentTime(), next);
    this.duration = next;
    this.anchorClock = this.now();
    this.generationValue += 1;
    if (this.anchorTimeline >= this.duration) this.running = false;
    return this.snapshot();
  }

  ended(): boolean {
    return this.duration > 0 && this.currentTime() >= this.duration - 0.0005;
  }

  snapshot(): TransportSnapshot {
    return {
      playing: this.running,
      timelineTime: this.currentTime(),
      playbackRate: this.rate,
      generation: this.generationValue,
    };
  }
}
