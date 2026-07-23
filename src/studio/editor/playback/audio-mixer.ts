import type { ClipEffects, EditorMediaItem } from "../types";
import { audioFadeGainAtLocalTime } from "../editorEffects";
import type { RenderSlice } from "./timeline-compiler";

type ActiveSource = {
  node: AudioBufferSourceNode;
  gain: GainNode;
  generation: number;
};

type ActiveMediaElement = {
  element: HTMLAudioElement;
  generation: number;
};

type DesiredVoice = {
  sourceTime: number;
  gain: number;
  clipEnd: number;
  /** Clip-local time at this sync (for scheduling fade envelopes). */
  localTime: number;
  clipDuration: number;
  volume: number;
  effects: ClipEffects | undefined;
  transitionGain: number;
};

function applyGainNow(param: AudioParam, gain: number, when: number): void {
  const value = Math.max(0, Math.min(2, gain));
  param.cancelScheduledValues(when);
  param.setValueAtTime(value, when);
}

/**
 * Schedule a short lookahead of the fade envelope so volume keeps moving
 * even if the next video frame sync is late.
 */
function scheduleFadeLookahead(
  param: AudioParam,
  voice: DesiredVoice,
  when: number,
  lookaheadSec = 0.35,
): void {
  const nowGain =
    voice.volume *
    audioFadeGainAtLocalTime(voice.effects, voice.clipDuration, voice.localTime) *
    voice.transitionGain;
  applyGainNow(param, nowGain, when);
  const remain = Math.max(0, voice.clipDuration - voice.localTime);
  const window = Math.min(lookaheadSec, remain);
  if (window < 0.02) return;
  const steps = Math.max(2, Math.ceil(window * 40));
  for (let i = 1; i <= steps; i += 1) {
    const dt = (window * i) / steps;
    const local = voice.localTime + dt;
    const g =
      voice.volume *
      audioFadeGainAtLocalTime(voice.effects, voice.clipDuration, local) *
      voice.transitionGain;
    param.linearRampToValueAtTime(Math.max(0, Math.min(2, g)), when + dt);
  }
}

export function transitionAudioGain(
  role: "single" | "outgoing" | "incoming",
  progress: number,
): number {
  const p = Math.max(0, Math.min(1, progress));
  if (role === "outgoing") return Math.max(0, 1 - p * 2);
  if (role === "incoming") return Math.max(0, p * 2 - 1);
  return 1;
}

export class AudioMixer {
  readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly bufferTouched = new Map<string, number>();
  private readonly bufferBytes = new Map<string, number>();
  private totalBufferBytes = 0;
  private readonly loading = new Map<string, Promise<AudioBuffer>>();
  private readonly active = new Map<string, ActiveSource>();
  private readonly activeMedia = new Map<string, ActiveMediaElement>();
  private disposed = false;

