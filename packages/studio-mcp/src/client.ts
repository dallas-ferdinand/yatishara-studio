const apiKey = process.env.STUDIO_API_KEY;
const apiUrl = (process.env.STUDIO_API_URL ?? "").replace(/\/$/, "");

export function requireConfig(): { apiKey: string; apiUrl: string } {
  if (!apiKey) {
    throw new Error("STUDIO_API_KEY is required");
  }
  if (!apiUrl) {
    throw new Error("STUDIO_API_URL is required");
  }
  return { apiKey, apiUrl };
}

export async function studioFetch(path: string, init: RequestInit = {}) {
  const { apiKey, apiUrl } = requireConfig();
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
  }
  return data;
}

export type GenerationJob = {
  id: string;
  status: string;
  error?: string | null;
  assets?: unknown[];
};

const TERMINAL = new Set(["done", "failed"]);

export async function pollGeneration(
  jobId: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<GenerationJob> {
  const intervalMs = options?.intervalMs ?? 3000;
  const timeoutMs = options?.timeoutMs ?? 300_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = (await studioFetch(`/generations/${encodeURIComponent(jobId)}`)) as GenerationJob;
    if (TERMINAL.has(job.status)) {
      if (job.status === "failed") {
        throw new Error(job.error ?? "Generation failed");
      }
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Generation timed out after ${Math.round(timeoutMs / 1000)}s (job ${jobId})`);
}

export function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
