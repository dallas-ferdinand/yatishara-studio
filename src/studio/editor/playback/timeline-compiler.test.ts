import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../editorState";
import type { EditorClip } from "../types";
import { compileTimeline, pictureStackPlan, playbackSignature, sliceAt, stackOverlappingVideo } from "./timeline-compiler";

function clip(
  id: string,
  startTime: number,
  trimOut: number,
  transition = false,
): EditorClip {
  return {
    id,
    assetId: `asset-${id}`,
    trackId: "track-v1",
    startTime,
    trimIn: 0,
    trimOut,
    label: id,
    kind: "video",
    transitionOut: transition
      ? { type: "crossfade", duration: 0.5 }
      : undefined,
  };
}

describe("playbackSignature", () => {
  function projectWith(clips: EditorClip[]) {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.clips = clips;
    return project;
  }

  it("ignores cosmetic edits so a transform drag never restarts decode", () => {
    const base = clip("a", 0, 4);
    const before = playbackSignature(compileTimeline(projectWith([base])));
    const dragged = playbackSignature(
      compileTimeline(
        projectWith([
          { ...base, effects: { scale: 1.4, x: 0.2, y: -0.1, rotation: 12 } },
        ]),
      ),
    );
    expect(dragged).toBe(before);
  });

  it("changes when trim, position, speed, or volume changes", () => {
    const base = clip("a", 0, 4);
    const before = playbackSignature(compileTimeline(projectWith([base])));

    expect(
      playbackSignature(compileTimeline(projectWith([{ ...base, trimIn: 1 }]))),
    ).not.toBe(before);
    expect(
      playbackSignature(compileTimeline(projectWith([{ ...base, startTime: 2 }]))),
    ).not.toBe(before);
    expect(
      playbackSignature(
        compileTimeline(projectWith([{ ...base, effects: { speed: 2 } }])),
      ),
    ).not.toBe(before);
    expect(
      playbackSignature(
        compileTimeline(projectWith([{ ...base, effects: { volume: 0.3 } }])),
      ),
    ).not.toBe(before);
  });

  it("changes when a transition is added", () => {
    const before = playbackSignature(
      compileTimeline(projectWith([clip("a", 0, 2), clip("b", 2, 2)])),
    );
    const after = playbackSignature(
      compileTimeline(projectWith([clip("a", 0, 2, true), clip("b", 2, 2)])),
    );
    expect(after).not.toBe(before);
  });
});

