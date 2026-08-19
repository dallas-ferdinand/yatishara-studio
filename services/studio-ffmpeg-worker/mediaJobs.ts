/**
 * Clip cut, speed bake, frame pull, help-preview — ffmpeg on this host, not Convex.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  downloadToFile,
  hasAudioStream,
  probeMediaDurationSeconds,
  runFfmpeg,
} from "../../convex/lib/studioFfmpeg.ts";
import {
  buildNaturalSpeedAudioFilters,
  buildSpeedSetptsFilter,
  clipSpeedFromEffects,
  isIdentitySpeed,
} from "../../convex/lib/naturalAudioSpeed.ts";
import { putObject, signBunnyCdnUrl } from "./bunny.ts";
import { convexPost } from "./convexHost.ts";

type Json = Record<string, unknown>;

function str(value: unknown): string {
  return String(value || "");
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function completeWork(
  site: string,
  token: string,
  jobId: string,
  result: Json,
): Promise<void> {
  await convexPost(site, token, "/api/ffmpeg-worker/work-complete", { jobId, result });
}

async function failWork(
  site: string,
  token: string,
  jobId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await convexPost(site, token, "/api/ffmpeg-worker/work-fail", {
    jobId,
    error: message,
  }).catch(() => undefined);
}

async function encodeTrimSpeed(args: {
  sourcePath: string;
  outPath: string;
  trimIn: number;
  sourceLen: number;
  duration: number;
  audioOnly: boolean;
  speedPts: string;
  naturalAf: string;
}): Promise<void> {
  if (args.audioOnly) {
    const afParts = [
      args.naturalAf,
      "aformat=sample_fmts=s16:channel_layouts=stereo",
    ].filter(Boolean);
    const audioArgs = [
      "-y",
      "-ss",
      String(args.trimIn),
      "-t",
      String(args.sourceLen),
      "-i",
      args.sourcePath,
      "-t",
      String(args.duration),
      "-vn",
    ];
    if (afParts.length) audioArgs.push("-af", afParts.join(","));
    audioArgs.push("-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", args.outPath);
    await runFfmpeg(audioArgs);
    return;
  }

  if (await hasAudioStream(args.sourcePath)) {
    await runFfmpeg([
      "-y",
      "-ss",
      String(args.trimIn),
      "-t",
      String(args.sourceLen),
      "-i",
      args.sourcePath,
      "-t",
      String(args.duration),
      "-vf",
      args.speedPts || "null",
      "-af",
      args.naturalAf || "anull",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      args.outPath,
    ]);
    return;
  }

  await runFfmpeg([
    "-y",
    "-ss",
    String(args.trimIn),
    "-t",
    String(args.sourceLen),
    "-i",
    args.sourcePath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(args.duration),
    "-vf",
    args.speedPts || "null",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    args.outPath,
  ]);
}

async function getAsset(
  site: string,
  token: string,
  userId: string,
  assetId: string,
): Promise<{
  bunnyPath?: string;
  name: string;
  folderId: string;
  kind: string;
  durationSeconds?: number;
} | null> {
  const json = await convexPost(site, token, "/api/ffmpeg-worker/asset", {
    userId,
    assetId,
  });
  const asset = json.asset;
  if (!asset || typeof asset !== "object") return null;
  return asset as {
    bunnyPath?: string;
    name: string;
    folderId: string;
    kind: string;
    durationSeconds?: number;
  };
}

export async function runClipDownloadJob(job: Json): Promise<void> {
  const site = str(job.convexSiteUrl).replace(/\/$/, "");
  const token = str(job.token);
  const jobId = str(job.jobId);
  const userId = str(job.userId);
  try {
    const source = await getAsset(site, token, userId, str(job.assetId));
    if (!source?.bunnyPath) throw new Error("Source media not found.");

    const trimIn = Math.max(0, num(job.trimIn));
    const trimOut = Math.max(trimIn + 0.05, num(job.trimOut));
    const sourceLen = Math.max(0.05, trimOut - trimIn);
    const speed = clipSpeedFromEffects({ speed: num(job.speed, 1) });
    const duration = Math.max(0.05, sourceLen / speed);
    const audioOnly = job.mode === "audio";
    const baseName =
      str(job.filename || source.name || "clip")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w.\- ]+/g, " ")
        .trim()
        .slice(0, 80) || "clip";
    const filename = audioOnly ? `${baseName}.wav` : `${baseName}.mp4`;
    const contentType = audioOnly ? "audio/wav" : "video/mp4";

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-clip-dl-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      const outPath = join(tempDir, audioOnly ? "clip.wav" : "clip.mp4");
      await downloadToFile(signedSource, sourcePath);
      await encodeTrimSpeed({
        sourcePath,
        outPath,
        trimIn,
        sourceLen,
        duration,
        audioOnly,
        speedPts: buildSpeedSetptsFilter(speed),
        naturalAf: buildNaturalSpeedAudioFilters(speed),
      });
      const body = await readFile(outPath);
      if (body.byteLength < 64) throw new Error("Clipped media is empty.");
      const bunnyPath = `users/${userId}/clip-downloads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}/${filename}`;
      await putObject({ path: bunnyPath, body, contentType });
      const url = await signBunnyCdnUrl(bunnyPath, expiresUnix);
      await completeWork(site, token, jobId, { url, filename, contentType });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    await failWork(site, token, jobId, error);
    throw error;
  }
}

export async function runSpeedJob(job: Json): Promise<void> {
  const site = str(job.convexSiteUrl).replace(/\/$/, "");
  const token = str(job.token);
  const jobId = str(job.jobId);
  const userId = str(job.userId);
  try {
    const source = await getAsset(site, token, userId, str(job.assetId));
    if (!source?.bunnyPath) throw new Error("Source media not found.");

    const trimIn = Math.max(0, num(job.trimIn));
    const trimOut = Math.max(trimIn + 0.05, num(job.trimOut));
    const sourceLen = Math.max(0.05, trimOut - trimIn);
    const speed = clipSpeedFromEffects({ speed: num(job.speed, 1) });
    if (isIdentitySpeed(speed)) {
      throw new Error("Choose a speed other than 1× before processing.");
    }
    const durationSec = Math.max(0.05, sourceLen / speed);
    const audioOnly = job.mode === "audio";
    const baseName =
      str(job.filename || source.name || "clip")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w.\- ]+/g, " ")
        .trim()
        .slice(0, 60) || "clip";
    const speedLabel = speed.toFixed(2).replace(/\.?0+$/, "");
    const name = audioOnly
      ? `${baseName} ${speedLabel}x.wav`
      : `${baseName} ${speedLabel}x.mp4`;
    const kind = audioOnly ? "audio" : "video";
    const contentType = audioOnly ? "audio/wav" : "video/mp4";

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-speed-process-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      const outPath = join(tempDir, audioOnly ? "out.wav" : "out.mp4");
      await downloadToFile(signedSource, sourcePath);
      await encodeTrimSpeed({
        sourcePath,
        outPath,
        trimIn,
        sourceLen,
        duration: durationSec,
        audioOnly,
        speedPts: buildSpeedSetptsFilter(speed),
        naturalAf: buildNaturalSpeedAudioFilters(speed),
      });
      const body = await readFile(outPath);
      if (body.byteLength < 64) throw new Error("Processed media is empty.");
      const created = await convexPost(
        site,
        token,
        "/api/ffmpeg-worker/create-derived-asset",
        {
          userId,
          folderId: str(job.folderId),
          name,
          kind,
          mimeType: contentType,
        },
      );
      await putObject({
        path: str(created.bunnyPath),
        body,
        contentType,
      });
      await convexPost(site, token, "/api/ffmpeg-worker/finalize-export-asset", {
        assetId: created.assetId,
        byteSize: body.byteLength,
        durationSeconds: durationSec,
      });
      await completeWork(site, token, jobId, {
        assetId: created.assetId,
        durationSec,
        speed,
        kind,
        name,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    await failWork(site, token, jobId, error);
    throw error;
  }
}

export async function runNaturalSpeedJob(job: Json): Promise<void> {
  const site = str(job.convexSiteUrl).replace(/\/$/, "");
  const token = str(job.token);
  const jobId = str(job.jobId);
  const userId = str(job.userId);
  try {
    const trimIn = Math.max(0, num(job.trimIn));
    const trimOut = Math.max(trimIn + 0.05, num(job.trimOut));
    const sourceLen = Math.max(0.05, trimOut - trimIn);
    const speed = clipSpeedFromEffects({ speed: num(job.speed, 1) });
    const durationSec = Math.max(0.05, sourceLen / speed);
    if (isIdentitySpeed(speed)) {
      throw new Error("Natural speed bake is only needed when speed ≠ 1.");
    }

    const source = await getAsset(site, token, userId, str(job.assetId));
    if (!source?.bunnyPath) throw new Error("Source media not found.");

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 6;
    const speedKey = speed.toFixed(3);
    const cacheName = `${str(job.assetId)}-${trimIn.toFixed(3)}-${trimOut.toFixed(3)}-${speedKey}.wav`;
    const bunnyPath = `users/${userId}/speed-audio-proxy/${cacheName}`;

    try {
      const existingUrl = await signBunnyCdnUrl(bunnyPath, expiresUnix);
      const head = await fetch(existingUrl, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
      });
      if (head.ok || head.status === 206) {
        await completeWork(site, token, jobId, {
          url: existingUrl,
          durationSec,
          speed,
        });
        return;
      }
    } catch {
      /* bake fresh */
    }

    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-speed-audio-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      const outPath = join(tempDir, "sped.wav");
      await downloadToFile(signedSource, sourcePath);
      const naturalAf = buildNaturalSpeedAudioFilters(speed);
      await runFfmpeg([
        "-y",
        "-ss",
        String(trimIn),
        "-t",
        String(sourceLen),
        "-i",
        sourcePath,
        "-t",
        String(durationSec),
        "-vn",
        "-af",
        `${naturalAf},aformat=sample_fmts=s16:channel_layouts=stereo`,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "1",
        outPath,
      ]);
      const body = await readFile(outPath);
      if (body.byteLength < 64) throw new Error("Sped audio is empty.");
      await putObject({ path: bunnyPath, body, contentType: "audio/wav" });
      const url = await signBunnyCdnUrl(bunnyPath, expiresUnix);
      await completeWork(site, token, jobId, { url, durationSec, speed });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    await failWork(site, token, jobId, error);
    throw error;
  }
}

