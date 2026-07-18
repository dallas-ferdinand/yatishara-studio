import { describe, expect, it } from "vitest";
import { TransportClock } from "./transport-clock";

describe("TransportClock", () => {
  it("never moves backwards while playing", () => {
    let now = 10;
    const clock = new TransportClock(20, () => now);
    clock.seek(4);
    clock.play();
    now = 10.25;
    const first = clock.currentTime();
    now = 10.5;
    const second = clock.currentTime();
    expect(first).toBeCloseTo(4.25);
    expect(second).toBeCloseTo(4.5);
    expect(second).toBeGreaterThan(first);
  });

  it("invalidates pending decode generations on discontinuities", () => {
    let now = 0;
    const clock = new TransportClock(10, () => now);
    const initial = clock.generation;
    clock.seek(3);
    expect(clock.generation).toBe(initial + 1);
    clock.play();
    now = 1;
    clock.pause();
    expect(clock.currentTime()).toBeCloseTo(4);
    expect(clock.generation).toBe(initial + 2);
  });

  it("does not bump generation when duration is unchanged", () => {
    const clock = new TransportClock(12);
    clock.seek(2);
    const generation = clock.generation;
    clock.setDuration(12);
    expect(clock.generation).toBe(generation);
    clock.setDuration(14);
    expect(clock.generation).toBe(generation + 1);
  });
});
