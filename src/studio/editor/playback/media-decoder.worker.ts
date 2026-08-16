/// <reference lib="webworker" />

import { Mp4Demuxer } from "./mp4-demuxer";
import { HttpRangeSource } from "./range-source";

type InitMessage = {
  type: "init";
  requestId: number;
  assetId: string;
  url: string;
};

type FrameMessage = {
  type: "frame";
  requestId: number;
  assetId: string;
  url: string;
  sourceTime: number;
  generation: number;
  /** Clip speed — scales how far the pump should stay ahead. */
  speed?: number;
  /** Seconds of source media to keep decoded ahead of the playhead. */
  aheadSec?: number;
  /** Paused review needs the requested sample, not a nearby one. */
  exact?: boolean;
  /**
   * Transition partner / non-critical leg during play: return a cached
   * neighbour immediately (or miss) — never block the display clock on a
   * cold keyframe seek.
   */
  soft?: boolean;
};

type PlayMessage = {
  type: "play";
  assetId: string;
  url: string;
  sourceTime: number;
  generation: number;
  speed?: number;
  aheadSec?: number;
};

type PauseMessage = {
  type: "pause";
  assetId?: string;
};

type ScrubMessage = {
  type: "scrub";
  assetId: string;
  url: string;
  sourceTime: number;
  generation: number;
};

type PrefetchMessage = {
  type: "prefetch";
  assetId: string;
  url: string;
  sourceTime: number;
  seconds: number;
  generation: number;
};

type WarmMessage = {
  type: "warm";
  assetId: string;
  url: string;
  sourceTime: number;
  generation: number;
};

type DisposeMessage = { type: "dispose"; assetId?: string };
type Incoming =
  | InitMessage
  | FrameMessage
  | PlayMessage
  | PauseMessage
  | ScrubMessage
  | PrefetchMessage
  | WarmMessage
  | DisposeMessage;

