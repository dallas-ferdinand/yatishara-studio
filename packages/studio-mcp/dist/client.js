const apiKey = process.env.STUDIO_API_KEY;
const apiUrl = (process.env.STUDIO_API_URL ?? "").replace(/\/$/, "");
const defaultCompact = process.env.STUDIO_MCP_COMPACT === "1" || process.env.STUDIO_MCP_COMPACT === "true";
function requireConfig() {
  if (!apiKey) {
    throw new Error("STUDIO_API_KEY is required");
  }
  if (!apiUrl) {
    throw new Error("STUDIO_API_URL is required");
  }
  return { apiKey, apiUrl };
}
function wantsCompact(explicit) {
  return explicit ?? defaultCompact;
}
function hintForError(message, status) {
  const m = message.toLowerCase();
  if (status === 401 || m.includes("authorization") || m.includes("api key")) {
    return {
      hint: "Check STUDIO_API_KEY / STUDIO_API_URL. Call studio_bootstrap to verify.",
      nextTool: "studio_bootstrap"
    };
  }
  if (m.includes("insufficient") || m.includes("credit") || m.includes("balance")) {
    return {
      hint: "Not enough credits. Call studio_estimate_generation or studio_credit_balance.",
      nextTool: "studio_estimate_generation"
    };
  }
  if (m.includes("path not found") || m.includes("folder not found")) {
    return {
      hint: "Use studio_search / studio_resolve_path, or studio_ensure_path to create nested folders.",
      nextTool: "studio_ensure_path"
    };
  }
  if (m.includes("style sheet") || m.includes("stylesheet")) {
    return {
      hint: "List sheets with studio_list_style_sheets; build with studio_build_style_sheet before generate.",
      nextTool: "studio_list_style_sheets"
    };
  }
  if (m.includes("unbuilt") || m.includes("buildstatus") || m.includes("sheet")) {
    return {
      hint: "Read studio_production_guide. Build element sheets before referenceElementIds generate.",
      nextTool: "studio_production_guide"
    };
  }
  if (m.includes("elevenvoiceid") || m.includes("voice")) {
    return {
      hint: "Browse voices with studio_explore_voices or studio_list_saved_voices.",
      nextTool: "studio_explore_voices"
    };
  }
  if (m.includes("startframe") || m.includes("start_frame") || m.includes("first_frame")) {
    return {
      hint: "Generate a storyboard still with studio_generate_image, then pass startFrameAssetId.",
      nextTool: "studio_generate_image"
    };
  }
  if (m.includes("music")) {
    return { hint: "Music generation is not available. Use voiceover or sfx via studio_generate_audio." };
  }
  if (m.includes("concurrent") || status === 429) {
    return {
      hint: "Too many active jobs. Poll with studio_get_generation or wait, then retry.",
      nextTool: "studio_list_generations"
    };
  }
  return void 0;
}
class StudioApiError extends Error {
  status;
  nextTool;
  hint;
  constructor(message, status) {
    const help = hintForError(message, status);
    const suffix = help ? `
\u2192 ${help.hint}${help.nextTool ? ` (try ${help.nextTool})` : ""}` : "";
    super(`${message}${suffix}`);
    this.name = "StudioApiError";
    this.status = status;
    this.nextTool = help?.nextTool;
    this.hint = help?.hint;
  }
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
    throw new StudioApiError(
      typeof data.error === "string" ? data.error : `HTTP ${response.status}`,
      response.status
    );
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
        throw new StudioApiError(job.error ?? "Generation failed");
      }
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new StudioApiError(
    `Generation timed out after ${Math.round(timeoutMs / 1e3)}s (job ${jobId})`
  );
}
async function pollGenerations(jobIds, options) {
  const intervalMs = options?.intervalMs ?? 3e3;
  const timeoutMs = options?.timeoutMs ?? 3e5;
  const started = Date.now();
  const pending = new Set(jobIds);
  const results = /* @__PURE__ */ new Map();
  while (pending.size > 0 && Date.now() - started < timeoutMs) {
    await Promise.all(
      [...pending].map(async (jobId) => {
        try {
          const job = await studioFetch(
            `/generations/${encodeURIComponent(jobId)}`
          );
          if (!TERMINAL.has(job.status)) return;
          pending.delete(jobId);
          if (job.status === "failed") {
            results.set(jobId, {
              jobId,
              ok: false,
              job,
              error: job.error ?? "Generation failed"
            });
          } else {
            results.set(jobId, { jobId, ok: true, job });
          }
        } catch (error) {
          pending.delete(jobId);
          results.set(jobId, {
            jobId,
            ok: false,
            error: error instanceof Error ? error.message : "poll failed"
          });
        }
      })
    );
    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  for (const jobId of pending) {
    results.set(jobId, {
      jobId,
      ok: false,
      error: `Generation timed out after ${Math.round(timeoutMs / 1e3)}s`
    });
  }
  return jobIds.map((id) => results.get(id) ?? { jobId: id, ok: false, error: "missing" });
}
function compactPayload(data, depth = 0) {
  if (data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    if (depth > 4) return `[${data.length} items]`;
    return data.slice(0, 40).map((item) => compactPayload(item, depth + 1));
  }
  const obj = data;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "contentMarkdown" || key === "project" || key === "enhancedPrompt" || key === "styleRules") {
      if (typeof value === "string") {
        out[key] = value.length > 240 ? `${value.slice(0, 240)}\u2026` : value;
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
      out[key] = `${value.slice(0, 120)}\u2026`;
      continue;
    }
    out[key] = compactPayload(value, depth + 1);
  }
  return out;
}
function jsonResult(data, compact) {
  const payload = wantsCompact(compact) ? compactPayload(data) : data;
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}
const AGENT_START_HERE = {
  preferred: [
    "studio_bootstrap \u2014 start of every session / project",
    "studio_ensure_path \u2014 create nested folders in one call",
    "studio_search / studio_workspace_tree / studio_resolve_path \u2014 find things",
    "studio_project_context \u2014 pack for an existing project folder",
    "studio_estimate_generation \u2192 studio_generate_* (or studio_generate_batch)",
    "studio_production_guide \u2014 before element/character/prop sheets",
    "studio_view_media \u2014 inspect outputs before the next generate",
    "studio_create_edit \u2192 studio_edit_append_clips \u2192 studio_pull_frame \u2192 studio_edit_* \u2192 studio_export_edit \u2014 MCP timeline editing"
  ],
  lanes: {
    direct: "studio_generate_image|video|script|audio \u2014 agent-owned prompts (default for production skills)",
    assisted: "studio_ensure_brief \u2192 \u2026 \u2192 studio_approve_brief \u2014 Studio Assistance UI lane; use only when user wants assisted briefs",
    editing: "studio_create_edit \u2192 append/update/reorder/split/transition \u2192 studio_pull_frame \u2192 studio_export_edit (full PUT via studio_update_edit is escape hatch)"
  },
  avoidBlindBfs: "Prefer studio_workspace_tree / studio_search over repeated studio_list_folders.",
  stillUsefulNotDuplicates: [
    "studio_list_folders / studio_folder_contents \u2014 fine for single-level browse",
    "studio_list_presets \u2014 deprecated (Style Sheets replace presets); Direct/unstyled only",
    "studio_credit_balance \u2014 alias of studio_health"
  ]
};
export {
  AGENT_START_HERE,
  StudioApiError,
  compactPayload,
  jsonResult,
  pollGeneration,
  pollGenerations,
  requireConfig,
  studioFetch,
  wantsCompact
};
