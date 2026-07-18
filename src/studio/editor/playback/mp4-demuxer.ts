import {
  createFile,
  type ISOFile,
  type MP4BoxBuffer,
  type Movie,
  type Sample,
  type Track,
} from "mp4box";
import { HttpRangeSource } from "./range-source";

export type DemuxedVideoTrack = {
  id: number;
  codec: string;
  codedWidth: number;
  codedHeight: number;
  timescale: number;
  duration: number;
  samples: Sample[];
  description?: ArrayBuffer;
  avcLengthSize?: number;
  avcParameterSets?: ArrayBuffer;
};

type AvcConfig = {
  configurationVersion: number;
  AVCProfileIndication: number;
  profile_compatibility: number;
  AVCLevelIndication: number;
  lengthSizeMinusOne: number;
  SPS: Array<{ data: Uint8Array }>;
  PPS: Array<{ data: Uint8Array }>;
  ext?: Uint8Array;
};

function avcDescription(config?: AvcConfig): ArrayBuffer | undefined {
  if (!config?.SPS?.length || !config.PPS?.length) return undefined;
  const size =
    7 +
    config.SPS.reduce((sum, nalu) => sum + 2 + nalu.data.byteLength, 0) +
    config.PPS.reduce((sum, nalu) => sum + 2 + nalu.data.byteLength, 0) +
    (config.ext?.byteLength ?? 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  bytes[offset++] = config.configurationVersion;
  bytes[offset++] = config.AVCProfileIndication;
  bytes[offset++] = config.profile_compatibility;
  bytes[offset++] = config.AVCLevelIndication;
  bytes[offset++] = 0xfc | (config.lengthSizeMinusOne & 0x03);
  bytes[offset++] = 0xe0 | (config.SPS.length & 0x1f);
  for (const nalu of config.SPS) {
    bytes[offset++] = (nalu.data.byteLength >>> 8) & 0xff;
    bytes[offset++] = nalu.data.byteLength & 0xff;
    bytes.set(nalu.data, offset);
    offset += nalu.data.byteLength;
  }
  bytes[offset++] = config.PPS.length & 0xff;
  for (const nalu of config.PPS) {
    bytes[offset++] = (nalu.data.byteLength >>> 8) & 0xff;
    bytes[offset++] = nalu.data.byteLength & 0xff;
    bytes.set(nalu.data, offset);
    offset += nalu.data.byteLength;
  }
  if (config.ext?.byteLength) bytes.set(config.ext, offset);
  return bytes.buffer;
}

function avcParameterSets(config?: AvcConfig): ArrayBuffer | undefined {
  const nalus = [...(config?.SPS ?? []), ...(config?.PPS ?? [])];
  if (!nalus.length) return undefined;
  const size = nalus.reduce((sum, nalu) => sum + 4 + nalu.data.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const nalu of nalus) {
    bytes.set([0, 0, 0, 1], offset);
    offset += 4;
    bytes.set(nalu.data, offset);
    offset += nalu.data.byteLength;
  }
  return bytes.buffer;
}

function sampleEntryFor(file: ISOFile, trackId: number): Record<string, unknown> | undefined {
  const track = file.moov?.traks?.find((item) => item.tkhd?.track_id === trackId);
  return track?.mdia?.minf?.stbl?.stsd?.entries?.[0] as
    | Record<string, unknown>
    | undefined;
}

function appendAt(file: ISOFile, data: ArrayBuffer, offset: number): void {
  const buffer = data as MP4BoxBuffer;
  buffer.fileStart = offset;
  file.appendBuffer(buffer);
}

export class Mp4Demuxer {
  readonly source: HttpRangeSource;
  private file: ISOFile | null = null;
  private movie: Movie | null = null;
  private videoTrackValue: DemuxedVideoTrack | null = null;
  private initPromise: Promise<DemuxedVideoTrack> | null = null;

  constructor(source: HttpRangeSource) {
    this.source = source;
  }

  get videoTrack(): DemuxedVideoTrack | null {
    return this.videoTrackValue;
  }

  initialize(signal?: AbortSignal): Promise<DemuxedVideoTrack> {
    if (this.videoTrackValue) return Promise.resolve(this.videoTrackValue);
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initializeInternal(signal);
    return this.initPromise;
  }

  async sampleData(sample: Sample, signal?: AbortSignal): Promise<ArrayBuffer> {
    return this.source.readSample(sample, signal);
  }

  nearestSampleIndex(timeSeconds: number): number {
    const samples = this.videoTrackValue?.samples ?? [];
    if (!samples.length) return -1;
    let low = 0;
    let high = samples.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const sampleTime = samples[mid]!.cts / samples[mid]!.timescale;
      if (sampleTime <= timeSeconds) low = mid + 1;
      else high = mid - 1;
    }
    return Math.max(0, Math.min(samples.length - 1, high));
  }

  precedingSyncIndex(sampleIndex: number): number {
    const samples = this.videoTrackValue?.samples ?? [];
    for (let index = Math.min(sampleIndex, samples.length - 1); index >= 0; index -= 1) {
      if (samples[index]?.is_sync) return index;
    }
    return 0;
  }

  prefetchWindow(timeSeconds: number, seconds = 1.5, signal?: AbortSignal): Promise<void> {
    const track = this.videoTrackValue;
    if (!track) return Promise.resolve();
    const first = this.precedingSyncIndex(this.nearestSampleIndex(timeSeconds));
    let last = first;
    while (
      last + 1 < track.samples.length &&
      track.samples[last + 1]!.cts / track.timescale < timeSeconds + seconds
    ) {
      last += 1;
    }
    const firstSample = track.samples[first];
    const lastSample = track.samples[last];
    if (!firstSample || !lastSample) return Promise.resolve();
    return this.source.prefetch(
      [
        {
          start: firstSample.offset,
          end: lastSample.offset + lastSample.size - 1,
        },
      ],
      signal,
    );
  }

  private async initializeInternal(signal?: AbortSignal): Promise<DemuxedVideoTrack> {
    const size = await this.source.probe(signal);
    const file = createFile();
    this.file = file;
    let resolveReady: ((movie: Movie) => void) | null = null;
    let rejectReady: ((error: Error) => void) | null = null;
    const ready = new Promise<Movie>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    file.onReady = (movie) => resolveReady?.(movie);
    file.onError = (_module, message) => rejectReady?.(new Error(message));

    const chunkSize = 2 * 1024 * 1024;
    for (let offset = 0; offset < size && !this.movie; offset += chunkSize) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const end = Math.min(size - 1, offset + chunkSize - 1);
      const bytes = await this.source.read(offset, end, signal);
      appendAt(file, bytes, offset);
      // Fast-start proxies resolve on the first chunk. Yield so onReady can run.
      await Promise.resolve();
      if (file.readySent) {
        this.movie = await ready;
        break;
      }
    }
    file.flush();
    this.movie ??= await ready;

    const track = this.movie.videoTracks[0] as Track | undefined;
    if (!track) throw new Error("MP4 has no video track.");
    const samples = file.getTrackSamplesInfo(track.id);
    const entry = sampleEntryFor(file, track.id);
    const avcC = entry?.avcC as AvcConfig | undefined;
    const result: DemuxedVideoTrack = {
      id: track.id,
      codec: track.codec,
      codedWidth: track.video?.width ?? track.track_width,
      codedHeight: track.video?.height ?? track.track_height,
      timescale: track.timescale,
      duration: track.duration / track.timescale,
      samples,
      description: avcDescription(avcC),
      avcLengthSize: avcC ? (avcC.lengthSizeMinusOne & 0x03) + 1 : undefined,
      avcParameterSets: avcParameterSets(avcC),
    };
    this.videoTrackValue = result;
    return result;
  }
}