type FrameWaiter = {
  targetIndex: number;
  /** How many samples away from the target may satisfy this waiter. */
  slack: number;
  resolve: (frame: VideoFrame) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * How precise the answer has to be.
 * - `play`: the pump owns the buffer; a one-sample neighbour is fine.
 * - `exact`: paused review/frame-step — decode the requested sample.
 * - `coarse`: mid-drag — any nearby cached sample, never wait on decode.
 * - `soft`: transition partner during play — cache hit only; never block.
 */
type FrameMode = "play" | "exact" | "coarse" | "soft";

type Session = {
  assetId: string;
  url: string;
  demuxer: Mp4Demuxer;
  decoder: VideoDecoder | null;
  decoderConfig: VideoDecoderConfig | null;
  annexB: boolean;
  generation: number;
  /** Highest sample index successfully fed into the open decoder stream. */
  decodedThrough: number;
  /** True when the decoder can accept forward delta chunks without reset. */
  streamOpen: boolean;
  /** Last sample index requested by the playhead. */
  playheadIndex: number;
  /** Decode pump should keep filling until this sample index. */
  pumpTargetIndex: number;
  /** Clip speed used to size the ahead window. */
  pumpSpeed: number;
  aheadSec: number;
  pumping: boolean;
  pumpScheduled: boolean;
  /** Latest-wins token so queued scrubs skip superseded times. */
  scrubToken: number;
  frames: Map<number, VideoFrame>;
  waiters: FrameWaiter[];
  touchedAt: number;
  abortController: AbortController;
  init: Promise<void>;
  chain: Promise<void>;
};

const sessions = new Map<string, Session>();
/** ~3s at 30fps so the pump buffer survives 1.5×–2× source advances. */
const MAX_FRAMES_PER_ASSET = 90;
/**
 * Frames are held across seeks now, so the ceiling is global: decoders stall
 * once too many outputs stay open, and idle clips must not hoard them.
 * Two buffers' worth covers the active clip plus a transition partner.
 */
const MAX_TOTAL_FRAMES = 200;
const PROTECTED_SESSIONS = 2;
const MAX_DECODER_SESSIONS = 6;
const DECODE_CHUNK = 24;
const DEFAULT_AHEAD_SEC = 1.5;
const FRAME_WAIT_MS = 1_200;
/** Playpath wait — short; timeout falls back to nearest good frame, not a banner. */
const PLAY_WAIT_MS = 280;
/** Mid-drag may show a nearby cached sample (~0.5s at 30fps) instead of decoding. */
const SCRUB_NEAREST_DISTANCE = 16;
/**
 * Paused review waits this long for the requested sample before showing a
 * neighbour. Warm bytes + an open decoder answer in a few ms, so this only
 * costs anything on a cold GOP.
 */
const EXACT_WAIT_MS = 200;

function totalCacheBytes(): number {
  let total = 0;
  for (const session of sessions.values()) {
    total += session.demuxer.source.cacheBytes;
  }
  return total;
}

function post(message: unknown, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

function rejectWaiters(session: Session, error: Error): void {
  for (const waiter of session.waiters) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
  session.waiters = [];
}

function closeFrames(session: Session): void {
  rejectWaiters(session, new Error("Decoder frames cleared."));
  for (const frame of session.frames.values()) frame.close();
  session.frames.clear();
}

function evictFrames(session: Session, aroundIndex: number): void {
  if (session.frames.size <= MAX_FRAMES_PER_ASSET) return;
  const keepBehind = Math.max(0, session.playheadIndex - 8);
  const indexes = [...session.frames.keys()].sort((a, b) => {
    // Prefer keeping frames at/after the playhead.
    const aBehind = a < keepBehind ? 1 : 0;
    const bBehind = b < keepBehind ? 1 : 0;
    if (aBehind !== bBehind) return bBehind - aBehind;
    return Math.abs(b - aroundIndex) - Math.abs(a - aroundIndex);
  });
  while (session.frames.size > MAX_FRAMES_PER_ASSET) {
    const index = indexes.shift();
    if (index == null) break;
    session.frames.get(index)?.close();
    session.frames.delete(index);
  }
}

/** Reclaim from the least recently used clips before the decoder backs up. */
function enforceGlobalFrameBudget(active: Session): void {
  let total = 0;
  for (const session of sessions.values()) total += session.frames.size;
  if (total <= MAX_TOTAL_FRAMES) return;
  const victims = [...sessions.values()]
    .filter((session) => session !== active)
    .sort((a, b) => a.touchedAt - b.touchedAt)
    .slice(0, Math.max(0, sessions.size - PROTECTED_SESSIONS));
  for (const victim of victims) {
    if (total <= MAX_TOTAL_FRAMES) break;
    const indexes = [...victim.frames.keys()].sort(
      (a, b) =>
        Math.abs(b - victim.playheadIndex) - Math.abs(a - victim.playheadIndex),
    );
    for (const index of indexes) {
      if (total <= MAX_TOTAL_FRAMES) break;
      victim.frames.get(index)?.close();
      victim.frames.delete(index);
      total -= 1;
    }
  }
}

function nearestFrame(
  session: Session,
  targetIndex: number,
  maxDistance = 1,
): VideoFrame | null {
  const exact = session.frames.get(targetIndex);
  if (exact) return exact;
  let best: VideoFrame | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const [index, frame] of session.frames) {
    const nextDistance = Math.abs(index - targetIndex);
    if (nextDistance < distance) {
      best = frame;
      distance = nextDistance;
    }
  }
  return distance <= maxDistance ? best : null;
}

/** Any cached frame closest to target — used to skip broken/slow samples. */
function nearestFrameAny(session: Session, targetIndex: number): VideoFrame | null {
  return nearestFrame(session, targetIndex, Number.POSITIVE_INFINITY);
}

function notifyWaiters(session: Session): void {
  if (!session.waiters.length) return;
  const remaining: FrameWaiter[] = [];
  for (const waiter of session.waiters) {
    const frame = nearestFrame(session, waiter.targetIndex, waiter.slack);
    if (frame) {
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    } else {
      remaining.push(waiter);
    }
  }
  session.waiters = remaining;
}

function waitForFrame(
  session: Session,
  targetIndex: number,
  timeoutMs: number,
  slack = 1,
): Promise<VideoFrame> {
  const existing = nearestFrame(session, targetIndex, slack);
  if (existing) return Promise.resolve(existing);
  return new Promise<VideoFrame>((resolve, reject) => {
    const waiter: FrameWaiter = {
      targetIndex,
      slack,
      resolve,
      reject,
      timer: setTimeout(() => {
        session.waiters = session.waiters.filter((item) => item !== waiter);
        // Never hard-fail the preview over a late sample — hold the closest
        // good frame (skip the broken/slow one) and keep the pump moving.
        const fallback = nearestFrameAny(session, waiter.targetIndex);
        if (fallback) {
          waiter.resolve(fallback);
          return;
        }
        reject(new Error("Frame decode timeout."));
      }, timeoutMs),
    };
    session.waiters.push(waiter);
    notifyWaiters(session);
  });
}

function createSession(assetId: string, url: string): Session {
  const source = new HttpRangeSource(url, assetId, {
    credentials: "omit",
    maxCacheBytes: 64 * 1024 * 1024,
  });
  const demuxer = new Mp4Demuxer(source);
  const session: Session = {
    assetId,
    url,
    demuxer,
    decoder: null,
    decoderConfig: null,
    annexB: false,
    generation: -1,
    decodedThrough: -1,
    streamOpen: false,
    playheadIndex: 0,
    pumpTargetIndex: -1,
    pumpSpeed: 1,
    aheadSec: DEFAULT_AHEAD_SEC,
    pumping: false,
    pumpScheduled: false,
    scrubToken: 0,
    frames: new Map(),
    waiters: [],
    touchedAt: performance.now(),
    abortController: new AbortController(),
    init: Promise.resolve(),
    chain: Promise.resolve(),
  };
  session.init = (async () => {
    const track = await demuxer.initialize();
    const baseConfig: VideoDecoderConfig = {
      codec: track.codec,
      codedWidth: track.codedWidth,
      codedHeight: track.codedHeight,
      optimizeForLatency: true,
      ...(track.description ? { description: track.description } : {}),
    };
    const candidates: Array<{ config: VideoDecoderConfig; annexB: boolean }> = [
      {
        config: { ...baseConfig, hardwareAcceleration: "prefer-hardware" },
        annexB: false,
      },
      {
        config: { ...baseConfig, hardwareAcceleration: "prefer-software" },
        annexB: false,
      },
      { config: baseConfig, annexB: false },
      ...(track.codec.startsWith("avc")
        ? [
            {
              config: {
                codec: track.codec,
                codedWidth: track.codedWidth,
                codedHeight: track.codedHeight,
                optimizeForLatency: true,
              },
              annexB: true,
            },
          ]
        : []),
    ];
    let selected: { config: VideoDecoderConfig; annexB: boolean } | null = null;
    for (const candidate of candidates) {
      const support = await VideoDecoder.isConfigSupported(candidate.config);
      if (support.supported) {
        selected = {
          config: support.config ?? candidate.config,
          annexB: candidate.annexB,
        };
        break;
      }
    }
    if (!selected) {
      throw new Error(`Unsupported preview codec: ${track.codec}`);
    }
    session.decoderConfig = selected.config;
    session.annexB = selected.annexB;
    session.decoder = new VideoDecoder({
      output: (frame) => {
        const currentTrack = session.demuxer.videoTrack;
        if (!currentTrack) {
          frame.close();
          return;
        }
        const seconds = frame.timestamp / 1_000_000;
        const index = session.demuxer.nearestSampleIndex(seconds);
        const previous = session.frames.get(index);
        previous?.close();
        session.frames.set(index, frame);
        evictFrames(session, index);
        enforceGlobalFrameBudget(session);
        notifyWaiters(session);
      },
      error: (error) => {
        session.streamOpen = false;
        rejectWaiters(session, error);
        post({
          type: "decoder-error",
          assetId,
          error: error.message,
        });
      },
    });
    session.decoder.configure(selected.config);
  })();
  return session;
}

/** Same file when only the signed query token differs. */
function sameMediaFile(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const left = new URL(a, self.location?.href);
    const right = new URL(b, self.location?.href);
    return left.origin === right.origin && left.pathname === right.pathname;
  } catch {
    return false;
  }
}

