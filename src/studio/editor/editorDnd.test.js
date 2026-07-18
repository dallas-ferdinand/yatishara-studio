import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  clearActiveExplorerDrag,
  writeExplorerDragData,
} from "../../desk/lib/explorer-dnd.js";
import {
  DEFAULT_VIDEO_CLIP_SEC,
  peekTimelineDragPayload,
  readTimelineDropPayload,
} from "./editorDnd.js";

describe("editorDnd duration", () => {
  beforeEach(() => {
    clearActiveExplorerDrag();
  });
  afterEach(() => {
    clearActiveExplorerDrag();
  });

  it("uses asset durationSeconds instead of the 4s fallback", () => {
    const dt = {
      setData() {},
      effectAllowed: "all",
      types: [],
      getData() {
        return "";
      },
    };
    writeExplorerDragData(dt, {
      path: "/Studio/assets/a1.mp4",
      name: "clip.mp4",
      type: "file",
      studioKind: "asset",
      studioId: "a1",
      kind: "video",
      mediaKind: "video",
      durationSeconds: 12.5,
    });

    expect(peekTimelineDragPayload()).toMatchObject({
      assetId: "a1",
      mediaKind: "video",
      duration: 12.5,
    });
  });

  it("falls back to 4s only when duration is unknown", () => {
    const dt = {
      setData() {},
      effectAllowed: "all",
      types: [],
      getData() {
        return "";
      },
    };
    writeExplorerDragData(dt, {
      path: "/Studio/assets/a2.mp4",
      name: "clip.mp4",
      type: "file",
      studioKind: "asset",
      studioId: "a2",
      kind: "video",
      mediaKind: "video",
    });

    expect(peekTimelineDragPayload()?.duration).toBe(DEFAULT_VIDEO_CLIP_SEC);
  });

  it("reads duration from application/x-studio-asset drops", () => {
    const event = {
      dataTransfer: {
        getData(type) {
          if (type === "application/x-studio-asset") {
            return JSON.stringify({
              assetId: "a3",
              kind: "video",
              name: "long.mp4",
              duration: 18,
            });
          }
          return "";
        },
      },
    };
    expect(readTimelineDropPayload(event)).toMatchObject({
      assetId: "a3",
      duration: 18,
    });
  });
});
