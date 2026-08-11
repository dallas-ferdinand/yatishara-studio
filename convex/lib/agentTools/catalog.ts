import { CATALOG_VERSION } from "./types";
import raw from "./catalog.generated.json";

export const STUDIO_TOOL_CATALOG = raw as Array<{
  name: string;
  description: string;
  category: string;
  scope: string;
  risk: string;
  role: string | null;
  surfaces: string[];
  requiresApproval: boolean;
  http: { method: string; pathTemplate: string } | null;
  inputSchema: Record<string, unknown>;
  sourceFile?: string;
}>;

const byName = new Map(STUDIO_TOOL_CATALOG.map((tool) => [tool.name, tool]));

export function catalogVersion() {
  return CATALOG_VERSION;
}

export function listTools() {
  return STUDIO_TOOL_CATALOG.slice();
}

export function getTool(name: string) {
  return byName.get(String(name)) ?? null;
}

export function toolNames() {
  return STUDIO_TOOL_CATALOG.map((tool) => tool.name);
}

export function listToolsForSurface(
  surface: string,
  opts: { role?: string | null } = {},
) {
  const role = opts.role ?? "user";
  const isAdmin = role === "admin" || role === "super_admin";
  return STUDIO_TOOL_CATALOG.filter((tool) => {
    if (!tool.surfaces.includes(surface)) {
      if (surface === "agent" && tool.surfaces.includes("admin") && isAdmin) {
        return true;
      }
      return false;
    }
    if (tool.role === "admin" && !isAdmin) return false;
    return true;
  });
}

export function describeTool(name: string) {
  const tool = getTool(name);
  if (!tool) return null;
  return {
    name: tool.name,
    description: tool.description,
    category: tool.category,
    scope: tool.scope,
    risk: tool.risk,
    role: tool.role,
    surfaces: tool.surfaces,
    requiresApproval: tool.requiresApproval,
    http: tool.http,
    inputSchema: tool.inputSchema,
    catalogVersion: CATALOG_VERSION,
  };
}