function getSession(assetId: string, url: string): Session {
  const existing = sessions.get(assetId);
  if (existing && sameMediaFile(existing.url, url)) {
    if (existing.url !== url) {
      // Re-signed link for identical bytes — swap the URL and keep the demux
      // index, byte cache, decoder, and decoded frames.
      existing.url = url;
      existing.demuxer.source.setUrl(url);
    }
    existing.touchedAt = performance.now();
    return existing;
  }
  if (existing) {
    existing.pumping = false;
    existing.abortController.abort();
    existing.decoder?.close();
    closeFrames(existing);
  }
  const session = createSession(assetId, url);
  sessions.set(assetId, session);
  if (sessions.size > MAX_DECODER_SESSIONS) {
    const candidates = [...sessions.values()]
      .filter((item) => item.assetId !== assetId)
      .sort((a, b) => a.touchedAt - b.touchedAt);
    while (sessions.size > MAX_DECODER_SESSIONS) {
      const victim = candidates.shift();
      if (!victim) break;
      victim.pumping = false;
      victim.decoder?.close();
      victim.abortController.abort();
      closeFrames(victim);
      victim.demuxer.source.clear();
      sessions.delete(victim.assetId);
    }
  }
  return session;
}

function configureSessionDecoder(session: Session): VideoDecoder {
  const decoder = session.decoder;
  const config = session.decoderConfig;
  if (!decoder || !config) throw new Error("Decoder did not initialize.");
  rejectWaiters(session, new Error("Decoder reset."));
  decoder.reset();
  decoder.configure(config);
  session.streamOpen = false;
  session.decodedThrough = -1;
  return decoder;
}

