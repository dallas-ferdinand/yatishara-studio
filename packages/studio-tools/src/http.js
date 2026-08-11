import { getTool } from './catalog.js';

/**
 * Build path + body for a catalog tool invoke.
 * Path params are taken from args when template has {name}.
 * Remaining args become JSON body (non-GET) or query (GET).
 *
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
export function buildStudioRequest(toolName, args = {}) {
  const tool = getTool(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  if (!tool.http) {
    return {
      local: true,
      toolName,
      args,
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
    const value = args[key];
    if (value == null || value === '') {
      if (isOptionalSuffix) return '';
      throw new Error(`Missing path param ${key} for ${toolName}`);
    }
    if (isOptionalSuffix && typeof value === 'string') {
      return value;
    }
    return encodeURIComponent(String(value));
  });
  /** @type {Record<string, unknown>} */
  const rest = {};
  for (const [key, value] of Object.entries(args)) {
    if (used.has(key)) continue;
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
      toolName,
      method: 'GET',
      path: query ? `${path}?${query}` : path,
      body: null,
    };
  }
  return {
    local: false,
    toolName,
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
