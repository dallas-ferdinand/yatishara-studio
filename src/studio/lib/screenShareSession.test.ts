import { describe, expect, it } from "vitest";
import {
  finishEstimateMsForSize,
  isScreenShareSaving,
  screenShareSaveLabel,
  screenShareSavePercent,
  screenShareSession,
} from "./screenShareSession";

const times = {
  uploadStartedAt: 0,
  finishStartedAt: 0,
  finishEstimateMs: 8_000,
};

describe("screenShareSession", () => {
  it("keeps getSnapshot referentially stable until state changes", () => {
    const a = screenShareSession.getSnapshot();
    const b = screenShareSession.getSnapshot();
    expect(a).toBe(b);
    screenShareSession.setIncludeMic(!a.includeMic);
    const c = screenShareSession.getSnapshot();
    expect(c).not.toBe(a);
    expect(c.includeMic).toBe(!a.includeMic);
    screenShareSession.setIncludeMic(a.includeMic);
  });

  it("notifies subscribers on includeMic", () => {
    let calls = 0;
    const unsub = screenShareSession.subscribe(() => {
      calls += 1;
    });
    const start = screenShareSession.getSnapshot().includeMic;
    screenShareSession.setIncludeMic(!start);
    screenShareSession.setIncludeMic(start);
    unsub();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("opens a control panel without starting capture", () => {
    screenShareSession.disarmPanel();
    expect(screenShareSession.getSnapshot().panelOpen).toBe(false);
    screenShareSession.armPanel();
    expect(screenShareSession.getSnapshot().panelOpen).toBe(true);
    screenShareSession.disarmPanel();
    expect(screenShareSession.getSnapshot().panelOpen).toBe(false);
  });

  it("names each save step so Stop is never silent", () => {
    expect(isScreenShareSaving("idle")).toBe(false);
    expect(isScreenShareSaving("recording")).toBe(false);
    expect(
      screenShareSaveLabel({ phase: "idle", saveLoaded: 0, saveTotal: 0, ...times }),
    ).toBeNull();
    expect(
      screenShareSaveLabel({ phase: "preparing", saveLoaded: 0, saveTotal: 0, ...times }),
    ).toBe("Preparing recording…");
    expect(
      screenShareSavePercent({ phase: "preparing", saveLoaded: 0, saveTotal: 0, ...times }),
    ).toBeNull();
    expect(
      screenShareSaveLabel({
        phase: "uploading",
        saveLoaded: 5 * 1024 * 1024,
        saveTotal: 10 * 1024 * 1024,
        ...times,
      }),
    ).toBe("Saving 50% · 5.0 MB of 10 MB");
    expect(
      screenShareSavePercent({
        phase: "uploading",
        saveLoaded: 5 * 1024 * 1024,
        saveTotal: 10 * 1024 * 1024,
        ...times,
      }),
    ).toBe(50);
    expect(
      screenShareSaveLabel({ phase: "finishing", saveLoaded: 10, saveTotal: 10, ...times }),
    ).toBe("Saving to Screen Recordings…");
  });

  it("keeps the bar moving during the last hop instead of sitting at 100%", () => {
    const start = 1_000_000;
    const atStart = screenShareSavePercent(
      {
        phase: "finishing",
        saveLoaded: 10,
        saveTotal: 10,
        uploadStartedAt: 0,
        finishStartedAt: start,
        finishEstimateMs: 10_000,
      },
      start,
    );
    const later = screenShareSavePercent(
      {
        phase: "finishing",
        saveLoaded: 10,
        saveTotal: 10,
        uploadStartedAt: 0,
        finishStartedAt: start,
        finishEstimateMs: 10_000,
      },
      start + 8_000,
    );
    expect(atStart).toBe(90);
    expect(later).toBeGreaterThan(atStart ?? 0);
    expect(later).toBeLessThan(100);
  });

  it("creeps the bar when byte progress has not arrived yet", () => {
    expect(
      screenShareSavePercent(
        {
          phase: "uploading",
          saveLoaded: 0,
          saveTotal: 10 * 1024 * 1024,
          uploadStartedAt: 1_000,
          finishStartedAt: 0,
          finishEstimateMs: 8_000,
        },
        1_000,
      ),
    ).toBe(0);
    expect(
      screenShareSavePercent(
        {
          phase: "uploading",
          saveLoaded: 0,
          saveTotal: 10 * 1024 * 1024,
          uploadStartedAt: 1_000,
          finishStartedAt: 0,
          finishEstimateMs: 8_000,
        },
        1_000 + 22_500,
      ),
    ).toBe(8);
  });

  it("estimates a longer last hop for bigger files", () => {
    expect(finishEstimateMsForSize(1_000)).toBe(8_000);
    expect(finishEstimateMsForSize(50 * 1024 * 1024)).toBeGreaterThan(8_000);
  });

  it("stacks recorded handlers so the last one can be removed", () => {
    screenShareSession.setRecordedHandler(null);
    expect(screenShareSession.recordedHandlerCount()).toBe(0);
    const unsubLib = screenShareSession.addRecordedHandler(() => {});
    const unsubCompose = screenShareSession.addRecordedHandler(() => {});
    expect(screenShareSession.recordedHandlerCount()).toBe(2);
    unsubCompose();
    expect(screenShareSession.recordedHandlerCount()).toBe(1);
    unsubLib();
    expect(screenShareSession.recordedHandlerCount()).toBe(0);
  });

  it("tracks upload progress on the shared snapshot", () => {
    screenShareSession.setSaveProgress(2_000_000, 4_000_000);
    const uploading = screenShareSession.getSnapshot();
    expect(uploading.phase).toBe("uploading");
    expect(uploading.saveLoaded).toBe(2_000_000);
    screenShareSession.beginFinishing();
    expect(screenShareSession.getSnapshot().phase).toBe("finishing");
    screenShareSession.clearSave();
    const idle = screenShareSession.getSnapshot();
    expect(idle.phase).toBe("idle");
    expect(idle.saveLoaded).toBe(0);
    expect(idle.saveTotal).toBe(0);
  });
});