function avcToAnnexB(data: ArrayBuffer, lengthSize = 4): ArrayBuffer {
  const input = new Uint8Array(data);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let total = 0;
  while (offset + lengthSize <= input.byteLength) {
    let size = 0;
    for (let index = 0; index < lengthSize; index += 1) {
      size = size * 256 + input[offset + index]!;
    }
    offset += lengthSize;
    if (size <= 0 || offset + size > input.byteLength) {
      throw new Error("Invalid AVC sample data.");
    }
    const nalu = input.subarray(offset, offset + size);
    chunks.push(nalu);
    total += 4 + nalu.byteLength;
    offset += size;
  }
  if (offset !== input.byteLength || chunks.length === 0) {
    throw new Error("Invalid AVC sample framing.");
  }
  const output = new Uint8Array(total);
  let writeOffset = 0;
  for (const nalu of chunks) {
    output.set([0, 0, 0, 1], writeOffset);
    writeOffset += 4;
    output.set(nalu, writeOffset);
    writeOffset += nalu.byteLength;
  }
  return output.buffer;
}

function prependBytes(prefix: ArrayBuffer, body: ArrayBuffer): ArrayBuffer {
  const output = new Uint8Array(prefix.byteLength + body.byteLength);
  output.set(new Uint8Array(prefix), 0);
  output.set(new Uint8Array(body), prefix.byteLength);
  return output.buffer;
}

async function feedSamples(
  session: Session,
  decoder: VideoDecoder,
  first: number,
  last: number,
  forceKeyOnFirst: boolean,
): Promise<void> {
  const track = session.demuxer.videoTrack;
  if (!track) throw new Error("Decoder did not initialize.");
  if (first > last) return;
  // One range GET for the whole GOP/window — serial per-sample fetches were
  // the cold-play stall (N round-trips before the first canvas paint).
  let rangeStart = Number.POSITIVE_INFINITY;
  let rangeEnd = 0;
  for (let index = first; index <= last; index += 1) {
    const sample = track.samples[index]!;
    rangeStart = Math.min(rangeStart, sample.offset);
    rangeEnd = Math.max(rangeEnd, sample.offset + sample.size - 1);
  }
  if (Number.isFinite(rangeStart) && rangeEnd >= rangeStart) {
    await session.demuxer.source.prefetch(
      [{ start: rangeStart, end: rangeEnd }],
      session.abortController.signal,
    );
  }
  for (let index = first; index <= last; index += 1) {
    const sample = track.samples[index]!;
    const isBatchKey =
      (forceKeyOnFirst && index === first) || Boolean(sample.is_sync);
    const sampleData = await session.demuxer.sampleData(
      sample,
      session.abortController.signal,
    );
    let data = session.annexB
      ? avcToAnnexB(sampleData, track.avcLengthSize)
      : sampleData;
    if (session.annexB && isBatchKey && track.avcParameterSets) {
      data = prependBytes(track.avcParameterSets, data);
    }
    decoder.decode(
      new EncodedVideoChunk({
        type: isBatchKey ? "key" : "delta",
        timestamp: Math.round((sample.cts / sample.timescale) * 1_000_000),
        duration: Math.max(
          1,
          Math.round((sample.duration / sample.timescale) * 1_000_000),
        ),
        data,
      }),
    );
  }
  session.decodedThrough = Math.max(session.decodedThrough, last);
  session.streamOpen = true;
}

