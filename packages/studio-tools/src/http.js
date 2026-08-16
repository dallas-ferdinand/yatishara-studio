import { getTool } from './catalog.js';

const KIND_TO_COLLECTION = {
  folder: "folders",
  asset: "assets",
  document: "documents",
  element: "elements",
};

const COLLECTION_TO_KIND = {
  folders: "folder",
  assets: "asset",
  documents: "document",
  elements: "element",
};

const GENERATION_MODE_BY_TOOL = {
  studio_generate_image: "image",
  studio_generate_video: "video",
  studio_generate_audio: "audio",
};

/** Agent/MCP aliases that are not real catalog tools. */
export const STUDIO_TOOL_ALIASES = {
  studio_delete_document: { tool: "studio_trash", kind: "document" },
  studio_delete_asset: { tool: "studio_trash", kind: "asset" },
  studio_delete_folder: { tool: "studio_trash", kind: "folder" },
  studio_delete_element: { tool: "studio_trash", kind: "element" },
  studio_list_folder: { tool: "studio_list_folders" },
  studio_list_document: { tool: "studio_folder_contents" },
  studio_list_documents: { tool: "studio_folder_contents" },
  studio_list_assets: { tool: "studio_folder_contents" },
  studio_list_scripts: { tool: "studio_folder_contents" },
  studio_describe_asset: { tool: "studio_get_asset" },
  studio_describe_document: { tool: "studio_get_document" },
  studio_read_document: { tool: "studio_get_document" },
  studio_open_document: { tool: "studio_get_document" },
  studio_get_media: { tool: "studio_view_media" },
  studio_list_frames: { tool: "studio_pull_frames" },
  studio_extract_frames: { tool: "studio_pull_frames" },
  studio_estimate: { tool: "studio_estimate_generation" },
  studio_move: { tool: "studio_bulk_move" },
  studio_rename_document: { tool: "studio_update_document" },
};

/**
 * Agent generate tools must queue (wait:false) + set mode.
 * Sync wait blocks the Pi turn past STUDIO_AGENT_TURN_TIMEOUT_MS while Seedance runs.
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
export function normalizeAgentGenerationArgs(toolName, args = {}) {
  const name = String(toolName || "");
  const input =
    args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
  const mode = GENERATION_MODE_BY_TOOL[name];
  if (!mode && name !== "studio_generate_batch") return input;
  if (mode) {
    input.mode = mode;
    input.wait = false;
  }
  if (name === "studio_generate_batch") {
    input.wait = false;
    if ((!Array.isArray(input.items) || !input.items.length) && input.prompt) {
      input.items = [
        {
          mode: input.mode || "image",
          prompt: input.prompt,
          folderId: input.folderId,
        },
      ];
    }
  }
  return input;
}

/**
 * Agent HTTP catalog maps studio_generate_batch → POST /generations (single).
 * MCP batch is local (items[]). Expand items into single generate_* calls.
 * @param {Record<string, unknown>} args
 */
export function expandGenerateBatchItems(args) {
  const input = normalizeAgentGenerationArgs("studio_generate_batch", args);
  const items = Array.isArray(input.items) ? input.items : [];
  return items.slice(0, 8);
}

