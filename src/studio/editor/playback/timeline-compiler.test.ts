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
});