async function extractJpeg(sourcePath: string, seekTime: number, outPath: string, quality = "2") {
  await runFfmpeg([
    "-y",
    "-ss",
    String(seekTime),
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-q:v",
    quality,
    outPath,
  ]);
}

export async function runPullFrameJob(job: Json): Promise<void> {
  const site = str(job.convexSiteUrl).replace(/\/$/, "");
  const token = str(job.token);
  const jobId = str(job.jobId);
  const userId = str(job.userId);
  try {
    const source = await getAsset(site, token, userId, str(job.sourceAssetId));
    if (!source?.bunnyPath) throw new Error("Source media not found.");
    const seekTime = Math.max(0, num(job.seekTime));
    const filename = str(job.filename) || `Frame · ${seekTime.toFixed(2)}.jpg`;
    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-frame-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      const framePath = join(tempDir, "frame.jpg");
      await downloadToFile(signedSource, sourcePath);
      await extractJpeg(sourcePath, seekTime, framePath);
      const body = await readFile(framePath);
      const dest = await convexPost(
        site,
        token,
        "/api/ffmpeg-worker/ensure-pulled-frames-folder",
        { userId, sourceFolderId: str(job.sourceFolderId) },
      );
      const prepared = await convexPost(
        site,
        token,
        "/api/ffmpeg-worker/create-frame-asset",
        { userId, folderId: dest.folderId, name: filename },
      );
      await putObject({
        path: str(prepared.bunnyPath),
        body,
        contentType: "image/jpeg",
      });
      await convexPost(site, token, "/api/ffmpeg-worker/finalize-export-asset", {
        assetId: prepared.assetId,
        byteSize: body.byteLength,
      });
      const url = await signBunnyCdnUrl(str(prepared.bunnyPath), expiresUnix);
      await completeWork(site, token, jobId, {
        assetId: prepared.assetId,
        name: filename,
        folderId: dest.folderId,
        timeSec: num(job.timeSec, seekTime),
        sourceAssetId: str(job.sourceAssetId),
        url,
        thumbnailUrl: url,
        preferredViewUrl: url,
        expiresUnix,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    await failWork(site, token, jobId, error);
    throw error;
  }
}

function sampleTimesInRange(startSec: number, endSec: number, count: number): number[] {
  const n = Math.max(1, Math.min(12, Math.floor(count)));
  if (n === 1) return [(startSec + endSec) / 2];
  const times: number[] = [];
  for (let i = 0; i < n; i += 1) {
    times.push(startSec + (i * (endSec - startSec)) / (n - 1));
  }
  return times;
}

export async function runSampleFramesJob(job: Json): Promise<void> {
  const site = str(job.convexSiteUrl).replace(/\/$/, "");
  const token = str(job.token);
  const jobId = str(job.jobId);
  const userId = str(job.userId);
  const assetId = str(job.assetId);
  try {
    const source = await getAsset(site, token, userId, assetId);
    if (!source?.bunnyPath) throw new Error("Source media not found.");
    if (source.kind !== "video") {
      throw new Error("studio_pull_frames only works on video assets.");
    }
    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-sample-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      await downloadToFile(signedSource, sourcePath);
      const probed = await probeMediaDurationSeconds(sourcePath);
      const stored =
        typeof source.durationSeconds === "number" && source.durationSeconds > 0.05
          ? source.durationSeconds
          : 0;
      const durationSec =
        probed > 0.05 && stored > 0.05
          ? Math.min(stored, probed)
          : probed > 0.05
            ? probed
            : stored > 0.05
              ? stored
              : 1;
      const maxT = Math.max(0, durationSec - 0.12);
      let times: number[] = [];
      if (Array.isArray(job.timesSec) && job.timesSec.length > 0) {
        times = job.timesSec.map((t) => Math.max(0, Math.min(maxT, Number(t) || 0)));
      } else {
        const startRaw = typeof job.startSec === "number" ? job.startSec : 0;
        const endRaw = typeof job.endSec === "number" ? job.endSec : durationSec;
        let startSec = Math.max(0, Math.min(maxT, startRaw));
        let endSec = Math.max(0, Math.min(maxT, endRaw));
        if (endSec < startSec) {
          const swap = startSec;
          startSec = endSec;
          endSec = swap;
        }
        times = sampleTimesInRange(startSec, endSec, num(job.count, 3));
      }
      times = [...new Set(times.map((t) => Math.round(t * 100) / 100))].slice(0, 12);

      const dest = await convexPost(
        site,
        token,
        "/api/ffmpeg-worker/ensure-pulled-frames-folder",
        { userId, sourceFolderId: source.folderId },
      );
      const safeBase =
        (source.name || "clip").replace(/[^\w.-]+/g, " ").trim().slice(0, 36) || "clip";
      const frames: Json[] = [];
      for (const seekTime of times) {
        const framePath = join(tempDir, `frame-${seekTime}.jpg`);
        await extractJpeg(sourcePath, seekTime, framePath, "3");
        if (!existsSync(framePath)) {
          await extractJpeg(sourcePath, Math.max(0, seekTime - 0.35), framePath, "3");
        }
        if (!existsSync(framePath)) continue;
        const body = await readFile(framePath);
        const timeLabel = seekTime.toFixed(2).replace(".", "s");
        const filename = `Frame · ${safeBase} · ${timeLabel}.jpg`;
        const prepared = await convexPost(
          site,
          token,
          "/api/ffmpeg-worker/create-frame-asset",
          { userId, folderId: dest.folderId, name: filename },
        );
        await putObject({
          path: str(prepared.bunnyPath),
          body,
          contentType: "image/jpeg",
        });
        await convexPost(site, token, "/api/ffmpeg-worker/finalize-export-asset", {
          assetId: prepared.assetId,
          byteSize: body.byteLength,
        });
        const url = await signBunnyCdnUrl(str(prepared.bunnyPath), expiresUnix);
        frames.push({
          timeSec: seekTime,
          assetId: prepared.assetId,
          name: filename,
          url,
          thumbnailUrl: url,
          preferredViewUrl: url,
        });
      }
      if (!frames.length) {
        throw new Error(
          "Could not pull frames from this video. Try a shorter window inside the clip.",
        );
      }
      await completeWork(site, token, jobId, {
        sourceAssetId: assetId,
        durationSec,
        folderId: dest.folderId,
        folderPath: dest.folderPath,
        frames,
        expiresUnix,
        viewHint:
          "Cursor Read preferredViewUrl on each frame. Prefer startSec+endSec+count for a window, or timesSec for exact hits. Stills land in Pulled Frames (sibling folder). See MCP resource studio://guides/pull-frames.",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    await failWork(site, token, jobId, error);
    throw error;
  }
}

export async function runHelpPreviewJob(job: Json): Promise<void> {
  const site = str(job.convexSiteUrl).replace(/\/$/, "");
  const token = str(job.token);
  const postId = str(job.postId);
  const previewAssetId = str(job.previewAssetId);
  const workDir = await mkdtemp(join(tmpdir(), "yatishara-help-preview-"));
  try {
    const sourcePath = join(workDir, "source");
    const outputPath = join(workDir, "preview.mp4");
    const expires = Math.floor(Date.now() / 1000) + 30 * 60;
    const sourceUrl = await signBunnyCdnUrl(str(job.sourceBunnyPath), expires);
    await downloadToFile(sourceUrl, sourcePath);
    await runFfmpeg([
      "-y",
      "-ss",
      str(job.startSec),
      "-i",
      sourcePath,
      "-t",
      str(job.durationSec),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    const bytes = new Uint8Array(await readFile(outputPath));
    await putObject({
      path: str(job.destBunnyPath),
      body: bytes,
      contentType: "video/mp4",
    });
    await convexPost(site, token, "/api/ffmpeg-worker/help-preview-complete", {
      previewAssetId,
      postId,
      byteSize: bytes.byteLength,
      durationSeconds: num(job.durationSec),
    });
  } catch (error) {
    await convexPost(site, token, "/api/ffmpeg-worker/help-preview-fail", {
      previewAssetId,
      postId,
    }).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
