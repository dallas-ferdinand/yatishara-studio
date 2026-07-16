const apiKey = process.env.STUDIO_API_KEY;
const apiUrl = (process.env.STUDIO_API_URL ?? "").replace(/\/$/, "");
function requireConfig() {
  if (!apiKey) {
    throw new Error("STUDIO_API_KEY is required");
  }
  if (!apiUrl) {
    throw new Error("STUDIO_API_URL is required");
  }
  return { apiKey, apiUrl };
}
async function studioFetch(path, init = {}) {
  const { apiKey: apiKey2, apiUrl: apiUrl2 } = requireConfig();
  const response = await fetch(`${apiUrl2}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey2}`,
      "Content-Type": "application/json",
      ...init.headers ?? {}
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
  }
  return data;
}
const TERMINAL = /* @__PURE__ */ new Set(["done", "failed"]);
async function pollGeneration(jobId, options) {
  const intervalMs = options?.intervalMs ?? 3e3;
  const timeoutMs = options?.timeoutMs ?? 3e5;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await studioFetch(`/generations/${encodeURIComponent(jobId)}`);
    if (TERMINAL.has(job.status)) {
      if (job.status === "failed") {
        throw new Error(job.error ?? "Generation failed");
      }
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Generation timed out after ${Math.round(timeoutMs / 1e3)}s (job ${jobId})`);
}
function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
export {
  jsonResult,
  pollGeneration,
  requireConfig,
  studioFetch
};
