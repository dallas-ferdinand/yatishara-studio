export type ByteRange = { start: number; end: number };

type CacheEntry = {
  key: string;
  data: ArrayBuffer;
  bytes: number;
  touchedAt: number;
};

export type RangeSourceOptions = {
  credentials?: RequestCredentials;
  maxCacheBytes?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_CHUNK_BYTES = 512 * 1024;
const DEFAULT_CACHE_BYTES = 96 * 1024 * 1024;

/**
 * Timestamp-aware callers use sample offsets from the MP4 index. This source
 * coalesces those reads into aligned HTTP ranges and enforces a hard LRU budget.
 */
export class HttpRangeSource {
  readonly url: string;
  readonly identity: string;
  private readonly credentials: RequestCredentials;
  private readonly maxCacheBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<ArrayBuffer>>();
  private cachedBytes = 0;
  private sizeValue: number | null = null;
  private rangeSupported = true;

  constructor(url: string, identity: string, options: RangeSourceOptions = {}) {
    this.url = url;
    this.identity = identity;
    // Bunny URLs are bearer-signed in the query string. Sending cookies turns
    // a wildcard CDN CORS response into a credentialed request and browsers
    // reject it before WebCodecs receives any bytes.
    this.credentials = options.credentials ?? "omit";
    this.maxCacheBytes = options.maxCacheBytes ?? DEFAULT_CACHE_BYTES;
    // Native WorkerGlobalScope.fetch validates its receiver. Storing the
    // unbound function and invoking it as `this.fetchImpl(...)` changes `this`
    // to HttpRangeSource and Chromium throws "Illegal invocation".
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get size(): number | null {
    return this.sizeValue;
  }

  get supportsRanges(): boolean {
    return this.rangeSupported;
  }

  get cacheBytes(): number {
    return this.cachedBytes;
  }

  async probe(signal?: AbortSignal): Promise<number> {
    if (this.sizeValue != null) return this.sizeValue;
    const response = await this.fetchImpl(this.url, {
      headers: { Range: "bytes=0-0" },
      credentials: this.credentials,
      signal,
    });
    if (response.status === 206) {
      await response.arrayBuffer();
      const match = /\/(\d+)\s*$/.exec(response.headers.get("Content-Range") ?? "");
      if (match) {
        this.sizeValue = Number(match[1]);
        return this.sizeValue;
      }
      // Cross-origin responses hide Content-Range unless the CDN sends
      // Access-Control-Expose-Headers. Content-Length is CORS-safelisted,
      // so a HEAD request still reveals the total size.
      const head = await this.fetchImpl(this.url, {
        method: "HEAD",
        credentials: this.credentials,
        signal,
      }).catch(() => null);
      const headLength = Number(head?.headers.get("Content-Length"));
      if (head?.ok && Number.isFinite(headLength) && headLength > 0) {
        this.sizeValue = headLength;
        return this.sizeValue;
      }
      // Last resort: stream the whole file once and serve reads from cache.
      const full = await this.fetchImpl(this.url, {
        credentials: this.credentials,
        signal,
      });
      if (!full.ok) throw new Error(`Media probe failed (${full.status}).`);
      const body = await full.arrayBuffer();
      this.rangeSupported = false;
      this.sizeValue = body.byteLength;
      this.store("0-full", body);
      return this.sizeValue;
    }
    if (response.status === 200) {
      this.rangeSupported = false;
      const length = Number(response.headers.get("Content-Length"));
      const body = await response.arrayBuffer();
      this.sizeValue = Number.isFinite(length) && length > 0 ? length : body.byteLength;
      this.store("0-full", body);
      return this.sizeValue;
    }
    throw new Error(`Media probe failed (${response.status}).`);
  }

  async read(start: number, end: number, signal?: AbortSignal): Promise<ArrayBuffer> {
    const size = await this.probe(signal);
    const safeStart = Math.max(0, Math.min(size - 1, Math.floor(start)));
    const safeEnd = Math.max(safeStart, Math.min(size - 1, Math.floor(end)));
    if (!this.rangeSupported) {
      const full = this.cache.get("0-full")?.data;
      if (!full) throw new Error("Full media response was not cached.");
      return full.slice(safeStart, safeEnd + 1);
    }

    const alignedStart = Math.floor(safeStart / DEFAULT_CHUNK_BYTES) * DEFAULT_CHUNK_BYTES;
    const alignedEnd = Math.min(
      size - 1,
      Math.ceil((safeEnd + 1) / DEFAULT_CHUNK_BYTES) * DEFAULT_CHUNK_BYTES - 1,
    );
    const key = `${alignedStart}-${alignedEnd}`;
    const cached = this.cache.get(key);
    if (cached) {
      cached.touchedAt = performance.now();
      return cached.data.slice(safeStart - alignedStart, safeEnd - alignedStart + 1);
    }

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.fetchRange(alignedStart, alignedEnd, signal);
      this.inFlight.set(key, pending);
      void pending.finally(() => this.inFlight.delete(key));
    }
    const data = await pending;
    return data.slice(safeStart - alignedStart, safeEnd - alignedStart + 1);
  }

  async readSample(
    sample: { offset: number; size: number },
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    return this.read(sample.offset, sample.offset + sample.size - 1, signal);
  }

  async prefetch(
    ranges: ByteRange[],
    signal?: AbortSignal,
  ): Promise<void> {
    // Sequential by priority; read() still deduplicates overlap/in-flight work.
    for (const range of ranges) {
      if (signal?.aborted) return;
      await this.read(range.start, range.end, signal);
    }
  }

  clear(): void {
    this.cache.clear();
    this.cachedBytes = 0;
  }

  private async fetchRange(
    start: number,
    end: number,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    const response = await this.fetchImpl(this.url, {
      headers: { Range: `bytes=${start}-${end}` },
      credentials: this.credentials,
      signal,
    });
    if (response.status === 200) {
      // Server ignored the Range header; keep the full body instead of failing.
      const body = await response.arrayBuffer();
      this.rangeSupported = false;
      this.sizeValue = body.byteLength;
      this.store("0-full", body);
      return body.slice(start, Math.min(body.byteLength, end + 1));
    }
    if (response.status !== 206) {
      throw new Error(`Media range request failed (${response.status}).`);
    }
    const data = await response.arrayBuffer();
    this.store(`${start}-${end}`, data);
    return data;
  }

  private store(key: string, data: ArrayBuffer): void {
    const previous = this.cache.get(key);
    if (previous) this.cachedBytes -= previous.bytes;
    const entry: CacheEntry = {
      key,
      data,
      bytes: data.byteLength,
      touchedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    this.cache.set(key, entry);
    this.cachedBytes += entry.bytes;
    this.evict();
  }

  private evict(): void {
    if (this.cachedBytes <= this.maxCacheBytes) return;
    const entries = [...this.cache.values()].sort((a, b) => a.touchedAt - b.touchedAt);
    for (const entry of entries) {
      if (this.cachedBytes <= this.maxCacheBytes) break;
      this.cache.delete(entry.key);
      this.cachedBytes -= entry.bytes;
    }
  }
}