function indexAheadOf(
  session: Session,
  sourceTime: number,
  speed: number,
  aheadSec: number,
): number {
  const track = session.demuxer.videoTrack;
  if (!track) return -1;
  const aheadTime = sourceTime + Math.max(0.25, aheadSec) * Math.max(1, speed);
  const index = session.demuxer.nearestSampleIndex(aheadTime);
  return Math.min(track.samples.length - 1, Math.max(0, index));
}

function extendPumpTarget(
  session: Session,
  sourceTime: number,
  speed: number,
  aheadSec: number,
): void {
  session.pumpSpeed = Math.max(0.1, speed);
  session.aheadSec = Math.max(0.25, aheadSec);
  const target = indexAheadOf(session, sourceTime, session.pumpSpeed, session.aheadSec);
  session.pumpTargetIndex = Math.max(session.pumpTargetIndex, target);
}

function schedulePump(session: Session): void {
  if (!session.pumping || session.pumpScheduled) return;
  session.pumpScheduled = true;
  session.chain = session.chain
    .then(async () => {
      session.pumpScheduled = false;
      await runPump(session);
    })
    .catch(() => {
      session.pumpScheduled = false;
    });
}

async function runPump(session: Session): Promise<void> {
  await session.init;
  const decoder = session.decoder;
  const track = session.demuxer.videoTrack;
  if (!decoder || !track || !session.pumping) return;

  // Keep filling until the ahead target is covered.
  let guard = 0;
  while (
    session.pumping &&
    session.streamOpen &&
    session.decodedThrough < session.pumpTargetIndex &&
    guard < 40
  ) {
    guard += 1;
    const first = session.decodedThrough + 1;
    if (first >= track.samples.length) break;
    const last = Math.min(
      track.samples.length - 1,
      first + DECODE_CHUNK - 1,
      session.pumpTargetIndex,
    );
    try {
      const sample = track.samples[first]!;
      const time = sample.cts / sample.timescale;
      void session.demuxer.prefetchWindow(
        time,
        Math.max(1, session.aheadSec * session.pumpSpeed),
        session.abortController.signal,
      );
      await feedSamples(session, decoder, first, last, false);
    } catch {
      // Recover with a keyframe at the playhead, then continue pumping.
      try {
        const resetDecoder = configureSessionDecoder(session);
        const sync = session.demuxer.precedingSyncIndex(session.playheadIndex);
        const last = Math.min(
          track.samples.length - 1,
          Math.max(sync + DECODE_CHUNK, session.pumpTargetIndex),
        );
        await feedSamples(session, resetDecoder, sync, last, true);
      } catch {
        session.pumping = false;
        return;
      }
    }
  }

  if (
    session.pumping &&
    session.streamOpen &&
    session.decodedThrough < session.pumpTargetIndex
  ) {
    schedulePump(session);
  }
}

async function keyframeEnsure(
  session: Session,
  targetIndex: number,
  generation: number,
  waitMs = FRAME_WAIT_MS,
  slack = 1,
  /** Decode only through the playhead — pump fills ahead after first paint. */
  paintOnly = false,
): Promise<VideoFrame> {
  const track = session.demuxer.videoTrack;
  if (!track) throw new Error("Decoder did not initialize.");
  // Keep already decoded frames. VideoDecoder.reset() only clears the control
  // queue — emitted VideoFrames stay valid until closed — so a backward seek
  // must not cost the whole cache. Memory stays bounded by evictFrames().
  const resetDecoder = configureSessionDecoder(session);
  session.generation = generation;
  const first = session.demuxer.precedingSyncIndex(targetIndex);
  const last = paintOnly
    ? targetIndex
    : Math.min(track.samples.length - 1, targetIndex + DECODE_CHUNK);
  await feedSamples(session, resetDecoder, first, last, true);
  return waitForFrame(session, targetIndex, waitMs, slack);
}

/**
 * Sample the stream buffer. Playpath: cache hit or short forward feed.
 * Scrub/cold: keyframe seek. Pump keeps the buffer ahead independently.
 */
