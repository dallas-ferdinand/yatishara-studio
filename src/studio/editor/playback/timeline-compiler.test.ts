import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../editorState";
import type { EditorClip } from "../types";
import { compileTimeline, sliceAt } from "./timeline-compiler";

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

describe("timeline compiler", () => {
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

  it("prefers the top timeline video lane when clips overlap", () => {
    const project = createEmptyProject({ name: "test", folderId: "folder" });
    project.tracks = [
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-v2", kind: "video", label: "V2" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    project.clips = [
      { ...clip("top", 0, 3), trackId: "track-v1" },
      { ...clip("bottom", 0, 3), trackId: "track-v2" },
    ];
    const plan = compileTimeline(project);
    expect(sliceAt(plan, 1).video.map((sample) => sample.clip.clipId)).toEqual([
      "top",
    ]);
  });
});
