import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VideoChunkPrefetcher,
  releaseVideoPrefetch,
  scheduleVideoPrefetch,
} from "./video-chunk-prefetch.js";

afterEach(() => {
  vi.unstubAllGlobals();
  releaseVideoPrefetch("https://cdn.example.com/video.mp4");
});

describe("VideoChunkPrefetcher", () => {
  it("stops warming when the server ignores Range and returns 200", async () => {
    const fetches = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        fetches.push({ url, range: init?.headers?.Range });
        return {
          status: 200,
          ok: true,
          headers: {
            get: (name) => (name === "Content-Length" ? "10485760" : null),
          },
          body: { cancel: vi.fn(async () => {}) },
          arrayBuffer: vi.fn(async () => new ArrayBuffer(10485760)),
        };
      }),
    );

    const p = new VideoChunkPrefetcher("https://cdn.example.com/video.mp4");
    await p.start();

    expect(p.supportsRange).toBe(false);
    expect(p.queue).toEqual([]);
    // Probe once; must not download "chunks" as full files.
    expect(fetches.length).toBe(1);
    expect(fetches[0].range).toBe("bytes=0-0");
  });

  it("accepts only 206 responses for chunk fetches", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        call += 1;
        if (call === 1) {
          return {
            status: 206,
            ok: true,
            headers: {
              get: (name) => (name === "Content-Range" ? "bytes 0-0/2048" : null),
            },
            arrayBuffer: vi.fn(async () => new ArrayBuffer(1)),
            body: { cancel: vi.fn(async () => {}) },
          };
        }
        if (init?.headers?.Range === "bytes=0-2047") {
          return {
            status: 200,
            ok: true,
            headers: { get: () => null },
            arrayBuffer: vi.fn(async () => new ArrayBuffer(2048)),
            body: { cancel: vi.fn(async () => {}) },
          };
        }
        return {
          status: 206,
          ok: true,
          headers: { get: () => null },
          arrayBuffer: vi.fn(async () => new ArrayBuffer(512)),
          body: { cancel: vi.fn(async () => {}) },
        };
      }),
    );

    const p = scheduleVideoPrefetch("https://cdn.example.com/video.mp4");
    await p.start();
    await new Promise((r) => setTimeout(r, 20));

    expect(p.supportsRange).toBe(false);
    expect(p.queue).toEqual([]);
  });
});
