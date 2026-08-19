import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import type { StudioExportHost } from "../../convex/lib/studioExportHost.ts";
import {
  audioExportExt,
  audioExportMime,
  DEFAULT_EXPORT_RESOLUTION,
  exportH264Args,
  exportSizeForRatioAndResolution,
  normalizeExportAudioFormat,
  normalizeExportResolution,
  type ExportAudioFormat,
  type ExportResolution,
} from "../../convex/lib/editorExport.ts";
import { ffmpegFailMessage } from "../../convex/lib/editorExportText.ts";
import { downloadToFile, runFfmpeg, runFfprobe } from "../../convex/lib/studioFfmpeg.ts";
import { Canvas2dCompositor, type CompositorCanvas } from "../../src/studio/editor/playback/compositor-2d.ts";
import { compositorVisual, mapTextItems } from "../../src/studio/editor/playback/compositor-scene.ts";
import { pictureLayersBottomToTop } from "../../src/studio/editor/playback/picture-layers.ts";
import { compileTimeline, sliceAt } from "../../src/studio/editor/playback/timeline-compiler.ts";
import { EXPORT_FPS } from "../../src/studio/editor/projectContract.ts";
import type { EditorProject } from "../../src/studio/editor/types.ts";
import { mixOfflineAudio, mixWavPath, decodeStereoF32, type PcmBuffer } from "./compositorAudio.ts";
import { registerExportFonts } from "./compositorFonts.ts";
import {
  loadStillBitmap,
  openVideoDecoder,
  SequentialRgbaDecoder,
} from "./compositorMedia.ts";

const EXPORT_AUDIO_BITRATE = "320k";

type ExportKind = "video" | "audio";

function writePipe(stdin: NodeJS.WritableStream, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stdin.write(chunk, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function waitChild(child: ReturnType<typeof spawn>, label: string): Promise<void> {
  const stderrChunks: Buffer[] = [];
  child.stderr?.on("data", (chunk) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      reject(new Error(`${label} failed (${code}): ${stderr.slice(-800)}`));
    });
  });
}

