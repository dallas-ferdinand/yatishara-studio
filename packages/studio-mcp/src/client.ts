const apiKey = process.env.STUDIO_API_KEY;
const apiUrl = (process.env.STUDIO_API_URL ?? "").replace(/\/$/, "");
const defaultCompact =
  process.env.STUDIO_MCP_COMPACT === "1" || process.env.STUDIO_MCP_COMPACT === "true";

export function requireConfig(): { apiKey: string; apiUrl: string } {
  if (!apiKey) {
    throw new Error("STUDIO_API_KEY is required");
  }
  if (!apiUrl) {
    throw new Error("STUDIO_API_URL is required");
  }
  return { apiKey, apiUrl };
}

export function wantsCompact(explicit?: boolean): boolean {
  return explicit ?? defaultCompact;
}

type ErrorHint = { nextTool?: string; hint: string };

function hintForError(message: string, status?: number): ErrorHint | undefined {
  const m = message.toLowerCase();
  if (status === 401 || m.includes("authorization") || m.includes("api key")) {
    return {
      hint: "Check STUDIO_API_KEY / STUDIO_API_URL. Call studio_bootstrap to verify.",
      nextTool: "studio_bootstrap",
    };
  }
  if (m.includes("insufficient") || m.includes("credit") || m.includes("balance")) {
    return {
      hint: "Not enough credits. Call studio_estimate_generation or studio_credit_balance.",
      nextTool: "studio_estimate_generation",
    };
  }
  if (m.includes("path not found") || m.includes("folder not found")) {
    return {
      hint: "Use studio_search / studio_resolve_path, or studio_ensure_path to create nested folders.",
      nextTool: "studio_ensure_path",
    };
  }
  if (m.includes("style sheet") || m.includes("stylesheet")) {
    return {
      hint: "List sheets with studio_list_style_sheets; build with studio_build_style_sheet before generate.",
      nextTool: "studio_list_style_sheets",
    };
  }
  if (m.includes("unbuilt") || m.includes("buildstatus") || m.includes("sheet")) {
    return {
      hint: "Read studio_production_guide. Build element sheets before referenceElementIds generate.",
      nextTool: "studio_production_guide",
    };
  }
  if (m.includes("elevenvoiceid") || m.includes("voice")) {
    return {
      hint: "Browse voices with studio_explore_voices or studio_list_saved_voices.",
      nextTool: "studio_explore_voices",
    };
  }
  if (m.includes("startframe") || m.includes("start_frame") || m.includes("first_frame")) {
    return {
      hint: "Generate a storyboard still with studio_generate_image, then pass startFrameAssetId.",
      nextTool: "studio_generate_image",
    };
  }
  if (m.includes("music")) {
    return { hint: "Music generation is not available. Use voiceover or sfx via studio_generate_audio." };
  }
  if (m.includes("concurrent") || status === 429) {
    return {
      hint: "Too many active jobs. Poll with studio_get_generation or wait, then retry.",
      nextTool: "studio_list_generations",
    };
  }
  return undefined;
}

export class StudioApiError extends Error {
  status?: number;
  nextTool?: string;
  hint?: string;

  constructor(message: string, status?: number) {
    const help = hintForError(message, status);
    const suffix = help
      ? `\n→ ${help.hint}${help.nextTool ? ` (try ${help.nextTool})` : ""}`
      : "";
    super(`${message}${suffix}`);
    this.name = "StudioApiError";
    this.status = status;
    this.nextTool = help?.nextTool;
    this.hint = help?.hint;
  }
}

export async function studioFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const { apiKey, apiUrl } = requireConfig();
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    [key: string]: unknown;
  };
  if (!response.ok) {
    throw new StudioApiError(
      typeof data.error === "string" ? data.error : `HTTP ${response.status}`,
      response.status,
    );
  }
  return data;
}

export type GenerationJob = {
  id: string;
  status: string;
  error?: string | null;
  assets?: unknown[];
  mode?: string;
  folderId?: string;
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
        throw new StudioApiError(job.error ?? "Generation failed");
      }
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new StudioApiError(
    `Generation timed out after ${Math.round(timeoutMs / 1000)}s (job ${jobId})`,
  );
}

