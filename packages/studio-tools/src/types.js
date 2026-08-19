/** @typedef {'read'|'write'|'generate'|'messages'|'social'|'marketplace'} ToolScope */
/** @typedef {'read'|'safe_write'|'paid'|'destructive'|'outbound'|'admin'} ToolRisk */
/** @typedef {'agent'|'mcp'|'admin'} ToolSurface */
/** @typedef {'admin'|'super_admin'|null} ToolRole */

/**
 * @typedef {object} StudioToolHttp
 * @property {'GET'|'POST'|'PATCH'|'PUT'|'DELETE'} method
 * @property {string} pathTemplate
 */

/**
 * @typedef {object} StudioToolDef
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {ToolScope} scope
 * @property {ToolRisk} risk
 * @property {ToolRole} role
 * @property {ToolSurface[]} surfaces
 * @property {boolean} requiresApproval
 * @property {StudioToolHttp|null} http
 * @property {Record<string, unknown>} inputSchema
 * @property {string} [sourceFile]
 */

export const CATALOG_VERSION = '2026-08-18.1';
export const ALL_SCOPES = ['read', 'write', 'generate', 'messages', 'social', 'marketplace'];
export const ALL_RISKS = ['read', 'safe_write', 'paid', 'destructive', 'outbound', 'admin'];
export const ALL_SURFACES = ['agent', 'mcp', 'admin'];