describe("timeline compiler", () => {
  it("ignores draft effects.speed until Process bakes a new asset", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    const sped: EditorClip = {
      ...clip("a", 0, 2),
      effects: { speed: 2 },
    };
    project.clips = [sped];
    const plan = compileTimeline(project);
    // Draft speed does not shrink the clip or remap sourceTime.
    expect(plan.video[0]?.timelineEnd).toBeCloseTo(2);
    const mid = sliceAt(plan, 0.5);
    expect(mid.video[0]?.sourceTime).toBeCloseTo(0.5);
  });

  it("uses half-open intervals and continuous outgoing timestamps", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.clips = [clip("a", 0, 2, true), clip("b", 2, 2)];
    const plan = compileTimeline(project);
    const before = sliceAt(plan, 1.749);
    const start = sliceAt(plan, 1.75);
    const later = sliceAt(plan, 1.9);

    expect(before.transition).toBeNull();
    expect(start.transition?.progress).toBeCloseTo(0);
    expect(start.video.map((sample) => sample.role)).toEqual([
      "outgoing",
      "incoming",
    ]);
    expect(start.video[0]?.sourceTime).toBeCloseTo(1.75);
    expect(later.video[0]?.sourceTime).toBeCloseTo(1.9);
    expect(later.video[0]!.sourceTime).toBeGreaterThan(start.video[0]!.sourceTime);
    expect(start.video[1]?.sourceTime).toBeCloseTo(0);
    expect(later.video[1]?.sourceTime).toBeCloseTo(0);
    expect(sliceAt(plan, 2.1).video[1]?.sourceTime).toBeCloseTo(0.1);
  });

  it("returns the incoming clip after a transition window", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.clips = [clip("a", 0, 2, true), clip("b", 2, 2)];
    const plan = compileTimeline(project);
    const after = sliceAt(plan, 2.251);

    expect(after.transition).toBeNull();
    expect(after.video).toHaveLength(1);
    expect(after.video[0]?.clip.clipId).toBe("b");
    expect(after.video[0]?.sourceTime).toBeCloseTo(0.251);
  });

  it("hard-cuts a transitioning lane while another picture lane overlaps", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.tracks = [
      { id: "track-v1", kind: "video", label: "Overlay" },
      { id: "track-v2", kind: "video", label: "Main" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    project.clips = [
      { ...clip("overlay", 0, 4), trackId: "track-v1" },
      { ...clip("a", 0, 2, true), trackId: "track-v2" },
      { ...clip("b", 2, 2), trackId: "track-v2" },
    ];
    const plan = compileTimeline(project);

    const beforeCut = sliceAt(plan, 1.9);
    expect(beforeCut.transition).toBeNull();
    expect(beforeCut.video.map((sample) => sample.clip.clipId)).toEqual([
      "overlay",
      "a",
    ]);

    const afterCut = sliceAt(plan, 2.1);
    expect(afterCut.transition).toBeNull();
    expect(afterCut.video.map((sample) => sample.clip.clipId)).toEqual([
      "overlay",
      "b",
    ]);
  });

  it("pre-rolls adjacent transition partners and never moves a clip backward", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.clips = [
      clip("a", 0, 2, true),
      clip("b", 2, 2, true),
      clip("c", 4, 2),
    ];
    const plan = compileTimeline(project);
    expect(sliceAt(plan, 0.5).preload.map((item) => item.clip.clipId)).toContain("b");

    const samplesByClip = new Map<string, number>();
    for (let time = 0; time < 6; time += 1 / 60) {
      for (const sample of sliceAt(plan, time).video) {
        const previous = samplesByClip.get(sample.clip.clipId);
        if (previous != null) {
          expect(sample.sourceTime + 0.0001).toBeGreaterThanOrEqual(previous);
        }
        samplesByClip.set(sample.clip.clipId, sample.sourceTime);
      }
    }
  });

  it("includes dedicated audio beds and preloads upcoming ones", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.clips = [
      clip("v", 0, 5),
      {
        id: "bed",
        assetId: "asset-bed",
        trackId: "track-audio",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        label: "bed",
        kind: "audio",
      },
      {
        id: "bed2",
        assetId: "asset-bed2",
        trackId: "track-audio",
        startTime: 1.5,
        trimIn: 0,
        trimOut: 2,
        label: "bed2",
        kind: "audio",
      },
    ];
    const plan = compileTimeline(project);
    expect(plan.audio.map((item) => item.clipId)).toEqual(["bed", "bed2"]);
    const atZero = sliceAt(plan, 0);
    expect(atZero.audio.map((item) => item.clip.clipId)).toEqual(["bed"]);
    expect(atZero.preloadAudio.map((item) => item.clip.clipId)).toContain("bed2");
    const atBed2 = sliceAt(plan, 1.6);
    expect(atBed2.audio.map((item) => item.clip.clipId).sort()).toEqual(["bed", "bed2"]);
  });

  it("marks muted audio tracks as muted in the plan", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    const audioTrack = project.tracks.find((track) => track.kind === "audio")!;
    audioTrack.muted = true;
    project.clips = [
      {
        id: "bed",
        assetId: "asset-bed",
        trackId: "track-audio",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        label: "bed",
        kind: "audio",
      },
    ];
    const plan = compileTimeline(project);
    expect(plan.audio[0]?.muted).toBe(true);
    expect(sliceAt(plan, 0.5).audio[0]?.clip.muted).toBe(true);
  });

  it("applies fade-in and fade-out to audio bed gain", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.clips = [
      {
        id: "bed",
        assetId: "asset-bed",
        trackId: "track-audio",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        label: "bed",
        kind: "audio",
        effects: { volume: 1, fadeIn: 1, fadeOut: 1 },
      },
    ];
    const plan = compileTimeline(project);
    expect(sliceAt(plan, 0).audio[0]?.gain).toBeCloseTo(0);
    expect(sliceAt(plan, 0.5).audio[0]?.gain).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(sliceAt(plan, 2).audio[0]?.gain).toBeCloseTo(1);
    expect(sliceAt(plan, 3.5).audio[0]?.gain).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(sliceAt(plan, 3.999).audio[0]?.gain).toBeLessThan(0.05);
  });

  it("splits text above video as over and text below video as under", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.tracks = [
      { id: "track-t-over", kind: "text", label: "Over" },
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-t-under", kind: "text", label: "Under" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    project.clips = [
      {
        id: "over",
        trackId: "track-t-over",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        label: "Over",
        kind: "text",
        text: { text: "ON TOP" },
      },
      clip("v", 0, 2),
      {
        id: "under",
        trackId: "track-t-under",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        label: "Under",
        kind: "text",
        text: { text: "UNDER" },
      },
    ];
    const plan = compileTimeline(project);
    const slice = sliceAt(plan, 0.5);
    expect(slice.textOver.map((item) => item.clipId)).toEqual(["over"]);
    expect(slice.textUnder.map((item) => item.clipId)).toEqual(["under"]);
  });

  it("stacks overlapping picture lanes from top to bottom", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.tracks = [
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-v2", kind: "video", label: "V2" },
      { id: "track-v3", kind: "video", label: "V3" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    project.clips = [
      { ...clip("top", 0, 3), trackId: "track-v1" },
      { ...clip("mid", 0, 3), trackId: "track-v2" },
      { ...clip("bottom", 0, 3), trackId: "track-v3" },
    ];
    const plan = compileTimeline(project);
    expect(sliceAt(plan, 1).video.map((sample) => sample.clip.clipId)).toEqual([
      "top",
      "mid",
      "bottom",
    ]);
  });

  it("keeps middle videos when the top lane is an image", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.tracks = [
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-v2", kind: "video", label: "V2" },
      { id: "track-v3", kind: "video", label: "V3" },
      { id: "track-v4", kind: "video", label: "V4" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    project.clips = [
      { ...clip("img", 0, 3), trackId: "track-v1", kind: "image" },
      { ...clip("mid-a", 0, 3), trackId: "track-v2" },
      { ...clip("mid-b", 0, 3), trackId: "track-v3" },
      { ...clip("main", 0, 3), trackId: "track-v4" },
    ];
    const plan = compileTimeline(project);
    expect(sliceAt(plan, 1).video.map((sample) => sample.clip.clipId)).toEqual([
      "img",
      "mid-a",
      "mid-b",
      "main",
    ]);
    expect(sliceAt(plan, 1).video.map((sample) => sample.clip.kind)).toEqual([
      "image",
      "video",
      "video",
      "video",
    ]);
    const roles = pictureStackPlan(sliceAt(plan, 1));
    expect(roles).toEqual({
      topIndex: 0,
      bottomIndex: 3,
      middleIndexes: [1, 2],
    });
  });

  it("preserves every video when a shorter top image ends and indexes shift", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.tracks = [
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-v2", kind: "video", label: "V2" },
      { id: "track-v3", kind: "video", label: "V3" },
      { id: "track-v4", kind: "video", label: "V4" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    project.clips = [
      { ...clip("img", 0, 2), trackId: "track-v1", kind: "image" },
      { ...clip("mid-a", 0, 4), trackId: "track-v2" },
      { ...clip("mid-b", 0, 4), trackId: "track-v3" },
      { ...clip("main", 0, 4), trackId: "track-v4" },
    ];
    const plan = compileTimeline(project);

    expect(sliceAt(plan, 1).video.map((sample) => sample.clip.clipId)).toEqual([
      "img",
      "mid-a",
      "mid-b",
      "main",
    ]);
    expect(sliceAt(plan, 2.1).video.map((sample) => sample.clip.clipId)).toEqual([
      "mid-a",
      "mid-b",
      "main",
    ]);
  });

  it("mutes only the muted video row so lower-row audio still mixes", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.tracks = [
      { id: "track-v1", kind: "video", label: "V1", muted: true },
      { id: "track-v2", kind: "video", label: "V2" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    project.clips = [
      { ...clip("top", 0, 3), trackId: "track-v1" },
      { ...clip("bottom", 0, 3), trackId: "track-v2" },
    ];
    const plan = compileTimeline(project);
    const slice = sliceAt(plan, 1);
    expect(slice.video.map((sample) => sample.clip.clipId)).toEqual(["top", "bottom"]);
    expect(slice.video[0]?.clip.muted).toBe(true);
    expect(slice.video[1]?.clip.muted).toBe(false);
  });

  it("keeps the top overlay and the lowest lanes when the stack is capped", () => {
    expect(stackOverlappingVideo(["a", "b", "c", "d"], 3)).toEqual(["a", "c", "d"]);
  });
});
