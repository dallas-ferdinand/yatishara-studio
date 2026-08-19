import { describe, expect, it } from "vitest";
import { consumeFfmpegProgress } from "./studioFfmpeg";

describe("consumeFfmpegProgress", () => {
  it("maps out_time_us against duration", () => {
    const first = consumeFfmpegProgress("out_time_us=5000000\nprogress=continue\n", 10);
    expect(first.ratio).toBeCloseTo(0.5, 5);
    expect(first.rest).toBe("");
  });

  it("caps below 1 until progress=end", () => {
    const mid = consumeFfmpegProgress("out_time_ms=20000\n", 10);
    expect(mid.ratio).toBe(0.999);
    const done = consumeFfmpegProgress("progress=end\n", 10);
    expect(done.ratio).toBe(1);
  });

  it("keeps a partial trailing line", () => {
    const partial = consumeFfmpegProgress("out_time_us=100", 10);
    expect(partial.ratio).toBeNull();
    expect(partial.rest).toBe("out_time_us=100");
  });
});
