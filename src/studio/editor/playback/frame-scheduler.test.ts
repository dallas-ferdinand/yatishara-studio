import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../editorState";
import { FrameScheduler } from "./frame-scheduler";
import { compileTimeline } from "./timeline-compiler";
import { TransportClock } from "./transport-clock";

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("FrameScheduler", () => {
  it("reports buffering and resumes rendering without advancing media clocks", async () => {
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
});
