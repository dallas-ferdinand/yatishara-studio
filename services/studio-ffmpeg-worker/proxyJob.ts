import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { putObject, signBunnyCdnUrl } from "./bunny.ts";
import { convexPost } from "./convexHost.ts";

const execFileAsync = promisify(execFile);

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
};

type ProbeResult = {
  streams?: ProbeStream[];
  format?: { duration?: string };
};

export type ProxyJob = {
  convexSiteUrl: string;
  token: string;
  jobId: string;
  bunnyPath: string;
  kind: "video" | "audio";
};

function parseRate(value?: string): number | undefined {
  if (!value) return undefined;
  const [numerator, denominator = "1"] = value.split("/");
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return undefined;
  const rate = n / d;
  return rate > 0 && rate < 1_000 ? rate : undefined;
}

function finitePositive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function proxyPathFor(sourcePath: string, height: 720 | 1080): string {
  const slash = sourcePath.lastIndexOf("/");
  const base = slash >= 0 ? sourcePath.slice(0, slash) : sourcePath;
  return `${base}/edit-proxy-${height}p.mp4`;
}

function audioProxyPathFor(sourcePath: string): string {
  const slash = sourcePath.lastIndexOf("/");
  const base = slash >= 0 ? sourcePath.slice(0, slash) : sourcePath;
  return `${base}/edit-proxy-audio.m4a`;
}

async function downloadToFile(url: string, path: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Proxy source download failed (${response.status}).`);
  }
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(path),
  );
}

async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
    { maxBuffer: 4 * 1024 * 1024, timeout: 120_000 },
  );
  return JSON.parse(stdout) as ProbeResult;
}

async function transcodeAudioProxy(source: string, destination: string): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y", "-i", source, "-vn", "-c:a", "aac", "-b:a", "96k", "-ac", "1",
      "-ar", "48000", "-movflags", "+faststart", destination,
    ],
    { maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60_000 },
  );
}

async function transcodeProxy(
  source: string,
  destination: string,
  maxWidth: number,
  maxHeight: number,
): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0?",
      "-vf",
      `scale=w='min(${maxWidth},iw)':h='min(${maxHeight},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30,setsar=1,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-level", "4.0",
      "-crf", "23", "-g", "15", "-keyint_min", "15", "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart", "-max_muxing_queue_size", "2048",
      destination,
    ],
    { maxBuffer: 8 * 1024 * 1024, timeout: 15 * 60_000 },
  );
}

export async function runProxyJob(job: ProxyJob): Promise<void> {
  const workDir = await mkdtemp(join(tmpdir(), "yatishara-proxy-"));
  const sourcePath = join(workDir, "source");
  try {
    const expires = Math.floor(Date.now() / 1000) + 30 * 60;
    const sourceUrl = await signBunnyCdnUrl(job.bunnyPath, expires);
    await downloadToFile(sourceUrl, sourcePath);
    const sourceProbe = await probe(sourcePath);

    if (job.kind === "audio") {
      const outputPath = join(workDir, "proxy-audio.m4a");
      await transcodeAudioProxy(sourcePath, outputPath);
      const proxyProbe = await probe(outputPath);
      const bytes = new Uint8Array(await readFile(outputPath));
      const proxyPath = audioProxyPathFor(job.bunnyPath);
      await putObject({
        path: proxyPath,
        body: bytes,
        contentType: "audio/mp4",
      });
      const sourceAudio = sourceProbe.streams?.find((stream) => stream.codec_type === "audio");
      const proxyAudio = proxyProbe.streams?.find((stream) => stream.codec_type === "audio");
      await convexPost(job.convexSiteUrl, job.token, "/api/ffmpeg-worker/proxy-complete", {
        jobId: job.jobId,
        proxyPath,
        proxyByteSize: bytes.byteLength,
        durationSeconds:
          finitePositive(sourceProbe.format?.duration) ??
          finitePositive(proxyProbe.format?.duration),
        audioCodec: proxyAudio?.codec_name ?? sourceAudio?.codec_name ?? "aac",
      });
      return;
    }

    const outputPath = join(workDir, "proxy-720.mp4");
    const output1080Path = join(workDir, "proxy-1080.mp4");
    await transcodeProxy(sourcePath, outputPath, 1280, 720);
    await transcodeProxy(sourcePath, output1080Path, 1920, 1080);
    const proxyProbe = await probe(outputPath);
    const bytes = new Uint8Array(await readFile(outputPath));
    const bytes1080 = new Uint8Array(await readFile(output1080Path));
    const proxyPath = proxyPathFor(job.bunnyPath, 720);
    const proxy1080Path = proxyPathFor(job.bunnyPath, 1080);
    await Promise.all([
      putObject({ path: proxyPath, body: bytes, contentType: "video/mp4" }),
      putObject({ path: proxy1080Path, body: bytes1080, contentType: "video/mp4" }),
    ]);
    const sourceVideo = sourceProbe.streams?.find((stream) => stream.codec_type === "video");
    const sourceAudio = sourceProbe.streams?.find((stream) => stream.codec_type === "audio");
    const proxyVideo = proxyProbe.streams?.find((stream) => stream.codec_type === "video");
    const rotation =
      sourceVideo?.side_data_list?.find((item) => Number.isFinite(item.rotation))?.rotation ??
      finitePositive(sourceVideo?.tags?.rotate);
    await convexPost(job.convexSiteUrl, job.token, "/api/ffmpeg-worker/proxy-complete", {
      jobId: job.jobId,
      proxyPath,
      proxyByteSize: bytes.byteLength,
      proxy1080Path,
      proxy1080ByteSize: bytes1080.byteLength,
      durationSeconds: finitePositive(sourceProbe.format?.duration),
      width: finitePositive(sourceVideo?.width),
      height: finitePositive(sourceVideo?.height),
      frameRate:
        parseRate(sourceVideo?.avg_frame_rate) ??
        parseRate(sourceVideo?.r_frame_rate) ??
        parseRate(proxyVideo?.avg_frame_rate),
      videoCodec: sourceVideo?.codec_name,
      videoProfile: sourceVideo?.profile,
      audioCodec: sourceAudio?.codec_name,
      proxyKeyframeIntervalSeconds: 0.5,
      rotation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown media proxy failure.";
    await convexPost(job.convexSiteUrl, job.token, "/api/ffmpeg-worker/proxy-fail", {
      jobId: job.jobId,
      error: message,
    }).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
