import { describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../editorState";
import type { EditorClip, EditorMediaItem } from "../types";
import { PlayBus } from "./play-bus";
import { compileTimeline, sliceAt } from "./timeline-compiler";

function clip(
  id: string,
  assetId: string,
  startTime: number,
  trimIn: number,
  trimOut: number,
): EditorClip {
  return {
    id,
    assetId,
    trackId: "track-v1",
    startTime,
    trimIn,
    trimOut,
    label: id,
    kind: "video",
  };
}

function fakeVideo(): HTMLVideoElement {
  const listeners = new Map<string, Set<() => void>>();
  let currentTime = 0;
  let readyState = 4;
  let paused = true;
  let src = "";
  const video = {
    muted: true,
    playsInline: true,
    preload: "auto",
    crossOrigin: "anonymous",
    playbackRate: 1,
    seeking: false,
    get src() {
      return src;
    },
    set src(value: string) {
      src = value;
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
      queueMicrotask(() => {
        for (const cb of listeners.get("seeked") ?? []) cb();
      });
    },
    get readyState() {
      return readyState;
    },
    setReadyState(value: number) {
      readyState = value;
    },
    get paused() {
      return paused;
    },
    play: vi.fn(async () => {
      paused = false;
      for (const cb of listeners.get("playing") ?? []) cb();
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    remove: vi.fn(),
    setAttribute: vi.fn(),
    style: { cssText: "" },
    addEventListener: (type: string, cb: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => {
      listeners.get(type)?.delete(cb);
    },
    emit(type: string) {
      for (const cb of listeners.get(type) ?? []) cb();
    },
  };
  return video as unknown as HTMLVideoElement;
}

function mediaItem(assetId: string, file: string): EditorMediaItem {
  return {
    assetId,
    kind: "video",
    url: `https://cdn.example/${file}.mp4`,
    proxyUrl: `https://cdn.example/${file}-720.mp4`,
    name: file,
  } as EditorMediaItem;
}

describe("PlayBus", () => {
  it("maps program currentTime to timelineTime", async () => {
    const videos: HTMLVideoElement[] = [];
    const bus = new PlayBus(
      { current: new Map([["a1", mediaItem("a1", "a")]]) },
      {
        createVideo: () => {
          const video = fakeVideo();
          videos.push(video);
          return video;
        },
      },
    );
    const project = createEmptyProject({ name: "t", folderId: "f" });
    project.clips = [clip("c1", "a1", 2, 1, 6)];
    project.duration = 10;
    const plan = compileTimeline(project);
    bus.setDuration(10);
    await bus.play(plan, 2, new Map([["a1", mediaItem("a1", "a")]]));
    expect(videos[0]!.src).toContain("a-720.mp4");
    expect(videos[0]!.currentTime).toBeCloseTo(1, 1);
    videos[0]!.currentTime = 3;
    expect(bus.timelineTime()).toBeCloseTo(4, 1);
    expect(bus.pause()).toBeCloseTo(4, 1);
    bus.dispose();
  });

  it("prerolls next clip on the partner slot", async () => {
    const videos: HTMLVideoElement[] = [];
    const media = new Map([
      ["a1", mediaItem("a1", "a")],
      ["b1", mediaItem("b1", "b")],
    ]);
    const bus = new PlayBus(
      { current: media },
      {
        createVideo: () => {
          const video = fakeVideo();
          videos.push(video);
          return video;
        },
      },
    );
    const project = createEmptyProject({ name: "t", folderId: "f" });
    project.clips = [
      clip("c1", "a1", 0, 0, 3),
      clip("c2", "b1", 3, 0.5, 4),
    ];
    project.duration = 8;
    const plan = compileTimeline(project);
    bus.setDuration(8);
    await bus.play(plan, 0.5, media);
    expect(videos[0]!.src).toContain("a-720.mp4");
    expect(videos[1]!.src).toContain("b-720.mp4");
    expect(videos[1]!.currentTime).toBeCloseTo(0.5, 1);
    const before = videos[0]!.currentTime;
    // Near playhead — must not yank the program (drift under 0.35s).
    bus.syncSlice(sliceAt(plan, 0.55), media);
    await new Promise((r) => setTimeout(r, 30));
    expect(Math.abs(videos[0]!.currentTime - before)).toBeLessThan(0.4);
    expect(videos[0]!.src).toContain("a-720.mp4");
    expect(videos[1]!.src).toContain("b-720.mp4");
    bus.dispose();
  });

  it("reports waiting when program lacks current data", async () => {
    const videos: Array<HTMLVideoElement & { setReadyState?: (n: number) => void; emit?: (t: string) => void }> =
      [];
    const media = new Map([["a1", mediaItem("a1", "a")]]);
    const bus = new PlayBus(
      { current: media },
      {
        createVideo: () => {
          const video = fakeVideo() as HTMLVideoElement & {
            setReadyState: (n: number) => void;
            emit: (t: string) => void;
          };
          video.setReadyState(1);
          videos.push(video);
          return video;
        },
      },
    );
    const project = createEmptyProject({ name: "t", folderId: "f" });
    project.clips = [clip("c1", "a1", 0, 0, 2)];
    project.duration = 2;
    const plan = compileTimeline(project);
    await bus.play(plan, 0, media);
    expect(bus.isWaiting()).toBe(true);
    videos[0]!.setReadyState?.(4);
    videos[0]!.emit?.("canplay");
    expect(bus.isWaiting()).toBe(false);
    bus.dispose();
  });
});