export async function runCompositorExport(
  host: StudioExportHost,
  userId: string,
  args: {
    projectId?: string;
    folderId: string;
    name: string;
    project: EditorProject;
    exportResolution?: ExportResolution;
    exportKind?: ExportKind;
    audioFormat?: ExportAudioFormat;
    jobId?: string;
  },
): Promise<{ assetId: string }> {
  const report = async (phase: string, progress: number) => {
    if (!args.jobId) return;
    try {
      await host.patchProgress(args.jobId, phase, progress);
    } catch {
      /* best-effort */
    }
  };

  try {
    await runFfmpeg(["-version"]);
    await runFfprobe(["-version"]);
  } catch {
    const message = "Export requires ffmpeg and ffprobe on the Studio ffmpeg worker.";
    if (args.jobId) await host.failJob(args.jobId, message);
    throw new Error(message);
  }

  const exportKind: ExportKind = args.exportKind === "audio" ? "audio" : "video";
  const audioFormat = normalizeExportAudioFormat(args.audioFormat);
  const project = args.project;
  const resolution = normalizeExportResolution(
    args.exportResolution ?? DEFAULT_EXPORT_RESOLUTION,
  );
  const renderResolution = exportKind === "audio" ? ("720p" as ExportResolution) : resolution;
  const { width, height } = exportSizeForRatioAndResolution(project.frameRatio, renderResolution);
  const videoTracks = project.tracks.filter((track) => track.kind === "video");
  if (!videoTracks.length) {
    const message = "No video track in project.";
    if (args.jobId) await host.failJob(args.jobId, message);
    throw new Error(message);
  }

  const plan = compileTimeline(project);
  const durationSec = Math.max(plan.duration, 1 / EXPORT_FPS);
  if (durationSec <= 1 / EXPORT_FPS && plan.video.length === 0 && plan.audio.length === 0 && plan.text.length === 0) {
    const message = "Add a video or audio clip before exporting.";
    if (args.jobId) await host.failJob(args.jobId, message);
    throw new Error(message);
  }

  const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
  const tempDir = await mkdtemp(join(tmpdir(), "studio-comp-"));
  const fontDir = join(tempDir, "fonts");
  await mkdir(fontDir, { recursive: true });
  const decoders = new Map<string, SequentialRgbaDecoder>();
  const stills = new Map<string, { image: Awaited<ReturnType<typeof loadStillBitmap>>["image"]; width: number; height: number }>();
  const sourceCache = new Map<string, { path: string; kind: string }>();
  const pcmByAssetId = new Map<string, PcmBuffer>();

  try {
    await report("Preparing clips…", 4);
    const assetIds = new Set<string>();
    for (const clip of [...plan.video, ...plan.audio]) {
      if (clip.assetId) assetIds.add(clip.assetId);
    }
    for (const assetId of assetIds) {
      const asset = await host.getAssetForExport(userId, assetId);
      if (!asset?.bunnyPath) {
        throw new Error(`Missing media for asset ${assetId}.`);
      }
      const url = await host.signCdnUrl(asset.bunnyPath, expiresUnix);
      const path = join(tempDir, `source-${assetId}.bin`);
      await downloadToFile(url, path);
      sourceCache.set(assetId, { path, kind: asset.kind });
    }

    await report("Mixing audio…", 12);
    for (const [assetId, source] of sourceCache) {
      const pcm = await decodeStereoF32(source.path, join(tempDir, `pcm-${assetId}.f32`));
      if (pcm) pcmByAssetId.set(assetId, pcm);
    }
    const wavPath = mixWavPath(tempDir);
    await mixOfflineAudio({
      plan,
      durationSec,
      pcmByAssetId,
      destWavPath: wavPath,
    });

    let body: Buffer;
    let filename: string;
    let mimeType: string;
    let kind: "video" | "audio";

    if (exportKind === "audio") {
      await report(`Encoding ${audioFormat.toUpperCase()}…`, 70);
      const audioOut = join(tempDir, `export-audio${audioExportExt(audioFormat)}`);
      const codecArgs =
        audioFormat === "wav"
          ? ["-vn", "-c:a", "pcm_s16le"]
          : audioFormat === "m4a"
            ? ["-vn", "-c:a", "aac", "-b:a", EXPORT_AUDIO_BITRATE]
            : ["-vn", "-c:a", "libmp3lame", "-b:a", EXPORT_AUDIO_BITRATE];
      await runFfmpeg(["-y", "-i", wavPath, ...codecArgs, audioOut]);
      body = await readFile(audioOut);
      const rawName = (args.name || "export").replace(/\.(mp3|wav|m4a|mp4|mov|webm)$/i, "");
      filename = `${rawName.replace(/[^\w.-]+/g, "-").slice(0, 48) || "export"}${audioExportExt(audioFormat)}`;
      mimeType = audioExportMime(audioFormat);
      kind = "audio";
    } else {
      const families = [
        ...new Set(
          plan.text
            .map((clip) => clip.clip.text?.fontFamily)
            .filter((family): family is string => Boolean(family)),
        ),
      ];
      await registerExportFonts(families, fontDir);
      const canvas = createCanvas(width, height);
      const compositor = new Canvas2dCompositor(
        canvas as unknown as CompositorCanvas,
        width,
        height,
        {
          createCanvas: (w, h) => createCanvas(w, h) as unknown as CompositorCanvas,
          loadFonts: (next) => registerExportFonts(next, fontDir),
        },
      );
      await compositor.ensureFonts(families);

      const frameCount = Math.max(1, Math.round(durationSec * EXPORT_FPS));
      const outPath = join(tempDir, "export.mp4");
      const ffmpeg = spawn(
        "ffmpeg",
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgba",
          "-s",
          `${width}x${height}`,
          "-r",
          String(EXPORT_FPS),
          "-i",
          "pipe:0",
          "-i",
          wavPath,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          ...exportH264Args(width, height),
          "-c:a",
          "aac",
          "-b:a",
          EXPORT_AUDIO_BITRATE,
          "-ar",
          "48000",
          "-ac",
          "2",
          "-t",
          (frameCount / EXPORT_FPS).toFixed(4),
          "-movflags",
          "+faststart",
          outPath,
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      const encodeDone = waitChild(ffmpeg, "Encode");

      await report("Painting…", 18);
      try {
        for (let index = 0; index < frameCount; index += 1) {
          if (index === 0 || index % 8 === 0) {
            const pct = 18 + Math.round((index / Math.max(1, frameCount)) * 62);
            await report(`Painting ${index + 1} / ${frameCount}`, Math.min(80, pct));
          }
          const t = index / EXPORT_FPS;
          const slice = sliceAt(plan, t);
          const lanes = [];
          for (const sample of slice.video) {
            const assetId = sample.clip.assetId;
            if (!assetId) {
              lanes.push(null);
              continue;
            }
            const source = sourceCache.get(assetId);
            if (!source) {
              lanes.push(null);
              continue;
            }
            const isImage = source.kind === "image" || sample.clip.kind === "image";
            if (isImage) {
              let still = stills.get(assetId);
              if (!still) {
                still = await loadStillBitmap(source.path);
                stills.set(assetId, still);
              }
              lanes.push({
                clipId: sample.clip.clipId,
                frame: still.image as unknown as import("../../src/studio/editor/playback/compositor-2d.ts").CompositorDrawable,
                textureKey: `image:${assetId}`,
                width: still.width,
                height: still.height,
              });
              continue;
            }
            let decoder = decoders.get(sample.clip.clipId);
            if (!decoder) {
              decoder = await openVideoDecoder(source.path);
              decoders.set(sample.clip.clipId, decoder);
            }
            const frame = await decoder.frameAt(sample.sourceTime);
            lanes.push({
              clipId: sample.clip.clipId,
              frame,
              textureKey: `video:${sample.clip.clipId}`,
              width: decoder.width,
              height: decoder.height,
            });
          }
          const pictures = pictureLayersBottomToTop(lanes, slice);
          const texts = mapTextItems(slice.text, slice.timelineTime);
          compositor.paint({
            visual: compositorVisual(slice, pictures, texts),
            transition: slice.transition?.type ?? "none",
            progress: slice.transition?.progress ?? 0,
          });
          const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;
          await writePipe(
            ffmpeg.stdin!,
            Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
          );
        }
        ffmpeg.stdin?.end();
      } catch (error) {
        try {
          ffmpeg.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        throw error;
      }
      await encodeDone;
      compositor.dispose();
      body = await readFile(outPath);
      const rawName = (args.name || "export").replace(/\.(mp4|mov|webm)$/i, "");
      filename = `${rawName.replace(/[^\w.-]+/g, "-").slice(0, 48) || "export"}.mp4`;
      mimeType = "video/mp4";
      kind = "video";
    }

    await report("Uploading…", 88);
    const prepared = await host.createExportAsset({
      userId,
      folderId: args.folderId,
      name: filename,
      kind,
      mimeType,
    });
    await host.putObject({
      path: prepared.bunnyPath,
      body: new Uint8Array(body),
      contentType: mimeType,
    });
    await host.finalizeExportAsset({
      assetId: prepared.assetId,
      byteSize: body.byteLength,
      durationSeconds: durationSec,
    });
    if (args.projectId && exportKind === "video") {
      await host.attachOutput({
        userId,
        projectId: args.projectId,
        outputAssetId: prepared.assetId,
      });
    }
    if (args.jobId) {
      await host.completeJob(args.jobId, prepared.assetId);
    }
    await report("Export ready", 100);
    return { assetId: prepared.assetId };
  } catch (error) {
    const message = ffmpegFailMessage(error, "Export failed.");
    if (args.jobId) {
      try {
        await host.failJob(args.jobId, message);
      } catch {
        /* ignore */
      }
    }
    throw error;
  } finally {
    for (const decoder of decoders.values()) decoder.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}
