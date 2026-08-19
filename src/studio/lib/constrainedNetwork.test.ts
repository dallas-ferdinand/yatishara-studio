import { describe, expect, it, vi, afterEach } from "vitest";
import { isConstrainedNetwork } from "./constrainedNetwork";

describe("isConstrainedNetwork", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false when Network Information is missing", () => {
    vi.stubGlobal("navigator", {});
    expect(isConstrainedNetwork()).toBe(false);
  });

  it("is true on Save-Data or cellular", () => {
    vi.stubGlobal("navigator", { connection: { saveData: true } });
    expect(isConstrainedNetwork()).toBe(true);
    vi.stubGlobal("navigator", { connection: { type: "cellular" } });
    expect(isConstrainedNetwork()).toBe(true);
    vi.stubGlobal("navigator", { connection: { effectiveType: "3g" } });
    expect(isConstrainedNetwork()).toBe(true);
  });

  it("is false on typical 4g without saveData", () => {
    vi.stubGlobal("navigator", { connection: { effectiveType: "4g" } });
    expect(isConstrainedNetwork()).toBe(false);
  });
});
