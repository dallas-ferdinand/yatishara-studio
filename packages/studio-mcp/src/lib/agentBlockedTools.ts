/**
 * User Agent Mode allowlist exclusions (Assist / Elements / style / script gen).
 * MCP HTTP may still expose these for ops; Agent Mode must not call them.
 */
export const AGENT_BLOCKED_TOOL_NAMES = [
  "studio_generate_element_sheet",
  "studio_create_style_sheet",
  "studio_build_style_sheet",
  "studio_set_active_style_sheet",
  "studio_ensure_brief",
  "studio_edit_brief",
  "studio_approve_brief",
  "studio_reject_brief",
  "studio_generate_script",
] as const;

export function isAgentBlockedTool(name: string): boolean {
  return (AGENT_BLOCKED_TOOL_NAMES as readonly string[]).includes(name);
}
