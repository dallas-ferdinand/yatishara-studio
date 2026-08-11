import { STUDIO_TOOL_CATALOG } from './catalog.js';

/** Tools present on mcp but not agent — replaces duplicated blocklists. */
export const AGENT_BLOCKED_FROM_SURFACES = STUDIO_TOOL_CATALOG
  .filter((t) => t.surfaces.includes('mcp') && !t.surfaces.includes('agent'))
  .map((t) => t.name)
  .sort();
