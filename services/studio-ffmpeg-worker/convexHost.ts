import { putObject, signBunnyCdnUrl } from "./bunny.ts";
import type { StudioExportHost } from "../../convex/lib/studioExportHost.ts";

type Json = Record<string, unknown>;

export function createConvexExportHost(args: {
  siteUrl: string;
  token: string;
}): StudioExportHost {
  const post = async (path: string, body: Json) => {
    const res = await fetch(`${args.siteUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    let json: Json = {};
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      json = { error: text };
    }
    if (!res.ok) {
      throw new Error(
        typeof json.error === "string" ? json.error : `Convex ${path} ${res.status}`,
      );
    }
    return json;
  };

  return {
    async getAssetForExport(userId, assetId) {
      const json = await post("/api/ffmpeg-worker/asset", { userId, assetId });
      const asset = json.asset;
      if (!asset || typeof asset !== "object") return null;
      return asset as Awaited<ReturnType<StudioExportHost["getAssetForExport"]>>;
    },
    async createExportAsset(input) {
      const json = await post("/api/ffmpeg-worker/prepare-export-asset", input);
      return {
        assetId: String(json.assetId),
        bunnyPath: String(json.bunnyPath),
      };
    },
    async finalizeExportAsset(input) {
      await post("/api/ffmpeg-worker/finalize-export-asset", input);
    },
    async attachOutput(input) {
      await post("/api/ffmpeg-worker/attach-output", input);
    },
    async patchProgress(jobId, phase, progress) {
      const json = await post("/api/ffmpeg-worker/job-progress", { jobId, phase, progress });
      return json.cancelled ? "cancelled" : "ok";
    },
    async completeJob(jobId, resultAssetId) {
      await post("/api/ffmpeg-worker/job-complete", { jobId, resultAssetId });
    },
    async failJob(jobId, error) {
      await post("/api/ffmpeg-worker/job-fail", { jobId, error });
    },
    async signCdnUrl(path, expiresUnix) {
      return signBunnyCdnUrl(path, expiresUnix);
    },
    async putObject(input) {
      await putObject(input);
    },
  };
}

export async function convexPost(
  siteUrl: string,
  token: string,
  path: string,
  body: Json,
): Promise<Json> {
  const res = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const text = await res.text();
  let json: Json = {};
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    json = { error: text };
  }
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Convex ${path} ${res.status}`,
    );
  }
  return json;
}
