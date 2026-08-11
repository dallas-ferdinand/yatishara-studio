import { CATALOG_VERSION } from './types.js';
import raw from './catalog.generated.json' with { type: 'json' };

/** @type {import('./types.js').StudioToolDef[]} */
export const STUDIO_TOOL_CATALOG = raw;

const byName = new Map(STUDIO_TOOL_CATALOG.map((tool) => [tool.name, tool]));

export function catalogVersion() {
  return CATALOG_VERSION;
}

export function listTools() {
  return STUDIO_TOOL_CATALOG.slice();
}

export function getTool(name) {
  return byName.get(String(name)) ?? null;
}

export function toolNames() {
  return STUDIO_TOOL_CATALOG.map((tool) => tool.name);
}

/**
 * @param {import('./types.js').ToolSurface} surface
 * @param {{ role?: string|null }} [opts]
 */
export function listToolsForSurface(surface, opts = {}) {
  const role = opts.role ?? 'user';
  const isAdmin = role === 'admin' || role === 'super_admin';
  return STUDIO_TOOL_CATALOG.filter((tool) => {
    if (!tool.surfaces.includes(surface)) {
      // Admin surface tools also visible on mcp; agent never sees admin unless role
      if (surface === 'agent' && tool.surfaces.includes('admin') && isAdmin) return true;
      return false;
    }
    if (tool.role === 'admin' && !isAdmin) return false;
    return true;
  });
}

export function describeTool(name) {
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
