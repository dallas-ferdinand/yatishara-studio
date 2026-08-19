/**
 * Studio ffmpeg worker — download/encode/upload off the Convex process.
 * Convex only enqueues; this host runs ffmpeg.
 */
import { createServer } from "node:http";
import { runStudioExport } from "../../convex/lib/studioExportPipeline.ts";
import { createConvexExportHost, convexPost } from "./convexHost.ts";
import { runProxyJob } from "./proxyJob.ts";
import {
  runClipDownloadJob,
  runHelpPreviewJob,
  runNaturalSpeedJob,
  runPullFrameJob,
  runSampleFramesJob,
  runSpeedJob,
} from "./mediaJobs.ts";

const PORT = Number(process.env.PORT || 8797);
const TOKEN = String(process.env.STUDIO_FFMPEG_WORKER_TOKEN || "").trim();

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function bearer(req: import("node:http").IncomingMessage): string {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

const running = new Set<string>();

async function handleJob(job: Record<string, unknown>): Promise<void> {
  const kind = String(job.kind || "");
  const site = String(job.convexSiteUrl || "").replace(/\/$/, "");
  const token = TOKEN;
  if (!site) throw new Error("convexSiteUrl required");

  if (kind === "export") {
    const userId = String(job.userId || "");
    const folderId = String(job.folderId || "");
    const jobId = job.jobId ? String(job.jobId) : undefined;
    if (!userId || !folderId) throw new Error("export job missing userId/folderId");
    const key = jobId || `export-${Date.now()}`;
    if (running.has(key)) return;
    running.add(key);
    try {
      const host = createConvexExportHost({ siteUrl: site, token });
      await runStudioExport(host, userId, {
        projectId: job.projectId ? String(job.projectId) : undefined,
        folderId,
        name: String(job.name || "export"),
        project: job.project,
        exportResolution: job.exportResolution as "720p" | "1080p" | "4K" | undefined,
        exportKind: job.exportKind === "audio" ? "audio" as const : "video" as const,
        audioFormat: job.audioFormat as "mp3" | "wav" | "m4a" | undefined,
        jobId,
      });
    } finally {
      running.delete(key);
    }
    return;
  }

  if (kind === "proxy") {
    const jobId = String(job.jobId || "");
    const bunnyPath = String(job.bunnyPath || "");
    if (!jobId || !bunnyPath) throw new Error("proxy job missing jobId/bunnyPath");
    if (running.has(jobId)) return;
    running.add(jobId);
    try {
      await runProxyJob({
        convexSiteUrl: site,
        token,
        jobId,
        bunnyPath,
        kind: job.mediaKind === "audio" ? "audio" : "video",
      });
    } finally {
      running.delete(jobId);
    }
    return;
  }

  const withToken = { ...job, convexSiteUrl: site, token };
  const keyed = String(job.jobId || `${kind}-${Date.now()}`);
  if (running.has(keyed)) return;
  running.add(keyed);
  try {
    if (kind === "clip-download") {
      await runClipDownloadJob(withToken);
      return;
    }
    if (kind === "speed") {
      await runSpeedJob(withToken);
      return;
    }
    if (kind === "natural-speed") {
      await runNaturalSpeedJob(withToken);
      return;
    }
    if (kind === "pull-frame") {
      await runPullFrameJob(withToken);
      return;
    }
    if (kind === "sample-frames") {
      await runSampleFramesJob(withToken);
      return;
    }
    if (kind === "help-preview") {
      await runHelpPreviewJob(withToken);
      return;
    }
    throw new Error(`Unknown ffmpeg job kind: ${kind}`);
  } finally {
    running.delete(keyed);
  }
}

if (!TOKEN) {
  console.error("STUDIO_FFMPEG_WORKER_TOKEN required (fail-closed)");
  process.exit(1);
}

process.on("unhandledRejection", (error) => {
  console.error("ffmpeg worker unhandledRejection", error);
});
process.on("uncaughtException", (error) => {
  console.error("ffmpeg worker uncaughtException", error);
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://worker.local");
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true, running: running.size });
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/v1/jobs") {
    json(res, 404, { error: "not found" });
    return;
  }
  if (bearer(req) !== TOKEN) {
    json(res, 401, { error: "unauthorized" });
    return;
  }
  let job: Record<string, unknown>;
  try {
    job = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    json(res, 400, { error: "invalid json" });
    return;
  }
  json(res, 202, { ok: true, accepted: true });
  void handleJob(job).catch((error) => {
    console.error("ffmpeg job failed", error);
  });
});

async function reapOrphanedExports() {
  const sites = [process.env.CONVEX_SITE_URL, process.env.CONVEX_PREVIEW_SITE_URL]
    .map((value) => String(value || "").replace(/\/$/, ""))
    .filter(Boolean);
  for (const site of sites) {
    try {
      const json = await convexPost(site, TOKEN, "/api/ffmpeg-worker/job-reap-orphans", {
        error: "Export worker restarted. Try export again.",
      });
      console.log("reaped orphaned exports", site, json.failed);
    } catch (error) {
      console.error("reap orphaned exports failed", site, error);
    }
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`studio-ffmpeg-worker listening on ${PORT}`);
  void reapOrphanedExports();
});
