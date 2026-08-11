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

/** Agent/MCP aliases that are not real catalog tools. */
export const STUDIO_TOOL_ALIASES = {
  studio_delete_document: { tool: "studio_trash", kind: "document" },
  studio_delete_asset: { tool: "studio_trash", kind: "asset" },
  studio_delete_folder: { tool: "studio_trash", kind: "folder" },
  studio_delete_element: { tool: "studio_trash", kind: "element" },
};

/**
 * Map kind↔collection and id aliases so Agent can pass {kind,id}
 * while the HTTP catalog uses /{collection}/{id}.
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
export function normalizeStudioToolArgs(toolName, args = {}) {
  const input =
    args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
  const name = String(toolName || "");

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

/**
 * @param {string} apiBase e.g. https://host (no trailing slash) — calls `${apiBase}/api/v1${path}`
 * @param {string} bearerToken
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
export async function invokeStudioTool(apiBase, bearerToken, toolName, args = {}) {
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
  return { ok: true, status: res.status, data };
}
