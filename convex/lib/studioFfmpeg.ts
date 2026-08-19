"use node";

import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFMPEG_EXEC_OPTS = { maxBuffer: 16 * 1024 * 1024 };
const STDERR_CAP = 16 * 1024 * 1024;

export type FfmpegProgress = {
  durationSec: number;
  onProgress: (ratio: number) => void;
};

let progressHook: FfmpegProgress | null = null;

/** Nested ffmpeg calls inherit this duration→ratio mapping. */
export async function withFfmpegProgress<T>(
  progress: FfmpegProgress,
  run: () => Promise<T>,
): Promise<T> {
  const previous = progressHook;
  progressHook = progress;
  try {
    return await run();
  } finally {
    progressHook = previous;
  }
}

export function consumeFfmpegProgress(
  buffer: string,
  durationSec: number,
): { rest: string; ratio: number | null } {
  let rest = buffer.replace(/\r/g, "\n");
  let ratio: number | null = null;
  let newline = rest.indexOf("\n");
  while (newline >= 0) {
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    newline = rest.indexOf("\n");
    if (!line) continue;
    if (line === "progress=end") {
      ratio = 1;
      continue;
    }
    const us = /^out_time_us=(\d+)$/.exec(line);
    const ms = /^out_time_ms=(\d+)$/.exec(line);
    if (!durationSec || durationSec <= 0) continue;
    if (us) {
      const next = Number(us[1]) / 1e6 / durationSec;
      if (Number.isFinite(next)) ratio = Math.max(0, Math.min(0.999, next));
    } else if (ms) {
      const next = Number(ms[1]) / 1000 / durationSec;
      if (Number.isFinite(next)) ratio = Math.max(0, Math.min(0.999, next));
    }
  }
  return { rest, ratio };
}

function ffmpegArgv(args: string[], withProgress: boolean): string[] {
  return [
    "-hide_banner",
    "-nostats",
    "-loglevel",
    "error",
    ...(withProgress ? ["-progress", "pipe:1"] : []),
    ...args,
  ];
}

function runFfmpegSpawn(args: string[], progress: FfmpegProgress) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("ffmpeg", ffmpegArgv(args, true), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    let stdoutRest = "";
    let lastEmit = 0;
    let lastRatio = -1;
    const emit = (ratio: number) => {
      const now = Date.now();
      if (ratio < 1 && ratio - lastRatio < 0.01 && now - lastEmit < 250) return;
      lastRatio = ratio;
      lastEmit = now;
      try {
        progress.onProgress(ratio);
      } catch {
        /* progress is best-effort */
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutRest += chunk.toString("utf8");
      const consumed = consumeFfmpegProgress(stdoutRest, progress.durationSec);
      stdoutRest = consumed.rest;
      if (consumed.ratio != null) emit(consumed.ratio);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= STDERR_CAP) return;
      const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const room = STDERR_CAP - stderrBytes;
      stderrChunks.push(next.length > room ? next.subarray(0, room) : next);
      stderrBytes += Math.min(next.length, room);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0) {
        emit(1);
        resolve({ stdout: "", stderr });
        return;
      }
      const error = new Error(
        `ffmpeg exited ${code ?? signal ?? "killed"}`,
      ) as Error & { stderr: string; code: number | null };
      error.stderr = stderr;
      error.code = typeof code === "number" ? code : null;
      reject(error);
    });
  });
}

/** Quiet stats so a failed mix does not surface `frame= 0` progress as the error. */
export function runFfmpeg(args: string[], progress = progressHook) {
  if (progress && progress.durationSec > 0) {
    return runFfmpegSpawn(args, progress);
  }
  return execFileAsync("ffmpeg", ffmpegArgv(args, false), FFMPEG_EXEC_OPTS);
}

export function runFfprobe(args: string[]) {
  return execFileAsync("ffprobe", args, FFMPEG_EXEC_OPTS);
}

export async function downloadToFile(
  url: string,
  dest: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download media (${response.status}).`);
  }
  const total = Number(response.headers.get("content-length") || 0);
  if (!onProgress || !response.body || !Number.isFinite(total) || total <= 0) {
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(dest, buffer);
    onProgress?.(1);
    return;
  }
  let loaded = 0;
  let lastEmit = 0;
  const nodeStream = Readable.fromWeb(
    response.body as import("node:stream/web").ReadableStream,
  );
  nodeStream.on("data", (chunk: Buffer) => {
    loaded += chunk.length;
    const now = Date.now();
    if (now - lastEmit < 200 && loaded < total) return;
    lastEmit = now;
    onProgress(Math.min(0.99, loaded / total));
  });
  await pipeline(nodeStream, createWriteStream(dest));
  onProgress(1);
}

export async function probeAudioStream(
  path: string,
): Promise<{ present: boolean; channels: number }> {
  try {
    const { stdout } = await runFfprobe([
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=index,channels",
      "-of",
      "csv=p=0",
      path,
    ]);
    const line = stdout.trim().split(/\r?\n/)[0] ?? "";
    if (!line.length) return { present: false, channels: 0 };
    const channels = Number(line.split(",")[1]);
    return {
      present: true,
      channels: Number.isFinite(channels) && channels > 0 ? channels : 2,
    };
  } catch {
    return { present: false, channels: 0 };
  }
}

export async function hasAudioStream(path: string): Promise<boolean> {
  return (await probeAudioStream(path)).present;
}

export async function probePictureStream(
  path: string,
): Promise<{ present: boolean; codec?: string; nbFrames?: number }> {
  try {
    const { stdout } = await runFfprobe([
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,nb_frames",
      "-of",
      "csv=p=0",
      path,
    ]);
    const line = stdout.trim().split(/\r?\n/)[0] ?? "";
    if (!line.length) return { present: false };
    const [codec, framesRaw] = line.split(",");
    const nbFrames = Number(framesRaw);
    return {
      present: true,
      codec: codec || undefined,
      nbFrames: Number.isFinite(nbFrames) && nbFrames > 0 ? nbFrames : undefined,
    };
  } catch {
    return { present: false };
  }
}

export async function hasVideoStream(path: string): Promise<boolean> {
  return (await probePictureStream(path)).present;
}

export async function probeMediaDurationSeconds(path: string): Promise<number> {
  try {
    const { stdout } = await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    const duration = Number(stdout.trim());
    return Number.isFinite(duration) && duration > 0.05 ? duration : 0.05;
  } catch {
    return 0.05;
  }
}
