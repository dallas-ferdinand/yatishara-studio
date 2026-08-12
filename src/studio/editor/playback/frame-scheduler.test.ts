import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../editorState";
import { FrameScheduler } from "./frame-scheduler";
import { compileTimeline } from "./timeline-compiler";
import { TransportClock } from "./transport-clock";

async function settle(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("FrameScheduler", () => {
  it("reports buffering on underrun and resumes rendering", async () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.duration = 5;
    const plan = compileTimeline(project);
    let nowSeconds = 0;
    const clock = new TransportClock(5, () => nowSeconds);
    clock.play();
    const callbacks: FrameRequestCallback[] = [];
    let ready = false;
    let rendered = 0;
    const buffering: boolean[] = [];
    const scheduler = new FrameScheduler(
      plan,
      clock,
      {
        prepare: async () => ready,
        render: () => {
          rendered += 1;
        },
      },
      {
        requestFrame: (next) => {
          callbacks.push(next);
          return 1;
        },
        cancelFrame: () => undefined,
        onBuffering: (value) => buffering.push(value),
      },
    );

    scheduler.start();
    const first = callbacks.shift();
    expect(first).toBeDefined();
    first!(0);
    await settle();
    expect(buffering).toEqual([true]);
    expect(rendered).toBe(0);

    ready = true;
    nowSeconds = 0.016;
    const second = callbacks.shift();
    expect(second).toBeDefined();
    second!(16);
    await settle();
    expect(buffering).toEqual([true, false]);
    expect(rendered).toBe(1);
    scheduler.stop();
  });

  it("does not hold the clock during a fast prepare (pump-fed play)", async () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.duration = 5;
    const plan = compileTimeline(project);
    let nowSeconds = 0;
    const clock = new TransportClock(5, () => nowSeconds);
    clock.seek(1);
    clock.play();
    const callbacks: FrameRequestCallback[] = [];
    const scheduler = new FrameScheduler(
      plan,
      clock,
      {
        prepare: async () => true,
        render: () => undefined,
      },
      {
        requestFrame: (next) => {
          callbacks.push(next);
          return callbacks.length;
        },
        cancelFrame: () => undefined,
      },
    );

    scheduler.start();
    const first = callbacks.shift();
    first!(0);
    await settle();
    // Fast prepare — clock keeps playing (continuous decode model).
    expect(clock.playing).toBe(true);
    nowSeconds = 0.2;
    expect(clock.currentTime()).toBeCloseTo(1.2);
    scheduler.stop();
  });

  it("holds the clock only after a lasting underrun", async () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.duration = 5;
    const plan = compileTimeline(project);
    const nowSeconds = 0;
    const clock = new TransportClock(5, () => nowSeconds);
    clock.seek(1);
    clock.play();
    const callbacks: FrameRequestCallback[] = [];
    const gate = {
      release: null as null | ((value: boolean) => void),
    };
    const scheduler = new FrameScheduler(
      plan,
      clock,
      {
        prepare: () =>
          new Promise<boolean>((resolve) => {
            gate.release = resolve;
          }),
        render: () => undefined,
      },
      {
        requestFrame: (next) => {
          callbacks.push(next);
          return callbacks.length;
        },
        cancelFrame: () => undefined,
      },
    );

    scheduler.start();
    const first = callbacks.shift();
    first!(0);
    // Still within underrun grace — clock should still be playing.
    await settle(20);
    expect(clock.playing).toBe(true);
    // Past UNDERRUN_HOLD_MS — transport freezes until prepare completes.
    await settle(100);
    expect(clock.playing).toBe(false);
    expect(clock.currentTime()).toBeCloseTo(1);
    gate.release?.(true);
    await settle();
    expect(clock.playing).toBe(true);
    scheduler.stop();
  });

  it("loops to the start instead of stopping at the end", async () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.duration = 2;
    const plan = compileTimeline(project);
    let nowSeconds = 0;
    const clock = new TransportClock(2, () => nowSeconds);
    clock.seek(1.999);
    clock.play();
    const callbacks: FrameRequestCallback[] = [];
    const times: number[] = [];
    const scheduler = new FrameScheduler(
      plan,
      clock,
      {
        prepare: async () => true,
        render: () => undefined,
      },
      {
        loop: true,
        requestFrame: (next) => {
          callbacks.push(next);
          return callbacks.length;
        },
        cancelFrame: () => undefined,
        onTime: (time) => times.push(time),
      },
    );

    scheduler.start();
    nowSeconds = 0.02;
    const first = callbacks.shift();
    first!(0);
    await settle();
    expect(clock.playing).toBe(true);
    expect(clock.currentTime()).toBeCloseTo(0, 3);
    expect(times.at(-1)).toBeCloseTo(0, 3);
    scheduler.stop();
  });
});