  constructor(context?: AudioContext) {
    this.context =
      context ??
      new AudioContext({
        latencyHint: "interactive",
        sampleRate: 48_000,
      });
    this.master = this.context.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.context.destination);
  }

  clockSeconds = (): number => this.context.currentTime;

  async resume(): Promise<void> {
    if (this.context.state === "suspended") await this.context.resume();
  }

  async prepare(
    slice: RenderSlice,
    mediaById: ReadonlyMap<string, EditorMediaItem>,
  ): Promise<boolean> {
    const bedAssetIds = new Set<string>();
    const requests: Promise<AudioBuffer>[] = [];

    for (const item of [...slice.audio, ...(slice.preloadAudio ?? [])]) {
      const clip = item.clip;
      if (!clip.assetId || clip.muted) continue;
      const media = mediaById.get(clip.assetId);
      if (!media || media.kind === "image") continue;
      // Beds: prefer the original signed file (already small AAC/MP3). Proxy is
      // a fallback when the original fetch/decode fails.
      const url = media.url ?? media.proxyUrl;
      const fallback = media.url && media.proxyUrl && media.url !== media.proxyUrl
        ? media.proxyUrl
        : undefined;
      if (!url) continue;
      if (slice.audio.some((active) => active.clip.clipId === clip.clipId)) {
        bedAssetIds.add(clip.assetId);
      }
      requests.push(this.load(clip.assetId, url, fallback));
    }

    for (const sample of slice.video) {
      const clip = sample.clip;
      if (!clip.assetId || clip.muted) continue;
      const media = mediaById.get(clip.assetId);
      if (!media || media.kind === "image") continue;
      const url = media.proxyUrl ?? media.url;
      const fallback = media.proxyUrl && media.url && media.proxyUrl !== media.url
        ? media.url
        : undefined;
      if (!url) continue;
      requests.push(this.load(clip.assetId, url, fallback));
    }

    if (requests.length) {
      // Video assets without an audio stream reject decode; wait for the ones
      // that succeed so dedicated timeline audio still lands in the cache.
      await Promise.allSettled(requests);
    }

    // Beds are ready only when every active bed buffered — callers use this for
    // post-prepare sync, not for stalling the video frame pipeline.
    for (const assetId of bedAssetIds) {
      if (!this.buffers.has(assetId)) return false;
    }
    return true;
  }

  /** True when every non-muted bed in the slice has a decoded buffer. */
  bedsReady(slice: RenderSlice): boolean {
    for (const item of slice.audio) {
      if (!item.clip.assetId || item.clip.muted) continue;
      if (!this.buffers.has(item.clip.assetId)) return false;
    }
    return true;
  }

  sync(
    slice: RenderSlice,
    generation: number,
    mediaById: ReadonlyMap<string, EditorMediaItem>,
    playing: boolean,
  ): void {
    if (!playing || this.disposed) {
      this.stopAll();
      return;
    }

    const desired = new Map<string, DesiredVoice>();
    for (const item of slice.audio) {
      if (!item.clip.muted && item.clip.assetId) {
        const localTime = slice.timelineTime - item.clip.timelineStart;
        const clipDuration = item.clip.timelineEnd - item.clip.timelineStart;
        desired.set(item.clip.clipId, {
          sourceTime: item.sourceTime,
          gain: item.gain,
          clipEnd: item.clip.sourceEnd,
          localTime,
          clipDuration,
          volume: item.clip.volume,
          effects: item.clip.clip.effects,
          transitionGain: 1,
        });
      }
    }
    // Embedded video audio follows its natural clip interval. We do not start B
    // before trimIn because projects currently have no hidden audio handles.
    for (const sample of slice.video) {
      const clip = sample.clip;
      if (
        clip.muted ||
        !clip.assetId ||
        slice.timelineTime < clip.timelineStart ||
        slice.timelineTime >= clip.timelineEnd
      ) {
        continue;
      }
      const localTime = slice.timelineTime - clip.timelineStart;
      const clipDuration = clip.timelineEnd - clip.timelineStart;
      const transitionGain = transitionAudioGain(
        sample.role,
        slice.transition?.progress ?? (sample.role === "incoming" ? 1 : 0),
      );
      const fade = audioFadeGainAtLocalTime(clip.clip.effects, clipDuration, localTime);
      desired.set(`video:${clip.clipId}`, {
        sourceTime: sample.sourceTime,
        gain: clip.volume * fade * transitionGain,
        clipEnd: clip.sourceEnd,
        localTime,
        clipDuration,
        volume: clip.volume,
        effects: clip.clip.effects,
        transitionGain,
      });
    }

    for (const [key, active] of this.active) {
      if (!desired.has(key) || active.generation !== generation) {
        try {
          active.node.stop();
        } catch {
          /* already stopped */
        }
        active.node.disconnect();
        active.gain.disconnect();
        this.active.delete(key);
      }
    }
    for (const [key, active] of this.activeMedia) {
      if (!desired.has(key) || active.generation !== generation) {
        active.element.pause();
        active.element.removeAttribute("src");
        active.element.load();
        this.activeMedia.delete(key);
      }
    }

    const now = this.context.currentTime;
    for (const [key, item] of desired) {
      const clipId = key.startsWith("video:") ? key.slice(6) : key;
      const clip =
        slice.video.find((sample) => sample.clip.clipId === clipId)?.clip ??
        slice.audio.find((sample) => sample.clip.clipId === clipId)?.clip;
      if (!clip?.assetId) continue;
      const buffer = this.buffers.get(clip.assetId);
      if (!buffer) {
        const media = mediaById.get(clip.assetId);
        const url = media?.url ?? media?.proxyUrl;
        if (clip.kind === "audio" && url) {
          this.syncMediaElement(key, url, item, generation);
        }
        continue;
      }
      // Keep a CORS-free media element already playing this bed instead of
      // switching outputs mid-play when a late Web Audio decode succeeds.
      const activeMedia = this.activeMedia.get(key);
      if (activeMedia?.generation === generation) {
        activeMedia.element.volume = Math.max(0, Math.min(1, item.gain));
        continue;
      }
      const existing = this.active.get(key);
      if (existing?.generation === generation) {
        scheduleFadeLookahead(existing.gain.gain, item, now);
        continue;
      }
      const node = this.context.createBufferSource();
      const gain = this.context.createGain();
      node.buffer = buffer;
      scheduleFadeLookahead(gain.gain, item, now);
      node.connect(gain);
      gain.connect(this.master);
      node.onended = () => {
        if (this.active.get(key)?.node === node) this.active.delete(key);
        node.disconnect();
        gain.disconnect();
      };
      const offset = Math.max(0, Math.min(buffer.duration - 0.001, item.sourceTime));
      const duration = Math.max(0.01, Math.min(buffer.duration, item.clipEnd) - offset);
      node.start(now, offset, duration);
      this.active.set(key, { node, gain, generation });
    }
  }

  stopAll(): void {
    for (const source of this.active.values()) {
      try {
        source.node.stop();
      } catch {
        /* already stopped */
      }
      source.node.disconnect();
      source.gain.disconnect();
    }
    this.active.clear();
    for (const source of this.activeMedia.values()) {
      source.element.pause();
      source.element.removeAttribute("src");
      source.element.load();
    }
    this.activeMedia.clear();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    this.buffers.clear();
    this.bufferTouched.clear();
    this.bufferBytes.clear();
    this.totalBufferBytes = 0;
    this.loading.clear();
    this.master.disconnect();
    await this.context.close();
  }

  metrics(): { cacheBytes: number; activeSources: number } {
    return {
      cacheBytes: this.totalBufferBytes,
      activeSources: this.active.size + this.activeMedia.size,
    };
  }

  private syncMediaElement(
    key: string,
    url: string,
    item: DesiredVoice,
    generation: number,
  ): void {
    const existing = this.activeMedia.get(key);
    if (existing?.generation === generation) {
      existing.element.volume = Math.max(0, Math.min(1, item.gain));
      if (existing.element.paused) {
        void existing.element.play().catch(() => undefined);
      }
      return;
    }
    if (typeof Audio === "undefined") return;

    const element = new Audio();
    element.preload = "auto";
    element.volume = Math.max(0, Math.min(1, item.gain));
    // Deliberately do not set crossOrigin: CDN media playback is permitted,
    // while CORS fetch/Web Audio decoding may be blocked by the pull zone.
    element.src = url;
    this.activeMedia.set(key, { element, generation });

    const seekToSource = () => {
      if (this.activeMedia.get(key)?.element !== element) return;
      const duration = Number.isFinite(element.duration)
        ? element.duration
        : item.clipEnd;
      element.currentTime = Math.max(
        0,
        Math.min(Math.max(0, duration - 0.001), item.sourceTime),
      );
    };
    element.addEventListener("loadedmetadata", seekToSource, { once: true });
    try {
      seekToSource();
    } catch {
      // Metadata is not available yet; loadedmetadata will seek.
    }
    void element.play().catch(() => undefined);
    element.onended = () => {
      if (this.activeMedia.get(key)?.element === element) {
        this.activeMedia.delete(key);
      }
    };
  }

  private load(
    assetId: string,
    url: string,
    fallbackUrl?: string,
  ): Promise<AudioBuffer> {
    const cached = this.buffers.get(assetId);
    if (cached) {
      this.bufferTouched.set(assetId, performance.now());
      return Promise.resolve(cached);
    }
    const existing = this.loading.get(assetId);
    if (existing) return existing;
    const request = this.fetchDecode(url)
      .catch((error) => {
        if (fallbackUrl && fallbackUrl !== url) {
          return this.fetchDecode(fallbackUrl);
        }
        throw error;
      })
      .then((buffer) => {
        this.buffers.set(assetId, buffer);
        const bytes = buffer.length * buffer.numberOfChannels * 4;
        this.bufferBytes.set(assetId, bytes);
        this.bufferTouched.set(assetId, performance.now());
        this.totalBufferBytes += bytes;
        this.evictAudioBuffers();
        this.loading.delete(assetId);
        return buffer;
      })
      .catch((error) => {
        this.loading.delete(assetId);
        throw error;
      });
    this.loading.set(assetId, request);
    return request;
  }

  private async fetchDecode(url: string): Promise<AudioBuffer> {
    const response = await fetch(url, { credentials: "omit", mode: "cors" });
    if (!response.ok) throw new Error(`Audio fetch failed (${response.status}).`);
    const data = await response.arrayBuffer();
    return await this.context.decodeAudioData(data.slice(0));
  }

  private evictAudioBuffers(): void {
    const maxBytes = 128 * 1024 * 1024;
    if (this.totalBufferBytes <= maxBytes) return;
    const oldest = [...this.bufferTouched.entries()].sort((a, b) => a[1] - b[1]);
    for (const [assetId] of oldest) {
      if (this.totalBufferBytes <= maxBytes) break;
      this.buffers.delete(assetId);
      this.bufferTouched.delete(assetId);
      const bytes = this.bufferBytes.get(assetId) ?? 0;
      this.bufferBytes.delete(assetId);
      this.totalBufferBytes -= bytes;
    }
  }
}