/** Poll many jobs until all terminal (or timeout). Returns per-job results. */
export async function pollGenerations(
  jobIds: string[],
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<Array<{ jobId: string; ok: boolean; job?: GenerationJob; error?: string }>> {
  const intervalMs = options?.intervalMs ?? 3000;
  const timeoutMs = options?.timeoutMs ?? 300_000;
  const started = Date.now();
  const pending = new Set(jobIds);
  const results = new Map<string, { jobId: string; ok: boolean; job?: GenerationJob; error?: string }>();

  while (pending.size > 0 && Date.now() - started < timeoutMs) {
    await Promise.all(
      [...pending].map(async (jobId) => {
        try {
          const job = (await studioFetch(
            `/generations/${encodeURIComponent(jobId)}`,
          )) as GenerationJob;
          if (!TERMINAL.has(job.status)) return;
          pending.delete(jobId);
          if (job.status === "failed") {
            results.set(jobId, {
              jobId,
              ok: false,
              job,
              error: job.error ?? "Generation failed",
            });
          } else {
            results.set(jobId, { jobId, ok: true, job });
          }
        } catch (error) {
          pending.delete(jobId);
          results.set(jobId, {
            jobId,
            ok: false,
            error: error instanceof Error ? error.message : "poll failed",
          });
        }
      }),
    );
    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  for (const jobId of pending) {
    results.set(jobId, {
      jobId,
      ok: false,
      error: `Generation timed out after ${Math.round(timeoutMs / 1000)}s`,
    });
  }

  return jobIds.map((id) => results.get(id) ?? { jobId: id, ok: false, error: "missing" });
}

/** Drop heavy nested blobs for agent context. */
export function compactPayload(data: unknown, depth = 0): unknown {
  if (data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    if (depth > 4) return `[${data.length} items]`;
    return data.slice(0, 40).map((item) => compactPayload(item, depth + 1));
  }
  const obj = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      key === "contentMarkdown" ||
      key === "project" ||
      key === "enhancedPrompt" ||
      key === "styleRules"
    ) {
      if (typeof value === "string") {
        out[key] = value.length > 240 ? `${value.slice(0, 240)}…` : value;
        out[`${key}Length`] = value.length;
      } else {
        out[key] = "[omitted]";
      }
      continue;
    }
    if (key === "children" && Array.isArray(value) && depth >= 2) {
      out.childrenCount = value.length;
      continue;
    }
    if (typeof value === "string" && value.length > 500 && /url|base64|markdown/i.test(key)) {
      out[key] = `${value.slice(0, 120)}…`;
      continue;
    }
    out[key] = compactPayload(value, depth + 1);
  }
  return out;
}

export function jsonResult(data: unknown, compact?: boolean) {
  const payload = wantsCompact(compact) ? compactPayload(data) : data;
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

/** Static agent orientation — returned by studio_bootstrap. */
export const AGENT_START_HERE = {
  preferred: [
    "studio_bootstrap — start of every session / project",
    "studio_ensure_path — create nested folders in one call",
    "studio_search / studio_workspace_tree / studio_resolve_path — find things",
    "studio_project_context — pack for an existing project folder",
    "studio_estimate_generation → studio_generate_* (or studio_generate_batch)",
    "studio_production_guide — before element/character/prop sheets",
    "studio_view_media — inspect outputs before the next generate",
    "studio_create_edit → studio_edit_append_clips → studio_pull_frame → studio_edit_* → studio_export_edit — MCP timeline editing",
  ],
  lanes: {
    direct: "studio_generate_image|video|script|audio — agent-owned prompts (default for production skills)",
    assisted:
      "studio_ensure_brief → … → studio_approve_brief — Studio Assistance UI lane; use only when user wants assisted briefs",
    editing:
      "studio_create_edit → append/update/reorder/split/transition → studio_pull_frame → studio_export_edit (full PUT via studio_update_edit is escape hatch)",
  },
  avoidBlindBfs: "Prefer studio_workspace_tree / studio_search over repeated studio_list_folders.",
  stillUsefulNotDuplicates: [
    "studio_list_folders / studio_folder_contents — fine for single-level browse",
    "studio_list_presets — deprecated (Style Sheets replace presets); Direct/unstyled only",
    "studio_credit_balance — alias of studio_health",
  ],
} as const;
