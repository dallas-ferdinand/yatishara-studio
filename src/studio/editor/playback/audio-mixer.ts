import type { EditorMediaItem } from "../types";
import type { RenderSlice } from "./timeline-compiler";

type ActiveSource = {
  node: AudioBufferSourceNode;
  gain: GainNode;
  generation: number;
};

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
    const clips = [...slice.audio, ...slice.video.map((sample) => ({ clip: sample.clip }))];
    const requests: Promise<AudioBuffer>[] = [];
    for (const { clip } of clips) {
      if (!clip.assetId || clip.muted) continue;
      const media = mediaById.get(clip.assetId);
      // Prefer the original signed URL for dedicated audio beds; edit proxies
      // are video-oriented and may be missing for audio assets.
      const url =
        media?.kind === "audio"
          ? media.url ?? media.proxyUrl
          : media?.proxyUrl ?? media?.url;
      if (!url || media?.kind === "image") continue;
      requests.push(this.load(clip.assetId, url));
    }
    if (!requests.length) return true;
    // Video assets without an audio stream reject decode; wait for the ones
    // that succeed so dedicated timeline audio still lands in the cache.
    const results = await Promise.allSettled(requests);
    return results.some((result) => result.status === "fulfilled") || results.length === 0;
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

    const desired = new Map<string, { sourceTime: number; gain: number; clipEnd: number }>();
    for (const item of slice.audio) {
      if (!item.clip.muted && item.clip.assetId) {
        desired.set(item.clip.clipId, {
          sourceTime: item.sourceTime,
          gain: item.gain,
          clipEnd: item.clip.sourceEnd,
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
      desired.set(`video:${clip.clipId}`, {
        sourceTime: sample.sourceTime,
        gain:
          clip.volume *
          transitionAudioGain(
            sample.role,
            slice.transition?.progress ?? (sample.role === "incoming" ? 1 : 0),
          ),
        clipEnd: clip.sourceEnd,
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

    for (const [key, item] of desired) {
      const clipId = key.startsWith("video:") ? key.slice(6) : key;
      const clip =
        slice.video.find((sample) => sample.clip.clipId === clipId)?.clip ??
        slice.audio.find((sample) => sample.clip.clipId === clipId)?.clip;
      if (!clip?.assetId) continue;
      const buffer = this.buffers.get(clip.assetId);
      if (!buffer) continue;
      const existing = this.active.get(key);
      if (existing?.generation === generation) {
        existing.gain.gain.setTargetAtTime(item.gain, this.context.currentTime, 0.008);
        continue;
      }
      const node = this.context.createBufferSource();
      const gain = this.context.createGain();
      node.buffer = buffer;
      gain.gain.setValueAtTime(0, this.context.currentTime);
      gain.gain.linearRampToValueAtTime(item.gain, this.context.currentTime + 0.01);
      node.connect(gain);
      gain.connect(this.master);
      node.onended = () => {
        if (this.active.get(key)?.node === node) this.active.delete(key);
        node.disconnect();
        gain.disconnect();
      };
      const offset = Math.max(0, Math.min(buffer.duration - 0.001, item.sourceTime));
      const duration = Math.max(0.01, Math.min(buffer.duration, item.clipEnd) - offset);
      node.start(this.context.currentTime, offset, duration);
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
      activeSources: this.active.size,
    };
  }

  private load(assetId: string, url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(assetId);
    if (cached) {
      this.bufferTouched.set(assetId, performance.now());
      return Promise.resolve(cached);
    }
    const existing = this.loading.get(assetId);
    if (existing) return existing;
    const request = fetch(url, { credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(`Audio fetch failed (${response.status}).`);
        return response.arrayBuffer();
      })
      .then((data) => this.context.decodeAudioData(data))
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
