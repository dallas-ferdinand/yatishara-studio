import { describe, expect, it } from "vitest";
import {
  PERF_BUDGETS,
  shouldCommitPlayhead,
} from "./performance";

describe("performance budgets", () => {
  it("exposes the True Performance hard budgets", () => {
    expect(PERF_BUDGETS.lcpMs).toBe(2500);
    expect(PERF_BUDGETS.inpMs).toBe(200);
    expect(PERF_BUDGETS.cls).toBe(0.1);
    expect(PERF_BUDGETS.initialJsGzipKb).toBe(180);
    expect(PERF_BUDGETS.longTaskMs).toBe(200);
  });

  it("throttles playhead React commits to ~30 Hz", () => {
    expect(shouldCommitPlayhead(0, 16)).toBe(false);
    expect(shouldCommitPlayhead(0, 33)).toBe(true);
    expect(shouldCommitPlayhead(100, 120)).toBe(false);
    expect(shouldCommitPlayhead(100, 140)).toBe(true);
  });
});
