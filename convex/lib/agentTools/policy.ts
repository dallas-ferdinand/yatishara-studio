import { getTool, listToolsForSurface } from "./catalog";

const APPROVAL_RISKS = new Set(["paid", "destructive", "outbound", "admin"]);

export function authorizeTool(
  toolName: string,
  ctx: { surface: string; role?: string | null; scopes?: string[] },
) {
  const tool = getTool(toolName);
  if (!tool) {
    return { ok: false as const, error: `Unknown tool: ${toolName}`, code: "unknown_tool" };
  }
  const role = ctx.role ?? "user";
  const isAdmin = role === "admin" || role === "super_admin";
  const allowed = listToolsForSurface(ctx.surface, { role }).some(
    (t) => t.name === tool.name,
  );
  if (!allowed) {
    return {
      ok: false as const,
      error: `Tool ${toolName} not available on surface ${ctx.surface}`,
      code: "surface_denied",
    };
  }
  if (tool.role === "admin" && !isAdmin) {
    return {
      ok: false as const,
      error: `Tool ${toolName} requires admin role`,
      code: "role_denied",
    };
  }
  if (ctx.scopes && ctx.scopes.length > 0 && !ctx.scopes.includes(tool.scope)) {
    return {
      ok: false as const,
      error: `Missing scope ${tool.scope} for ${toolName}`,
      code: "scope_denied",
      scope: tool.scope,
    };
  }
  return {
    ok: true as const,
    tool,
    requiresApproval: tool.requiresApproval || APPROVAL_RISKS.has(tool.risk),
  };
}

export function requiresApproval(toolName: string) {
  const tool = getTool(toolName);
  if (!tool) return true;
  return tool.requiresApproval || APPROVAL_RISKS.has(tool.risk);
}

export function canExecuteDirect(toolName: string) {
  return !requiresApproval(toolName);
}

export function scopesForRole(_role: string) {
  return ["read", "write", "generate", "messages", "social", "marketplace"];
}
