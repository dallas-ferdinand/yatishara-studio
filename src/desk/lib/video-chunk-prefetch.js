/** HTTP Range prefetch — warms cache ahead of <video> / <audio> playback. */

const CHUNK_SIZE = 512 * 1024;
const INITIAL_BYTES = 3 * 1024 * 1024;
const TAIL_BYTES = 3 * 1024 * 1024;
const READAHEAD_BYTES = 12 * 1024 * 1024;
const MIN_FILE_FOR_TAIL = 8 * 1024 * 1024;
const MAX_IN_FLIGHT = 6;
const HIGH_PRIORITY_CHUNKS = 4;
const PROGRESS_THROTTLE_MS = 350;

const prefetchers = new Map();

function chunkKey(start, end) {
  return `${start}-${end}`;
}

function isPrefetchableUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("blob:") || url.startsWith("data:")) return false;
  return true;
}

export class VideoChunkPrefetcher {
  constructor(url, { fileSize = null, credentials = "include" } = {}) {
    this.url = url;
    this.fileSize = fileSize > 0 ? fileSize : null;
    this.credentials = credentials;
    this.fetched = new Set();
    this.queue = [];
    this.inFlight = 0;
    this.aborted = false;
    this.started = false;
    this.highWaterMark = 0;
    this.lastPlaybackSample = 0;
    this.chunksCompleted = 0;
    this.initialWarmDone = false;
    this._warmWaiters = [];
  }

  _resolveWarmWaiters() {
    if (!this.initialWarmDone) return;
    const list = this._warmWaiters;
    this._warmWaiters = [];
    for (const fn of list) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  /** Resolves after first ~1MB warmed (or start completes). */
  whenInitialWarm(timeoutMs = 2500) {
    if (this.initialWarmDone) return Promise.resolve(this);
    return new Promise((resolve) => {
      const done = () => resolve(this);
      this._warmWaiters.push(done);
      if (timeoutMs > 0) {
        setTimeout(done, timeoutMs);
      }
    });
  }

  async probeSize() {
    if (this.fileSize > 0) return this.fileSize;
    try {
      const res = await fetch(this.url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        credentials: this.credentials,
      });
      if (res.status === 206) {
        const cr = res.headers.get("Content-Range") || "";
        const m = /\/(\d+)\s*$/.exec(cr);
        if (m) {
          this.fileSize = parseInt(m[1], 10);
          this.fetched.add(chunkKey(0, 0));
          return this.fileSize;
        }
      }
      if (res.status === 200) {
        const len = res.headers.get("Content-Length");
        if (len) this.fileSize = parseInt(len, 10);
        else {
          const buf = await res.arrayBuffer();
          this.fileSize = buf.byteLength;
        }
      }
    } catch {
      /* ignore probe errors — video element will still try */
    }
    return this.fileSize;
  }

  enqueueRange(start, end) {
    if (this.aborted || !this.fileSize) return;
    let s = Math.max(0, Math.floor(start));
    const e = Math.min(this.fileSize - 1, Math.floor(end));
    if (s > e) return;

    s = Math.floor(s / CHUNK_SIZE) * CHUNK_SIZE;
    while (s <= e) {
      const ce = Math.min(s + CHUNK_SIZE - 1, this.fileSize - 1);
      const key = chunkKey(s, ce);
      if (!this.fetched.has(key)) {
        this.fetched.add(key);
        this.queue.push({ start: s, end: ce, key });
      }
      s += CHUNK_SIZE;
    }
    this.pump();
  }

  enqueueInitial() {
    const size = this.fileSize;
    if (!size) return;
    this.enqueueRange(0, Math.min(size - 1, INITIAL_BYTES - 1));
    if (size >= MIN_FILE_FOR_TAIL) {
      this.enqueueRange(Math.max(0, size - TAIL_BYTES), size - 1);
    }
    this.highWaterMark = Math.min(size, INITIAL_BYTES);
  }

  onPlaybackSample(currentTime, duration) {
    if (this.aborted || !this.fileSize || !duration || duration <= 0) return;
    const now = Date.now();
    if (now - this.lastPlaybackSample < PROGRESS_THROTTLE_MS) return;
    this.lastPlaybackSample = now;

    const ratio = Math.max(0, Math.min(1, currentTime / duration));
    const bytePos = Math.floor(ratio * this.fileSize);
    this.enqueueRange(bytePos, Math.min(this.fileSize - 1, bytePos + READAHEAD_BYTES));

    if (this.highWaterMark < bytePos + CHUNK_SIZE * 2) {
      const seqEnd = Math.min(this.fileSize - 1, this.highWaterMark + CHUNK_SIZE * 8);
      this.enqueueRange(this.highWaterMark, seqEnd);
      this.highWaterMark = seqEnd + 1;
    }
  }

  pump() {
    if (this.aborted) return;
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length > 0) {
      const item = this.queue.shift();
      this.inFlight += 1;
      void this.fetchRange(item).finally(() => {
        this.inFlight -= 1;
        this.pump();
      });
    }
  }

  async fetchRange({ start, end, key }) {
    const priority =
      this.chunksCompleted < HIGH_PRIORITY_CHUNKS ? "high" : "low";
    try {
      const init = {
        headers: { Range: `bytes=${start}-${end}` },
        credentials: this.credentials,
      };
      if (typeof Request !== "undefined" && "priority" in Request.prototype) {
        init.priority = priority;
      }
      const res = await fetch(this.url, init);
      if (!res.ok && res.status !== 206) {
        this.fetched.delete(key);
        return;
      }
      await res.arrayBuffer();
      this.chunksCompleted += 1;
      if (!this.initialWarmDone && start === 0) {
        this.initialWarmDone = true;
        this._resolveWarmWaiters();
      }
    } catch {
      this.fetched.delete(key);
    }
  }

  async start() {
    if (this.started || this.aborted) return this;
    this.started = true;
    if (this.fileSize > 0) {
      this.enqueueInitial();
    } else {
      await this.probeSize();
      this.enqueueInitial();
    }
    if (!this.initialWarmDone) {
      setTimeout(() => {
        if (!this.initialWarmDone) {
          this.initialWarmDone = true;
          this._resolveWarmWaiters();
        }
      }, 1800);
    }
    return this;
  }

  destroy() {
    this.aborted = true;
    this.queue = [];
    this._resolveWarmWaiters();
  }
}

export function getOrCreatePrefetcher(url, options = {}) {
  if (!isPrefetchableUrl(url)) return null;
  let p = prefetchers.get(url);
  if (!p) {
    p = new VideoChunkPrefetcher(url, options);
    prefetchers.set(url, p);
  } else if (options.fileSize > 0 && !p.fileSize) {
    p.fileSize = options.fileSize;
  }
  return p;
}

/** Fire-and-forget warm (tab open / hover). Safe to call repeatedly. */
export function scheduleVideoPrefetch(url, options = {}) {
  const p = getOrCreatePrefetcher(url, options);
  if (p && !p.started) void p.start();
  return p;
}

export function releaseVideoPrefetch(url) {
  const p = prefetchers.get(url);
  if (p) {
    p.destroy();
    prefetchers.delete(url);
  }
}
