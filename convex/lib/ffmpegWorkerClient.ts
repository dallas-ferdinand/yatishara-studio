/**
 * Dispatch long ffmpeg work to the VPS worker (services/studio-ffmpeg-worker).
 * Node actions read these from the Convex backend container env.
 */
export function ffmpegWorkerUrl(): string {
  return (process.env.STUDIO_FFMPEG_WORKER_URL ?? "").trim().replace(/\/$/, "");
}

export function ffmpegWorkerToken(): string {
  return (process.env.STUDIO_FFMPEG_WORKER_TOKEN ?? "").trim();
}

export function ffmpegWorkerConfigured(): boolean {
  return Boolean(ffmpegWorkerUrl() && ffmpegWorkerToken());
}

export function convexSiteOrigin(): string {
  return (
    (process.env.CONVEX_SITE_ORIGIN ?? "").trim() ||
    (process.env.CONVEX_SITE_URL ?? "").trim()
  ).replace(/\/$/, "");
}

export async function enqueueFfmpegJob(job: Record<string, unknown>): Promise<void> {
  const base = ffmpegWorkerUrl();
  const token = ffmpegWorkerToken();
  if (!base || !token) {
    throw new Error("FFmpeg worker is not configured (STUDIO_FFMPEG_WORKER_URL / TOKEN).");
  }
  const res = await fetch(`${base}/v1/jobs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(job),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`FFmpeg worker rejected the job (${res.status}): ${text.slice(0, 240)}`);
  }
}

export async function waitForFfmpegWorkJob(args: {
  get: () => Promise<{
    status: string;
    error?: string;
    result?: unknown;
  } | null>;
}): Promise<unknown> {
  for (let i = 0; i < 12_000; i += 1) {
    const job = await args.get();
    if (job?.status === "done") return job.result ?? {};
    if (job?.status === "error") {
      throw new Error(job.error || "FFmpeg worker failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for the ffmpeg worker.");
}
