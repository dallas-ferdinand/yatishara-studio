import { getTool } from "./catalog";

export function buildStudioRequest(
  toolName: string,
  args: Record<string, unknown> = {},
) {
  const tool = getTool(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  if (!tool.http) {
    return {
      local: true as const,
      toolName,
      args,
      method: null,
      path: null,
      body: null,
    };
  }
  const used = new Set<string>();
  // Drop dynamic query placeholders (?{params}, ?q={q}). Static ?scope=mcp stays.
  // GET/non-path args are rebuilt as a real query string below.
  const pathTemplate = String(tool.http.pathTemplate).replace(/\?[^#]*$/, (queryPart) =>
    /\{[a-zA-Z0-9_]+\}/.test(queryPart) ? "" : queryPart,
  );
  const path = pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    used.add(key);
    const value =
      args[key] ??
      (key === "courseId" ? args.slug : undefined);
    if (value == null || value === "") {
      throw new Error(`Missing path param ${key} for ${toolName}`);
    }
    return encodeURIComponent(String(value));
  });
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (used.has(key)) continue;
    if (value === undefined) continue;
    rest[key] = value;
  }
  if (tool.http.method === "GET") {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(rest)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) qs.append(key, String(item));
      } else if (typeof value === "object") {
        qs.set(key, JSON.stringify(value));
      } else {
        qs.set(key, String(value));
      }
    }
    const query = qs.toString();
    return {
      local: false as const,
      toolName,
      method: "GET" as const,
      path: query ? `${path}?${query}` : path,
      body: null,
    };
  }
  return {
    local: false as const,
    toolName,
    method: tool.http.method as "POST" | "PATCH" | "PUT" | "DELETE",
    path,
    body: rest,
  };
}

export async function invokeStudioTool(
  apiBase: string,
  bearerToken: string,
  toolName: string,
  args: Record<string, unknown> = {},
) {
  const req = buildStudioRequest(toolName, args);
  if (req.local) {
    return {
      ok: false,
      error: `Tool ${toolName} is local-only and must be handled by the host adapter`,
      local: true,
      args: req.args,
    };
  }
  const url = `${apiBase.replace(/\/$/, "")}/api/v1${req.path}`;
  const res = await fetch(url, {
    method: req.method!,
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
    },
    body: req.method === "GET" ? undefined : JSON.stringify(req.body ?? {}),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 4000) };
  }
  if (!res.ok) {
    const errObj = data as { error?: string };
    return {
      ok: false,
      status: res.status,
      error: typeof errObj.error === "string" ? errObj.error : `HTTP ${res.status}`,
      data,
    };
  }
  return { ok: true, status: res.status, data };
}