async function ensureFrame(
  session: Session,
  sourceTime: number,
  generation: number,
  speed = 1,
  aheadSec = DEFAULT_AHEAD_SEC,
  mode: FrameMode = "play",
): Promise<VideoFrame> {
  await session.init;
  const decoder = session.decoder;
  const track = session.demuxer.videoTrack;
  if (!decoder || !track) throw new Error("Decoder did not initialize.");

  const targetIndex = session.demuxer.nearestSampleIndex(sourceTime);
  if (targetIndex < 0) throw new Error("No video sample at requested time.");

  session.playheadIndex = targetIndex;
  extendPumpTarget(session, sourceTime, speed, aheadSec);

  if (session.generation !== generation) {
    // Cancel stale waiters only — keep decoded frames + open stream so
    // timeline scrub can paint immediately instead of a cold keyframe.
    rejectWaiters(session, new Error("Decoder generation changed."));
    session.generation = generation;
  }

  // How far off target a cached frame may be, and how long we may wait for the
  // real one. Frame-by-frame review must not be answered with a neighbour.
  const slack =
    mode === "coarse" || mode === "soft"
      ? SCRUB_NEAREST_DISTANCE
      : mode === "exact"
        ? 0
        : 1;
  const waitMs =
    mode === "play" ? PLAY_WAIT_MS : mode === "exact" ? EXACT_WAIT_MS : FRAME_WAIT_MS;

  const cached = nearestFrame(session, targetIndex, slack);
  if (cached) {
    if (session.pumping) schedulePump(session);
    return cached;
  }
  if (mode === "soft") {
    // Keep the partner decoder warming, but never stall the display clock.
    extendPumpTarget(session, sourceTime, speed, aheadSec);
    if (session.pumping) {
      schedulePump(session);
    } else {
      session.chain = session.chain
        .then(() =>
          keyframeEnsure(
            session,
            targetIndex,
            generation,
            FRAME_WAIT_MS,
            SCRUB_NEAREST_DISTANCE,
          ),
        )
        .then(() => undefined)
        .catch(() => undefined);
    }
    const loose = nearestFrameAny(session, targetIndex);
    if (loose) return loose;
    throw new Error("Soft frame miss.");
  }
  if (mode === "coarse") {
    // Mid-drag with nothing usable cached: seek without blocking the caller on
    // the exact sample, so the next drag position isn't queued behind it.
    return keyframeEnsure(
      session,
      targetIndex,
      generation,
      FRAME_WAIT_MS,
      SCRUB_NEAREST_DISTANCE,
    );
  }

  const canForward =
    session.streamOpen &&
    session.decodedThrough >= 0 &&
    targetIndex > session.decodedThrough;

  try {
    if (canForward) {
      const first = session.decodedThrough + 1;
      const last = Math.min(
        track.samples.length - 1,
        Math.max(targetIndex + DECODE_CHUNK, session.pumpTargetIndex),
      );
      if (first <= last) {
        await feedSamples(session, decoder, first, last, false);
      }
      const frame = await waitForFrame(session, targetIndex, waitMs, slack);
      if (session.pumping) schedulePump(session);
      return frame;
    }

    // Backward / cold / eviction — keyframe to the playhead first (paintOnly on
    // live play/exact review). Ahead decode belongs to the pump, not first paint.
    const paintOnly = mode === "play" || mode === "exact";
    const frame = await keyframeEnsure(
      session,
      targetIndex,
      generation,
      waitMs,
      slack,
      paintOnly,
    );
    if (session.pumping) schedulePump(session);
    return frame;
  } catch (error) {
    session.streamOpen = false;
    const resetDecoder = configureSessionDecoder(session);
    session.generation = generation;
    const first = session.demuxer.precedingSyncIndex(targetIndex);
    const last = Math.min(track.samples.length - 1, targetIndex);
    await feedSamples(session, resetDecoder, first, last, true);
    await resetDecoder.flush();
    session.streamOpen = false;
    session.decodedThrough = Math.max(session.decodedThrough, last);
    // Prefer exact-ish, else any cached frame (skip the bad sample).
    const frame =
      nearestFrame(session, targetIndex) ?? nearestFrameAny(session, targetIndex);
    if (!frame) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    if (session.pumping) schedulePump(session);
    return frame;
  }
}

