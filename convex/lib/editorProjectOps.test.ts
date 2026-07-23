import { describe, expect, it } from "vitest";
import {
  appendClips,
  clipAtPlayhead,
  clipDurationSec,
  emptyEditorProject,
  patchClips,
  removeClips,
  reorderTrackClips,
  seedClipsFromAssets,
  setClipTransition,
  splitClipAtTime,
} from "./editorProjectOps";

function baseProject() {
  return emptyEditorProject("Test", "folder1");
}

describe("editorProjectOps", () => {
  it("seeds image/video/audio clips sequentially", () => {
    const { project, changedClipIds } = seedClipsFromAssets(baseProject(), [
      { id: "a1", name: "still.png", kind: "image" },
      { id: "a2", name: "clip.mp4", kind: "video", durationSeconds: 4 },
      { id: "a3", name: "bed.mp3", kind: "audio", durationSeconds: 8 },
    ]);
    expect(changedClipIds).toHaveLength(3);
    expect(project.clips[0]!.trimOut).toBe(3);
    expect(project.clips[0]!.startTime).toBe(0);
    expect(project.clips[1]!.startTime).toBe(3);
    expect(project.clips[1]!.trimOut).toBe(4);
    expect(project.clips[2]!.trackId).toBe("track-audio");
    expect(project.clips[2]!.trimOut).toBe(8);
    expect(project.duration).toBeGreaterThanOrEqual(8);
  });

  it("appends at end and patches trim", () => {
    let { project } = seedClipsFromAssets(baseProject(), [
      { id: "a1", name: "a.mp4", kind: "video", durationSeconds: 5 },
    ]);
    const assets = new Map([
      ["a2", { id: "a2", name: "b.mp4", kind: "video" as const, durationSeconds: 2 }],
    ]);
    const appended = appendClips(project, [{ assetId: "a2" }], assets);
    project = appended.project;
    expect(project.clips).toHaveLength(2);
    expect(project.clips[1]!.startTime).toBe(5);

    const firstId = project.clips[0]!.id;
    const patched = patchClips(project, [{ clipId: firstId, trimOut: 2 }]);
    expect(clipDurationSec(patched.project.clips[0]!)).toBe(2);
  });

  it("reorders track clips and recomputes startTimes", () => {
    const { project } = seedClipsFromAssets(baseProject(), [
      { id: "a1", name: "a.mp4", kind: "video", durationSeconds: 2 },
      { id: "a2", name: "b.mp4", kind: "video", durationSeconds: 3 },
    ]);
    const [c0, c1] = project.clips;
    const reordered = reorderTrackClips(project, "track-v1", [c1!.id, c0!.id]);
    expect(reordered.project.clips.find((c) => c.id === c1!.id)!.startTime).toBe(0);
    expect(reordered.project.clips.find((c) => c.id === c0!.id)!.startTime).toBe(3);
  });

  it("splits a clip and ripples remove", () => {
    const { project } = seedClipsFromAssets(baseProject(), [
      { id: "a1", name: "a.mp4", kind: "video", durationSeconds: 6 },
      { id: "a2", name: "b.mp4", kind: "video", durationSeconds: 2 },
    ]);
    const first = project.clips[0]!;
    const split = splitClipAtTime(project, first.id, 2);
    expect(split.changedClipIds).toHaveLength(2);
    expect(split.project.clips.filter((c) => c.trackId === "track-v1")).toHaveLength(3);

    const left = split.project.clips.find((c) => c.id === first.id)!;
    const removed = removeClips(split.project, [left.id], { ripple: true });
    const remaining = removed.project.clips
      .filter((c) => c.trackId === "track-v1")
      .sort((a, b) => a.startTime - b.startTime);
    expect(remaining[0]!.startTime).toBe(0);
  });

  it("sets transitions and finds clip at playhead", () => {
    const { project } = seedClipsFromAssets(baseProject(), [
      { id: "a1", name: "a.mp4", kind: "video", durationSeconds: 5 },
    ]);
    const clipId = project.clips[0]!.id;
    const withTx = setClipTransition(project, clipId, { type: "crossfade", duration: 0.4 });
    expect(withTx.project.clips[0]!.transitionOut).toEqual({
      type: "crossfade",
      duration: 0.4,
    });
    const hit = clipAtPlayhead(withTx.project, 1.5);
    expect(hit?.clip.id).toBe(clipId);
    expect(hit?.localTime).toBeCloseTo(1.5, 3);
  });
});
