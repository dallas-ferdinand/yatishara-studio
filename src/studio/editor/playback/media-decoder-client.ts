export type DecoderCapabilities = {
  supported: boolean;
  reason?: string;
};

export type DecodedFrame = {
  assetId: string;
  sourceTime: number;
  generation: number;
  frame: VideoFrame;
  /** When set, compositor can keep the GPU texture across paints (stills). */
  textureKey?: string;
};

export type MediaDecoderMetrics = {
  pendingRequests: number;
  framesReceived: number;
  errors: number;
  cacheBytes: number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export function detectDecoderCapabilities(): DecoderCapabilities {
  if (typeof Worker === "undefined") {
    return { supported: false, reason: "Web Workers are unavailable." };
  }
  if (typeof VideoDecoder === "undefined" || typeof EncodedVideoChunk === "undefined") {
    return { supported: false, reason: "This Chromium build does not expose WebCodecs." };
  }
  if (typeof OffscreenCanvas === "undefined") {
    return { supported: false, reason: "OffscreenCanvas is unavailable." };
  }
  return { supported: true };
}

export class MediaDecoderClient {
  private readonly worker: Worker;
  private requestId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly prefetchState = new Map<
    string,
    { sourceTime: number; generation: number; requestedAt: number }
  >();
  private readonly playingAssets = new Set<string>();
  private metricsValue: MediaDecoderMetrics = {
    pendingRequests: 0,
    framesReceived: 0,
    errors: 0,
    cacheBytes: 0,
  };
  private disposed = false;

  constructor() {
    const capabilities = detectDecoderCapabilities();
    if (!capabilities.supported) {
      throw new Error(capabilities.reason);
    }
    this.worker = new Worker(new URL("./media-decoder.worker.ts", import.meta.url), {
      name: "studio-media-decoder",
    });
    this.worker.onmessage = (event) => {
      const message = event.data as {
        type: string;
        requestId?: number;
        error?: string;
        cacheBytes?: number;
      };
      if (typeof message.cacheBytes === "number") {
        this.metricsValue.cacheBytes = Math.max(
          this.metricsValue.cacheBytes,
          message.cacheBytes,
        );
      }
      if (message.requestId == null) return;
      const pending = this.pending.get(message.requestId);
      if (!pending) {
        if ("frame" in message && message.frame instanceof VideoFrame) {
          message.frame.close();
        }
        return;
      }
      this.pending.delete(message.requestId);
      this.metricsValue.pendingRequests = this.pending.size;
      if (message.type === "error") {
        this.metricsValue.errors += 1;
        pending.reject(new Error(message.error ?? "Media decoder failed."));
      } else {
        if (message.type === "frame") this.metricsValue.framesReceived += 1;
        pending.resolve(message);
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Media decoder worker crashed.");
      this.metricsValue.errors += 1;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  initialize(assetId: string, url: string): Promise<{
    duration: number;
    width: number;
    height: number;
    codec: string;
  }> {
    return this.request({
      type: "init",
      assetId,
      url,
    }) as Promise<{
      duration: number;
      width: number;
      height: number;
      codec: string;
    }>;
  }

  /**
   * Start the continuous decode pump for an asset. Play samples the buffer;
   * the pump keeps filling ahead of the playhead.
   */
  startPlayback(args: {
    assetId: string;
    url: string;
    sourceTime: number;
    generation: number;
    speed?: number;
    aheadSec?: number;
  }): void {
    if (this.disposed) return;
    this.playingAssets.add(args.assetId);
    this.worker.postMessage({
      type: "play",
      assetId: args.assetId,
      url: args.url,
      sourceTime: args.sourceTime,
      generation: args.generation,
      speed: args.speed ?? 1,
      aheadSec: args.aheadSec ?? 0.75,
    });
  }

  /** Stop the decode pump (keeps cached frames). Omit assetId to stop all. */
  stopPlayback(assetId?: string): void {
    if (this.disposed) return;
    if (assetId) {
      this.playingAssets.delete(assetId);
      this.worker.postMessage({ type: "pause", assetId });
      return;
    }
    this.playingAssets.clear();
    this.worker.postMessage({ type: "pause" });
  }

  /** Scrub: stop pump and keyframe-seek to sourceTime. */
  scrub(args: {
    assetId: string;
    url: string;
    sourceTime: number;
    generation: number;
  }): void {
    if (this.disposed) return;
    this.playingAssets.delete(args.assetId);
    this.worker.postMessage({
      type: "scrub",
      assetId: args.assetId,
      url: args.url,
      sourceTime: args.sourceTime,
      generation: args.generation,
    });
  }

  requestFrame(
    assetId: string,
    url: string,
    sourceTime: number,
    generation: number,
    opts?: { speed?: number; aheadSec?: number; exact?: boolean; soft?: boolean },
  ): Promise<DecodedFrame> {
    // One promise per call — never share a VideoFrame across consumers.
    return this.request({
      type: "frame",
      assetId,
      url,
      sourceTime,
      generation,
      speed: opts?.speed ?? 1,
      aheadSec: opts?.aheadSec ?? (this.playingAssets.has(assetId) ? 0.75 : 0.5),
      exact: opts?.exact ?? false,
      soft: opts?.soft ?? false,
    }) as Promise<DecodedFrame>;
  }

  prefetch(
    assetId: string,
    url: string,
    sourceTime: number,
    generation: number,
    seconds = 1.5,
  ): void {
    if (this.disposed) return;
    const now = performance.now();
    const previous = this.prefetchState.get(assetId);
    if (
      previous &&
      previous.generation === generation &&
      Math.abs(previous.sourceTime - sourceTime) < 0.5 &&
      now - previous.requestedAt < 1_000
    ) {
      return;
    }
    this.prefetchState.set(assetId, { sourceTime, generation, requestedAt: now });
    this.worker.postMessage({
      type: "prefetch",
      assetId,
      url,
      sourceTime,
      generation,
      seconds,
    });
  }

  /** Decode-ahead into the worker frame cache without transferring a frame. */
  warm(assetId: string, url: string, sourceTime: number, generation: number): void {
    if (this.disposed) return;
    const key = `warm:${assetId}`;
    const now = performance.now();
    const previous = this.prefetchState.get(key);
    if (
      previous &&
      previous.generation === generation &&
      Math.abs(previous.sourceTime - sourceTime) < 0.5 &&
      now - previous.requestedAt < 1_000
    ) {
      return;
    }
    this.prefetchState.set(key, { sourceTime, generation, requestedAt: now });
    this.worker.postMessage({ type: "warm", assetId, url, sourceTime, generation });
  }

  disposeAsset(assetId: string): void {
    this.prefetchState.delete(assetId);
    this.playingAssets.delete(assetId);
    if (!this.disposed) this.worker.postMessage({ type: "dispose", assetId });
  }

  metrics(): MediaDecoderMetrics {
    return { ...this.metricsValue, pendingRequests: this.pending.size };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playingAssets.clear();
    this.worker.postMessage({ type: "dispose" });
    this.worker.terminate();
    const error = new Error("Media decoder was disposed.");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.prefetchState.clear();
  }

  private request(message: Record<string, unknown>): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("Media decoder was disposed."));
    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.metricsValue.pendingRequests = this.pending.size;
      this.worker.postMessage({ ...message, requestId });
    });
  }
}
