import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { runFfprobe } from "../../convex/lib/studioFfmpeg.ts";
import type { CompositorDrawable } from "../../src/studio/editor/playback/compositor-2d.ts";

export type BitmapSize = { width: number; height: number };

/**
 * Flowing-mode reader. Paused `readable` + `read()` misses the first burst
 * and deadlocks once ffmpeg fills the 64KB pipe.
 */
class ByteReader {
  private chunks: Buffer[] = [];
  private length = 0;
  private ended = false;
  private error: Error | null = null;
  private waiters: Array<() => void> = [];

  constructor(stream: NodeJS.ReadableStream) {
    stream.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.chunks.push(buf);
      this.length += buf.length;
      this.wake();
    });
    stream.on("end", () => {
      this.ended = true;
      this.wake();
    });
    stream.on("error", (err: Error) => {
      this.error = err;
      this.wake();
    });
  }

  private wake(): void {
    const waiters = this.waiters.splice(0);
    for (const fn of waiters) fn();
  }

  async readExact(bytes: number): Promise<Buffer> {
    while (this.length < bytes) {
      if (this.error) throw this.error;
      if (this.ended) {
        throw new Error("Video decoder ended before the frame was ready.");
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    const out = Buffer.allocUnsafe(bytes);
    let offset = 0;
    while (offset < bytes) {
      const next = this.chunks[0]!;
      const take = Math.min(next.length, bytes - offset);
      next.copy(out, offset, 0, take);
      offset += take;
      this.length -= take;
      if (take === next.length) this.chunks.shift();
      else this.chunks[0] = next.subarray(take);
    }
    return out;
  }
}

function parseRate(raw: string | undefined): number {
  const text = String(raw || "");
  const parts = text.split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (num > 0 && den > 0) return num / den;
  }
  const n = Number(text);
  return n > 0 && Number.isFinite(n) ? n : 30;
}

export async function probeVideoBitmap(path: string): Promise<BitmapSize & { fps: number }> {
  const { stdout } = await runFfprobe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,avg_frame_rate",
    "-of",
    "json",
    path,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
    }>;
  };
  const stream = parsed.streams?.[0];
  const width = Math.max(1, Math.round(Number(stream?.width) || 0));
  const height = Math.max(1, Math.round(Number(stream?.height) || 0));
  if (width < 2 || height < 2) {
    throw new Error("Could not probe video size.");
  }
  const fps = parseRate(stream?.avg_frame_rate) || parseRate(stream?.r_frame_rate);
  return { width, height, fps };
}

function paintRgba(
  canvas: ReturnType<typeof createCanvas>,
  buffer: Buffer,
  width: number,
  height: number,
): CompositorDrawable {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(buffer);
  ctx.putImageData(imageData, 0, 0);
  return canvas as unknown as CompositorDrawable;
}

/**
 * Keep one ffmpeg decode process warm and walk source time forward.
 * Restarts with -ss on large jumps or backward seeks.
 */
export class SequentialRgbaDecoder {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private reader: ByteReader | null = null;
  private frameIndex = -1;
  private startTime = 0;
  private last: CompositorDrawable | null = null;
  private readonly frameBytes: number;
  private readonly canvas;
  private stderr = "";

  constructor(
    private readonly path: string,
    readonly width: number,
    readonly height: number,
    private readonly fps: number,
  ) {
    this.frameBytes = width * height * 4;
    this.canvas = createCanvas(width, height);
  }

  private kill(): void {
    if (!this.proc) return;
    try {
      this.proc.stdout.destroy();
    } catch {
      /* ignore */
    }
    try {
      this.proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    this.proc = null;
    this.reader = null;
    this.frameIndex = -1;
  }

  private start(atSec: number): void {
    this.kill();
    this.startTime = Math.max(0, atSec);
    this.stderr = "";
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      this.startTime.toFixed(3),
      "-i",
      this.path,
      "-an",
      "-vf",
      `scale=${this.width}:${this.height}:flags=fast_bilinear,format=rgba`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ];
    this.proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    this.proc.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-2000);
    });
    this.proc.on("exit", (code) => {
      if (code && code !== 0 && !this.stderr) {
        this.stderr = `ffmpeg decoder exited ${code}`;
      }
    });
    this.reader = new ByteReader(this.proc.stdout);
    this.frameIndex = -1;
  }

  private async readNext(): Promise<Buffer> {
    if (!this.proc || !this.reader) this.start(this.startTime);
    try {
      const buf = await this.reader!.readExact(this.frameBytes);
      this.frameIndex += 1;
      return buf;
    } catch (error) {
      const detail = this.stderr.trim();
      if (detail) {
        throw new Error(`Video decode failed: ${detail}`);
      }
      throw error;
    }
  }

  async frameAt(sourceTime: number): Promise<CompositorDrawable> {
    const fps = this.fps > 0 ? this.fps : 30;
    const target = Math.max(0, Math.round(sourceTime * fps));
    const currentAbs = this.frameIndex < 0 ? -1 : Math.round(this.startTime * fps) + this.frameIndex;
    const jumpBack = currentAbs >= 0 && target < currentAbs;
    const jumpAhead = currentAbs >= 0 && target - currentAbs > Math.ceil(fps * 2);
    if (!this.proc || jumpBack || jumpAhead) {
      this.start(target / fps);
    }
    const absStart = Math.round(this.startTime * fps);
    let raw: Buffer | null = null;
    while (absStart + this.frameIndex < target) {
      raw = await this.readNext();
    }
    if (raw) {
      this.last = paintRgba(this.canvas, raw, this.width, this.height);
    } else if (!this.last) {
      this.last = paintRgba(
        this.canvas,
        await this.readNext(),
        this.width,
        this.height,
      );
    }
    return this.last;
  }

  close(): void {
    this.kill();
    this.last = null;
  }
}

export async function loadStillBitmap(path: string): Promise<{
  image: Image;
  width: number;
  height: number;
}> {
  const image = await loadImage(path);
  return { image, width: image.width, height: image.height };
}

export async function openVideoDecoder(path: string): Promise<SequentialRgbaDecoder> {
  const probe = await probeVideoBitmap(path);
  return new SequentialRgbaDecoder(path, probe.width, probe.height, probe.fps);
}
