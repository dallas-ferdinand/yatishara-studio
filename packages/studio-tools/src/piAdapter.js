import { catalogVersion, describeTool, listToolsForSurface } from './catalog.js';
import { authorizeTool } from './policy.js';
import { invokeStudioTool } from './http.js';

/**
 * Dynamic discovery tools for Pi — avoids injecting 200+ schemas into every prompt.
 *
 * @param {{
 *   apiBase: string,
 *   getBearerToken: () => string|Promise<string>,
 *   role?: string,
 *   scopes?: string[],
 *   onApprovalRequired?: (info: { toolName: string, args: Record<string, unknown>, tool: any }) => Promise<any>,
 *   localHandlers?: Record<string, (args: Record<string, unknown>) => Promise<any>>,
 * }} opts
 */
export function createPiStudioTools(opts) {
  const role = opts.role ?? 'user';
  const scopes = opts.scopes ?? ['read', 'write', 'generate', 'messages', 'social', 'marketplace'];
  const localHandlers = opts.localHandlers ?? {};

  return [
    {
      name: 'catalog',
      description:
        'List available Studio tools for this user (name, category, risk, requiresApproval). Prefer this before invoke. Filter with optional category or q.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          q: { type: 'string', description: 'Substring filter on name/description' },
          limit: { type: 'number' },
        },
      },
      execute: async ({ category, q, limit } = {}) => {
        let tools = listToolsForSurface('agent', { role }).map((t) => ({
          name: t.name,
          category: t.category,
          risk: t.risk,
          scope: t.scope,
          requiresApproval: t.requiresApproval,
          description: t.description.slice(0, 160),
        }));
        if (category) tools = tools.filter((t) => t.category === category);
        if (q) {
          const needle = String(q).toLowerCase();
          tools = tools.filter(
            (t) =>
              t.name.includes(needle) ||
              t.description.toLowerCase().includes(needle),
          );
        }
        const max = Math.min(Math.max(Number(limit) || 80, 1), 200);
        return {
          catalogVersion: catalogVersion(),
          count: tools.length,
          tools: tools.slice(0, max),
        };
      },
    },
    {
      name: 'describe',
      description: 'Describe one Studio tool: schema, HTTP mapping, risk, approval rule.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      execute: async ({ name }) => {
        const info = describeTool(name);
        if (!info) return { ok: false, error: `Unknown tool: ${name}` };
        const auth = authorizeTool(name, { surface: 'agent', role, scopes });
        return { ok: auth.ok, ...(auth.ok ? {} : { error: auth.error }), tool: info };
      },
    },
    {
      name: 'invoke',
      description:
        'Invoke a Studio tool by name with a JSON args object. Reads and safe writes run immediately. Paid/destructive/outbound/admin tools create an approval card instead of executing.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          args: { type: 'object' },
        },
        required: ['name'],
      },
      execute: async ({ name, args } = {}) => {
        const toolName = String(name || '');
        const toolArgs = args && typeof args === 'object' ? args : {};
        const auth = authorizeTool(toolName, { surface: 'agent', role, scopes });
        if (!auth.ok) return { ok: false, error: auth.error, code: auth.code };

        if (auth.requiresApproval) {
          if (typeof opts.onApprovalRequired === 'function') {
            return opts.onApprovalRequired({
              toolName,
              args: toolArgs,
              tool: auth.tool,
            });
          }
          return {
            ok: false,
            pendingApproval: true,
            toolName,
            error: 'Approval required but no approval handler configured',
          };
        }

        if (localHandlers[toolName]) {
          const data = await localHandlers[toolName](toolArgs);
          return { ok: true, toolName, data };
        }

        const token = await opts.getBearerToken();
        return invokeStudioTool(opts.apiBase, token, toolName, toolArgs);
      },
    },
  ];
}
