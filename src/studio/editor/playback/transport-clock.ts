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
 * Monotonic timeline transport. Media never writes into this clock: decoders
 * render the requested timestamp, so a seek or decode stall cannot move time back.
 */
export class TransportClock {
  private readonly now: ClockSource;
  private anchorClock = 0;
  private anchorTimeline = 0;
  private duration = 0;
  private rate = 1;
  private running = false;
  private generationValue = 0;

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

  currentTime(): number {
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
      this.generationValue += 1;
    }
    return this.snapshot();
  }

  seek(time: number): TransportSnapshot {
    this.anchorTimeline = Math.max(0, Math.min(this.duration, time));
    this.anchorClock = this.now();
    this.generationValue += 1;
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
