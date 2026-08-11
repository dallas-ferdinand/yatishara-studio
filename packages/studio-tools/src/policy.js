import { getTool, listToolsForSurface } from './catalog.js';

const APPROVAL_RISKS = new Set(['paid', 'destructive', 'outbound', 'admin']);

/**
 * @param {string} toolName
 * @param {{ surface: import('./types.js').ToolSurface, role?: string|null, scopes?: string[] }} ctx
 */
export function authorizeTool(toolName, ctx) {
  const tool = getTool(toolName);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${toolName}`, code: 'unknown_tool' };
  }
  const role = ctx.role ?? 'user';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const allowed = listToolsForSurface(ctx.surface, { role }).some((t) => t.name === tool.name);
  if (!allowed) {
    return { ok: false, error: `Tool ${toolName} not available on surface ${ctx.surface}`, code: 'surface_denied' };
  }
  if (tool.role === 'admin' && !isAdmin) {
    return { ok: false, error: `Tool ${toolName} requires admin role`, code: 'role_denied' };
  }
  if (ctx.scopes && ctx.scopes.length > 0 && !ctx.scopes.includes(tool.scope) && tool.scope !== 'read') {
    // read is always implied when any scope present; otherwise require exact scope
    if (!(tool.scope === 'read' && ctx.scopes.includes('read'))) {
      if (!ctx.scopes.includes(tool.scope)) {
        return {
          ok: false,
          error: `Missing scope ${tool.scope} for ${toolName}`,
          code: 'scope_denied',
          scope: tool.scope,
        };
      }
    }
  }
  return {
    ok: true,
    tool,
    requiresApproval: tool.requiresApproval || APPROVAL_RISKS.has(tool.risk),
  };
}

export function requiresApproval(toolName) {
  const tool = getTool(toolName);
  if (!tool) return true;
  return tool.requiresApproval || APPROVAL_RISKS.has(tool.risk);
}

export function canExecuteDirect(toolName) {
  return !requiresApproval(toolName);
}

/**
 * Scopes to mint on an agent capability session for a role.
 * @param {string} role
 */
export function scopesForRole(role) {
  const base = ['read', 'write', 'generate', 'messages', 'social', 'marketplace'];
  if (role === 'admin' || role === 'super_admin') return base;
  return base;
}
