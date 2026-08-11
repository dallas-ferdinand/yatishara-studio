import { listToolsForSurface, toolNames, getTool, catalogVersion } from './catalog.js';
import { AGENT_BLOCKED_FROM_SURFACES } from './surfaces.js';

/**
 * Positive surface helpers for MCP registration.
 * Existing MCP tool modules stay; callers gate with these.
 */

export function mcpToolNames() {
  return listToolsForSurface('mcp', { role: 'super_admin' }).map((t) => t.name);
}

export function agentToolNames(role = 'user') {
  return listToolsForSurface('agent', { role }).map((t) => t.name);
}

export function adminToolNames() {
  return listToolsForSurface('admin', { role: 'super_admin' }).map((t) => t.name);
}

export function shouldRegisterMcpTool(name, { agentSurface = false, role = 'user' } = {}) {
  const tool = getTool(name);
  if (!tool) return true; // unknown → allow (legacy), parity tests catch drift
  if (agentSurface) {
    return tool.surfaces.includes('agent') ||
      ((role === 'admin' || role === 'super_admin') && tool.surfaces.includes('admin'));
  }
  return tool.surfaces.includes('mcp') || tool.surfaces.includes('admin');
}

/** @deprecated Prefer positive surfaces via shouldRegisterMcpTool / agentToolNames */
export const AGENT_BLOCKED_TOOL_NAMES = AGENT_BLOCKED_FROM_SURFACES;

export function isAgentBlockedTool(name) {
  return AGENT_BLOCKED_FROM_SURFACES.includes(name);
}

export function catalogParityReport(registeredNames) {
  const catalog = new Set(toolNames());
  const registered = new Set(registeredNames);
  const missingInCatalog = [...registered].filter((n) => !catalog.has(n)).sort();
  const missingInMcp = [...catalog].filter((n) => !registered.has(n)).sort();
  return {
    catalogVersion: catalogVersion(),
    catalogCount: catalog.size,
    registeredCount: registered.size,
    missingInCatalog,
    missingInMcp,
    ok: missingInCatalog.length === 0 && missingInMcp.length === 0,
  };
}
