// @vitest-environment node

import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Mp4Demuxer } from "./mp4-demuxer";
import { HttpRangeSource } from "./range-source";

let ffmpegAvailable = true;
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  ffmpegAvailable = false;
}

describe.runIf(ffmpegAvailable)("MP4 proxy demux smoke", () => {
  let directory = "";
  let server: Server;
  let url = "";

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "studio-demux-test-"));
    const path = join(directory, "fixture.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x180:rate=24",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "12",
        "-movflags",
        "+faststart",
        path,
      ],
      { stdio: "ignore" },
    );
    const bytes = readFileSync(path);
    server = createServer((request, response) => {
      const range = request.headers.range;
      const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
      if (!match) {
        response.writeHead(200, {
          "Content-Length": bytes.byteLength,
          "Content-Type": "video/mp4",
        });
        response.end(bytes);
        return;
      }
      const start = Number(match[1]);
      const end = Math.min(bytes.byteLength - 1, Number(match[2]));
      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
        "Content-Length": end - start + 1,
        "Content-Type": "video/mp4",
      });
      response.end(bytes.subarray(start, end + 1));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server failed.");
    url = `http://127.0.0.1:${address.port}/fixture.mp4`;
  }, 20_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });

  it("indexes real H.264 samples and keyframes from HTTP ranges", async () => {
    const source = new HttpRangeSource(url, "fixture", {
      credentials: "omit",
      maxCacheBytes: 4 * 1024 * 1024,
    });
    const demuxer = new Mp4Demuxer(source);
    const track = await demuxer.initialize();

    expect(track.codec).toMatch(/^avc1/);
    expect(track.codedWidth).toBe(320);
    expect(track.codedHeight).toBe(180);
    expect(track.description?.byteLength).toBeGreaterThan(8);
    expect(track.samples.length).toBeGreaterThanOrEqual(23);
    expect(track.samples[0]?.is_sync).toBe(true);
    expect(demuxer.nearestSampleIndex(0.5)).toBeGreaterThan(0);
    expect(demuxer.precedingSyncIndex(demuxer.nearestSampleIndex(0.75))).toBeGreaterThanOrEqual(0);

    const sample = track.samples[3]!;
    const data = await demuxer.sampleData(sample);
    expect(data.byteLength).toBe(sample.size);
    expect(source.cacheBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});