/**
 * Map kind↔collection and id aliases so Agent can pass {kind,id}
 * while the HTTP catalog uses /{collection}/{id}.
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
export function normalizeStudioToolArgs(toolName, args = {}) {
  const input = normalizeAgentGenerationArgs(toolName, args);
  const name = String(toolName || "");

  if (name === "studio_get_academy_course" && !input.courseId && input.slug) {
    input.courseId = input.slug;
  }

  if (name === "studio_trash" || name === "studio_restore") {
    const kindRaw = String(input.kind || "").trim().toLowerCase();
    const collectionRaw = String(input.collection || "").trim().toLowerCase();
    if (!input.collection && kindRaw && KIND_TO_COLLECTION[kindRaw]) {
      input.collection = KIND_TO_COLLECTION[kindRaw];
    }
    if (!input.kind && collectionRaw && COLLECTION_TO_KIND[collectionRaw]) {
      input.kind = COLLECTION_TO_KIND[collectionRaw];
    }
    if (!input.id) {
      const id =
        input.documentId ||
        input.assetId ||
        input.folderId ||
        input.elementId ||
        input._id;
      if (id != null && String(id).trim()) input.id = String(id).trim();
    }
    // Infer kind/collection from which id field was provided.
    if (!input.kind && !input.collection) {
      if (input.documentId) {
        input.kind = "document";
        input.collection = "documents";
      } else if (input.assetId) {
        input.kind = "asset";
        input.collection = "assets";
      } else if (input.folderId) {
        input.kind = "folder";
        input.collection = "folders";
      } else if (input.elementId) {
        input.kind = "element";
        input.collection = "elements";
      }
    }
  }

  return input;
}

/**
 * Resolve invented delete_* names to studio_trash.
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
export function resolveStudioToolAlias(toolName, args = {}) {
  const alias = STUDIO_TOOL_ALIASES[String(toolName || "")];
  if (!alias) {
    return { toolName, args: normalizeStudioToolArgs(toolName, args) };
  }
  const next = normalizeStudioToolArgs(alias.tool, {
    ...args,
    kind: args?.kind || alias.kind,
  });
  return { toolName: alias.tool, args: next };
}

/**
 * Build path + body for a catalog tool invoke.
 * Path params are taken from args when template has {name}.
 * Remaining args become JSON body (non-GET) or query (GET).
 *
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
export function buildStudioRequest(toolName, args = {}) {
  const resolved = resolveStudioToolAlias(toolName, args);
  const tool = getTool(resolved.toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  if (!tool.http) {
    return {
      local: true,
      toolName: resolved.toolName,
      args: resolved.args,
      method: null,
      path: null,
      body: null,
    };
  }
  const used = new Set();
  // Drop dynamic query placeholders (?{params}, ?q={q}). Static ?scope=mcp stays.
  // GET/non-path args are rebuilt as a real query string below.
  const pathTemplate = String(tool.http.pathTemplate).replace(/\?[^#]*$/, (queryPart) =>
    /\{[a-zA-Z0-9_]+\}/.test(queryPart) ? '' : queryPart,
  );
  const path = pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const isOptionalSuffix = key === 'query' || key === 'suffix';
    used.add(key);
    const value = resolved.args[key];
    if (value == null || value === '') {
      if (isOptionalSuffix) return '';
      throw new Error(`Missing path param ${key} for ${resolved.toolName}`);
    }
    if (isOptionalSuffix && typeof value === 'string') {
      return value;
    }
    return encodeURIComponent(String(value));
  });
  /** @type {Record<string, unknown>} */
  const rest = {};
  for (const [key, value] of Object.entries(resolved.args)) {
    if (used.has(key)) continue;
    // kind is Agent-facing; collection already filled the path.
    if (key === 'kind' && used.has('collection')) continue;
    if (value === undefined) continue;
    rest[key] = value;
  }
  if (tool.http.method === 'GET') {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(rest)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) qs.append(key, String(item));
      } else if (typeof value === 'object') {
        qs.set(key, JSON.stringify(value));
      } else {
        qs.set(key, String(value));
      }
    }
    const query = qs.toString();
    return {
      local: false,
      toolName: resolved.toolName,
      method: 'GET',
      path: query ? `${path}?${query}` : path,
      body: null,
    };
  }
  return {
    local: false,
    toolName: resolved.toolName,
    method: tool.http.method,
    path,
    body: rest,
  };
}

const GENERATION_TERMINAL = new Set(["done", "failed"]);

/**
 * @param {unknown} data
 */
function generationJobId(data) {
  if (!data || typeof data !== "object") return "";
  const row = /** @type {Record<string, unknown>} */ (data);
  const id = row.id || row.jobId || row._id;
  return typeof id === "string" && id.trim() ? id.trim() : "";
}

/**
 * @param {string} toolName
 * @param {unknown} data
 * @param {number} [httpStatus]
 */
export function shouldPollGeneration(toolName, data, httpStatus) {
  if (!/^studio_generate_(image|video|audio)$/.test(String(toolName || ""))) {
    return false;
  }
  if (!generationJobId(data)) return false;
  if (httpStatus === 202) return true;
  const status = String(
    data && typeof data === "object"
      ? /** @type {Record<string, unknown>} */ (data).status || ""
      : "",
  ).toLowerCase();
  return status === "queued" || status === "running" || status === "pending";
}

/**
 * Poll GET /generations/:id until terminal or timeout.
 * @param {string} apiBase
 * @param {string} bearerToken
 * @param {string} jobId
 * @param {{ intervalMs?: number, timeoutMs?: number, signal?: AbortSignal }} [options]
 */
