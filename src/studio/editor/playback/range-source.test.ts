import { describe, expect, it, vi } from "vitest";
import { HttpRangeSource } from "./range-source";

function response(bytes: number[], range: string, total = 2_000_000): Response {
  return new Response(new Uint8Array(bytes), {
    status: 206,
    headers: { "Content-Range": range || `bytes 0-${bytes.length - 1}/${total}` },
  });
}

describe("HttpRangeSource", () => {
  it("binds the native fetch receiver for worker execution", async () => {
    const nativeLikeFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(response([0], "bytes 0-0/1", 1));
    });
    vi.stubGlobal("fetch", nativeLikeFetch);
    try {
      const source = new HttpRangeSource("https://cdn.test/proxy.mp4", "asset");
      await expect(source.probe()).resolves.toBe(1);
      expect(nativeLikeFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to HEAD Content-Length when CORS hides Content-Range", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "Content-Length": "2000000" },
        });
      }
      const range = new Headers(init?.headers).get("Range");
      if (range === "bytes=0-0") {
        // 206 without Content-Range, like a cross-origin CDN response
        // missing Access-Control-Expose-Headers.
        return new Response(new Uint8Array([0]), { status: 206 });
      }
      if (range === "bytes=0-524287") {
        return response(new Array(524_288).fill(9), "");
      }
      throw new Error(`Unexpected range ${range}`);
    }) as unknown as typeof fetch;

    const source = new HttpRangeSource("https://cdn.test/proxy.mp4", "asset", {
      fetchImpl,
    });
    expect(await source.probe()).toBe(2_000_000);
    expect(source.supportsRanges).toBe(true);
    const bytes = await source.readSample({ offset: 10, size: 4 });
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array(4).fill(9));
  });

  it("coalesces sample reads into aligned cached ranges", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("Range");
      if (range === "bytes=0-0") return response([0], "bytes 0-0/2000000");
      if (range === "bytes=0-524287") {
        return response(new Array(524_288).fill(7), "bytes 0-524287/2000000");
      }
      throw new Error(`Unexpected range ${range}`);
    }) as unknown as typeof fetch;

    const source = new HttpRangeSource("https://cdn.test/proxy.mp4", "asset", {
      fetchImpl,
    });
    const first = await source.readSample({ offset: 100, size: 20 });
    const second = await source.readSample({ offset: 400, size: 10 });

    expect(new Uint8Array(first)).toEqual(new Uint8Array(20).fill(7));
    expect(new Uint8Array(second)).toEqual(new Uint8Array(10).fill(7));
    expect(fetchImpl).toHaveBeenCalledTimes(2); // probe + one shared media range
  });

  it("does not download a full response repeatedly when ranges are unsupported", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Length": "4" },
      }),
    ) as unknown as typeof fetch;
    const source = new HttpRangeSource("https://cdn.test/file.mp4", "asset", {
      fetchImpl,
    });

    expect(new Uint8Array(await source.read(1, 2))).toEqual(new Uint8Array([2, 3]));
    expect(new Uint8Array(await source.read(0, 0))).toEqual(new Uint8Array([1]));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("evicts old aligned ranges under a hard memory budget", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("Range");
      if (range === "bytes=0-0") return response([0], "bytes 0-0/2000000");
      const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
      if (!match) throw new Error(`Unexpected range ${range}`);
      const start = Number(match[1]);
      const end = Number(match[2]);
      return response(
        new Array(end - start + 1).fill(start === 0 ? 1 : 2),
        `bytes ${start}-${end}/2000000`,
      );
    }) as unknown as typeof fetch;
    const source = new HttpRangeSource("https://cdn.test/proxy.mp4", "asset", {
      fetchImpl,
      maxCacheBytes: 600_000,
    });

    await source.read(100, 200);
    await source.read(600_000, 600_100);
    expect(source.cacheBytes).toBeLessThanOrEqual(600_000);
    await source.read(100, 200);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // probe, range A, range B, A again
  });
});
