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
  | PrefetchMessage
  | WarmMessage
  | DisposeMessage;

type Session = {
  assetId: string;
  url: string;
  demuxer: Mp4Demuxer;
  decoder: VideoDecoder | null;
  decoderConfig: VideoDecoderConfig | null;
  annexB: boolean;
  generation: number;
  decodedThrough: number;
  frames: Map<number, VideoFrame>;
  touchedAt: number;
  abortController: AbortController;
  init: Promise<void>;
  chain: Promise<void>;
};

const sessions = new Map<string, Session>();
const MAX_FRAMES_PER_ASSET = 24;
const MAX_DECODER_SESSIONS = 6;

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

function closeFrames(session: Session): void {
  for (const frame of session.frames.values()) frame.close();
  session.frames.clear();
}

function evictFrames(session: Session, aroundIndex: number): void {
  if (session.frames.size <= MAX_FRAMES_PER_ASSET) return;
  const indexes = [...session.frames.keys()].sort(
    (a, b) => Math.abs(b - aroundIndex) - Math.abs(a - aroundIndex),
  );
  while (session.frames.size > MAX_FRAMES_PER_ASSET) {
    const index = indexes.shift();
    if (index == null) break;
    session.frames.get(index)?.close();
    session.frames.delete(index);
  }
}

function nearestFrame(session: Session, targetIndex: number): VideoFrame | null {
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
  return distance <= 1 ? best : null;
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
    frames: new Map(),
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
            // Some Chromium builds reject otherwise valid avcC metadata.
            // Without a description WebCodecs expects Annex-B chunks.
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
      },
      error: (error) => {
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

function getSession(assetId: string, url: string): Session {
  const existing = sessions.get(assetId);
  if (existing?.url === url) {
    existing.touchedAt = performance.now();
    return existing;
  }
  if (existing) {
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
  decoder.reset();
  decoder.configure(config);
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

async function ensureFrame(
  session: Session,
  sourceTime: number,
  generation: number,
): Promise<VideoFrame> {
  await session.init;
  let decoder = session.decoder;
  const track = session.demuxer.videoTrack;
  if (!decoder || !track) throw new Error("Decoder did not initialize.");

  const targetIndex = session.demuxer.nearestSampleIndex(sourceTime);
  if (targetIndex < 0) throw new Error("No video sample at requested time.");

  // Decoded frames are immutable; a pause/seek generation bump must not
  // throw away a cache hit and force a keyframe re-decode.
  const cached = nearestFrame(session, targetIndex);
  if (cached) {
    session.generation = generation;
    return cached;
  }

  if (session.generation !== generation) {
    closeFrames(session);
    session.decodedThrough = -1;
    session.generation = generation;
  }

  let frame = nearestFrame(session, targetIndex);
  if (!frame) {
    // flush() puts VideoDecoder into "key chunk required" state. Every new
    // batch must therefore reset/configure and begin at a sync sample.
    decoder = configureSessionDecoder(session);
    const first = session.demuxer.precedingSyncIndex(targetIndex);
    const last = Math.min(track.samples.length - 1, targetIndex + 8);
    for (let index = first; index <= last; index += 1) {
      const sample = track.samples[index]!;
      const isBatchKey = index === first;
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
    await decoder.flush();
    session.decodedThrough = Math.max(session.decodedThrough, last);
    frame = nearestFrame(session, targetIndex);
  }

  if (!frame) throw new Error("Decoder produced no frame.");
  return frame;
}

async function decodeFrame(message: FrameMessage): Promise<void> {
  const session = getSession(message.assetId, message.url);
  const frame = await ensureFrame(session, message.sourceTime, message.generation);
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

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.type === "dispose") {
    const targets = message.assetId
      ? [sessions.get(message.assetId)].filter(Boolean)
      : [...sessions.values()];
    for (const session of targets as Session[]) {
      session.abortController.abort();
      session.decoder?.close();
      closeFrames(session);
      session.demuxer.source.clear();
      sessions.delete(session.assetId);
    }
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
    // Decode ahead into the session frame cache so the clip boundary render
    // is a cache hit instead of a network + keyframe decode stall.
    const session = getSession(message.assetId, message.url);
    session.chain = session.chain
      .then(async () => {
        if (session.frames.size > 0 && session.generation === message.generation) return;
        await ensureFrame(session, message.sourceTime, message.generation);
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