export async function pollGenerationJob(
  apiBase,
  bearerToken,
  jobId,
  options = {},
) {
  const intervalMs = options.intervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 540_000;
  const started = Date.now();
  let last = /** @type {Record<string, unknown> | null} */ (null);

  while (Date.now() - started < timeoutMs) {
    if (options.signal?.aborted) {
      const err = new Error("Generation poll aborted");
      err.name = "AbortError";
      throw err;
    }
    const url = `${apiBase.replace(/\/$/, "")}/api/v1/generations/${encodeURIComponent(jobId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${bearerToken}` },
      signal: options.signal,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
        data,
      };
    }
    last = data && typeof data === "object" ? data : { raw: data };
    const status = String(last.status || "").toLowerCase();
    if (GENERATION_TERMINAL.has(status)) {
      if (status === "failed") {
        return {
          ok: false,
          status: res.status,
          error:
            typeof last.error === "string" && last.error
              ? last.error
              : "Generation failed",
          data: last,
        };
      }
      return { ok: true, status: res.status, data: last };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    ok: true,
    status: 202,
    data: {
      ...(last || { id: jobId }),
      id: generationJobId(last) || jobId,
      status: String(last?.status || "queued"),
      stillRendering: true,
      message:
        "Generation still rendering in Files — turn returned early so chat does not time out.",
    },
  };
}

/**
 * @param {string} apiBase e.g. https://host (no trailing slash) — calls `${apiBase}/api/v1${path}`
 * @param {string} bearerToken
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @param {{ awaitGeneration?: boolean, pollTimeoutMs?: number, pollIntervalMs?: number, signal?: AbortSignal, onGenerationQueued?: (info: { toolName: string, jobId: string, data: Record<string, unknown> }) => Promise<void>|void }} [options]
 */
export async function invokeStudioTool(apiBase, bearerToken, toolName, args = {}, options = {}) {
  if (String(toolName) === "studio_generate_batch") {
    const items = expandGenerateBatchItems(args);
    if (!items.length) {
      return {
        ok: false,
        error:
          "studio_generate_batch requires args.items[{mode,prompt}] (max 8). Or pass prompt for a single job.",
      };
    }
    const jobs = [];
    for (const [index, raw] of items.entries()) {
      const item = raw && typeof raw === "object" ? raw : {};
      const prompt = String(item.prompt || "").trim();
      if (!prompt) {
        jobs.push({
          ok: false,
          index,
          label: item.label,
          error: "prompt is required",
        });
        continue;
      }
      const mode =
        item.mode === "video" || item.mode === "audio" || item.mode === "script"
          ? item.mode
          : "image";
      const child =
        mode === "video"
          ? "studio_generate_video"
          : mode === "audio"
            ? "studio_generate_audio"
            : "studio_generate_image";
      const res = await invokeStudioTool(
        apiBase,
        bearerToken,
        child,
        { ...item, prompt, wait: false },
        options,
      );
      jobs.push({
        ok: res?.ok !== false,
        index,
        mode,
        label: item.label,
        error: res?.error,
        data: res?.data,
      });
    }
    const anyOk = jobs.some((job) => job.ok);
    return {
      ok: anyOk,
      data: { count: jobs.length, jobs },
      error: anyOk
        ? undefined
        : jobs.find((job) => job.error)?.error || "batch failed",
    };
  }

  const req = buildStudioRequest(toolName, args);
  if (req.local) {
    return {
      ok: false,
      error: `Tool ${toolName} is local-only and must be handled by the host adapter`,
      local: true,
      args: req.args,
    };
  }
  const url = `${apiBase.replace(/\/$/, '')}/api/v1${req.path}`;
  const res = await fetch(url, {
    method: req.method,
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
    },
    body: req.method === 'GET' ? undefined : JSON.stringify(req.body ?? {}),
    signal: options.signal,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 4000) };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      data,
    };
  }

  const result = { ok: true, status: res.status, data };
  if (
    options.awaitGeneration === false ||
    !shouldPollGeneration(req.toolName || toolName, data, res.status)
  ) {
    return result;
  }

  const jobId = generationJobId(data);
  // Persist job id in chat BEFORE polling — if the Pi turn dies mid-render
  // (fetch failed / timeout), the UI can still follow Create → show the video.
  if (jobId && typeof options.onGenerationQueued === "function") {
    try {
      await options.onGenerationQueued({
        toolName: req.toolName || toolName,
        jobId,
        data: {
          ...(data && typeof data === "object" ? data : {}),
          id: jobId,
          status: String(
            data && typeof data === "object"
              ? /** @type {Record<string, unknown>} */ (data).status || "queued"
              : "queued",
          ),
          stillRendering: true,
          message:
            "Generation queued — rendering in Files. Chat will pick it up when ready.",
        },
      });
    } catch {
      // best-effort chat progress
    }
  }
  return pollGenerationJob(apiBase, bearerToken, jobId, {
    intervalMs: options.pollIntervalMs,
    timeoutMs: options.pollTimeoutMs ?? 540_000,
    signal: options.signal,
  });
}