async function decodeFrame(message: FrameMessage): Promise<void> {
  const session = getSession(message.assetId, message.url);
  const frame = await ensureFrame(
    session,
    message.sourceTime,
    message.generation,
    message.speed ?? session.pumpSpeed,
    message.aheadSec ?? session.aheadSec,
    session.pumping
      ? message.soft
        ? "soft"
        : "play"
      : message.exact
        ? "exact"
        : message.soft
          ? "soft"
          : "coarse",
  );
  const output = frame.clone();
  post(
    {
      type: "frame",
      requestId: message.requestId,
      assetId: message.assetId,
      generation: message.generation,
      sourceTime: message.sourceTime,
      frame: output,
      cacheBytes: totalCacheBytes(),
    },
    [output],
  );
}

async function startPlay(message: PlayMessage): Promise<void> {
  const session = getSession(message.assetId, message.url);
  await session.init;
  session.generation = message.generation;
  session.pumping = true;
  extendPumpTarget(
    session,
    message.sourceTime,
    message.speed ?? 1,
    message.aheadSec ?? DEFAULT_AHEAD_SEC,
  );
  // Prime at the playhead if the buffer is cold or behind.
  const targetIndex = session.demuxer.nearestSampleIndex(message.sourceTime);
  session.playheadIndex = Math.max(0, targetIndex);
  if (!nearestFrame(session, session.playheadIndex)) {
    await ensureFrame(
      session,
      message.sourceTime,
      message.generation,
      message.speed ?? 1,
      message.aheadSec ?? DEFAULT_AHEAD_SEC,
    );
  }
  schedulePump(session);
}

function stopPump(assetId?: string): void {
  const targets = assetId
    ? [sessions.get(assetId)].filter(Boolean)
    : [...sessions.values()];
  for (const session of targets as Session[]) {
    session.pumping = false;
  }
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.type === "dispose") {
    const targets = message.assetId
      ? [sessions.get(message.assetId)].filter(Boolean)
      : [...sessions.values()];
    for (const session of targets as Session[]) {
      session.pumping = false;
      session.abortController.abort();
      session.decoder?.close();
      closeFrames(session);
      session.demuxer.source.clear();
      sessions.delete(session.assetId);
    }
    return;
  }
  if (message.type === "pause") {
    stopPump(message.assetId);
    return;
  }
  if (message.type === "play") {
    const session = getSession(message.assetId, message.url);
    session.chain = session.chain
      .then(() => startPlay(message))
      .catch(() => undefined);
    return;
  }
  if (message.type === "scrub") {
    const session = getSession(message.assetId, message.url);
    session.pumping = false;
    const token = (session.scrubToken += 1);
    session.chain = session.chain
      .then(async () => {
        if (session.scrubToken !== token) return;
        await ensureFrame(
          session,
          message.sourceTime,
          message.generation,
          1,
          0.35,
          "coarse",
        );
      })
      .catch(() => undefined);
    return;
  }
  if (message.type === "prefetch") {
    const session = getSession(message.assetId, message.url);
    session.chain = session.chain
      .then(async () => {
        await session.init;
        if (session.generation > message.generation) return;
        await session.demuxer.prefetchWindow(
          message.sourceTime,
          message.seconds,
          session.abortController.signal,
        );
      })
      .catch(() => undefined);
    return;
  }
  if (message.type === "warm") {
    const session = getSession(message.assetId, message.url);
    session.chain = session.chain
      .then(async () => {
        if (
          session.frames.size > 0 &&
          session.generation === message.generation &&
          session.streamOpen
        ) {
          return;
        }
        await ensureFrame(
          session,
          message.sourceTime,
          message.generation,
          1,
          DEFAULT_AHEAD_SEC,
          "coarse",
        );
      })
      .catch(() => undefined);
    return;
  }
  if (message.type === "init") {
    const session = getSession(message.assetId, message.url);
    void session.init
      .then(() => {
        const track = session.demuxer.videoTrack!;
        post({
          type: "ready",
          requestId: message.requestId,
          assetId: message.assetId,
          duration: track.duration,
          width: track.codedWidth,
          height: track.codedHeight,
          codec: track.codec,
          cacheBytes: totalCacheBytes(),
        });
      })
      .catch((error) => {
        post({
          type: "error",
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return;
  }
  const session = getSession(message.assetId, message.url);
  if (session.generation >= 0 && session.generation !== message.generation) {
    session.abortController.abort();
    session.abortController = new AbortController();
  }
  session.chain = session.chain
    .then(() => decodeFrame(message))
    .catch((error) => {
      post({
        type: "error",
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
};
