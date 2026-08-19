import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hasAudioStream, runFfmpeg } from "../../convex/lib/studioFfmpeg.ts";
import { voicesAtSlice } from "../../src/studio/editor/playback/offline-audio-mix.ts";
import { sliceAt, type PlaybackPlan } from "../../src/studio/editor/playback/timeline-compiler.ts";

export const MIX_SAMPLE_RATE = 48_000;
const HOP = 480;

export type PcmBuffer = {
  samples: Float32Array;
  frames: number;
};

export async function decodeStereoF32(
  sourcePath: string,
  destPath: string,
): Promise<PcmBuffer | null> {
  if (!(await hasAudioStream(sourcePath))) return null;
  await runFfmpeg([
    "-y",
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    "2",
    "-ar",
    String(MIX_SAMPLE_RATE),
    "-f",
    "f32le",
    destPath,
  ]);
  const buf = await readFile(destPath);
  const samples = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    Math.floor(buf.byteLength / 4),
  );
  return { samples, frames: Math.floor(samples.length / 2) };
}

export async function mixOfflineAudio(args: {
  plan: PlaybackPlan;
  durationSec: number;
  pcmByAssetId: Map<string, PcmBuffer>;
  destWavPath: string;
}): Promise<void> {
  const totalFrames = Math.max(1, Math.round(args.durationSec * MIX_SAMPLE_RATE));
  const mixed = new Float32Array(totalFrames * 2);
  for (let frame = 0; frame < totalFrames; frame += HOP) {
    const t = frame / MIX_SAMPLE_RATE;
    const slice = sliceAt(args.plan, t);
    const voices = voicesAtSlice(slice);
    const count = Math.min(HOP, totalFrames - frame);
    for (const voice of voices) {
      if (voice.gain <= 0.0001) continue;
      const pcm = args.pcmByAssetId.get(voice.assetId);
      if (!pcm) continue;
      const src0 = Math.floor(voice.sourceTime * MIX_SAMPLE_RATE);
      for (let i = 0; i < count; i += 1) {
        const srcFrame = src0 + i;
        if (srcFrame < 0 || srcFrame >= pcm.frames) continue;
        const dst = (frame + i) * 2;
        const src = srcFrame * 2;
        mixed[dst] += pcm.samples[src]! * voice.gain;
        mixed[dst + 1] += pcm.samples[src + 1]! * voice.gain;
      }
    }
  }
  for (let i = 0; i < mixed.length; i += 1) {
    mixed[i] = Math.max(-1, Math.min(1, mixed[i]!));
  }
  await writeWavF32(args.destWavPath, mixed, MIX_SAMPLE_RATE);
}

async function writeWavF32(
  dest: string,
  samples: Float32Array,
  sampleRate: number,
): Promise<void> {
  const dataBytes = samples.byteLength;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2 * 4, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  const body = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  await writeFile(dest, Buffer.concat([header, body]));
}

export function mixWavPath(tempDir: string): string {
  return join(tempDir, "mix.wav");
}
