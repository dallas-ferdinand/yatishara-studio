/** Human-readable Agent step labels — never show raw studio_* as primary title. */

export type AgentStepKind =
  | "read"
  | "write"
  | "generate"
  | "approval"
  | "error"
  | "meta";

const TITLE_MAP: Record<string, string> = {
  catalog: "Look up tools",
  describe: "Inspect tool",
  invoke: "Run Studio action",
  remember: "Save memory",
  studio_bootstrap: "Load workspace",
  studio_search: "Search",
  studio_workspace_tree: "Browse workspace",
  studio_list_folders: "List folders",
  studio_folder_contents: "Open folder",
  studio_get_folder: "Open folder",
  studio_create_folder: "Create folder",
  studio_ensure_path: "Create folder path",
  studio_update_folder: "Update folder",
  studio_generate_image: "Generate image",
  studio_generate_video: "Generate video",
  studio_generate_audio: "Generate audio",
  studio_generate_batch: "Generate batch",
  studio_send_message: "Send message",
  studio_trash: "Move to trash",
  studio_restore: "Restore item",
};

const WRITE_TOOLS = new Set([
  "studio_create_folder",
  "studio_ensure_path",
  "studio_update_folder",
  "studio_bulk_move",
  "studio_create_document",
  "studio_update_document",
  "studio_upload_asset",
]);

const GENERATE_TOOLS = new Set([
  "studio_generate_image",
  "studio_generate_video",
  "studio_generate_audio",
  "studio_generate_batch",
  "studio_generate_script",
]);

const META_TOOLS = new Set(["catalog", "describe", "remember"]);

const READ_PREFIXES = [
  "studio_list_",
  "studio_get_",
  "studio_search",
  "studio_workspace_",
  "studio_resolve_",
  "studio_project_",
  "studio_view_",
];

export function humanToolTitle(toolName: string): string {
  const key = String(toolName || "").trim();
  if (!key) return "Working";
  if (TITLE_MAP[key]) return TITLE_MAP[key];
  if (key.startsWith("studio_")) {
    const tail = key.replace(/^studio_/, "").replace(/_/g, " ");
    return tail.charAt(0).toUpperCase() + tail.slice(1);
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function deriveStepKind(
  toolName: string,
  status: string,
  error?: string | null,
): AgentStepKind {
  if (status === "failed" || error) return "error";
  if (status === "pending_approval") return "approval";
  if (META_TOOLS.has(toolName)) return "meta";
  if (GENERATE_TOOLS.has(toolName)) return "generate";
  if (WRITE_TOOLS.has(toolName)) return "write";
  if (READ_PREFIXES.some((p) => toolName.startsWith(p))) return "read";
  if (toolName.includes("generate")) return "generate";
  if (toolName.includes("send_") || toolName.includes("purchase")) return "approval";
  return "write";
}

export function friendlyErrorLine(toolName: string, error?: string | null): string {
  const title = humanToolTitle(toolName);
  const raw = String(error || "").trim();
  if (!raw) return `Couldn't complete ${title.toLowerCase()}.`;
  if (/invalid or expired agent capability/i.test(raw)) {
    return `Couldn't ${title.toLowerCase()} — session expired. Send again.`;
  }
  if (/insufficient|credit/i.test(raw)) {
    return `Couldn't ${title.toLowerCase()} — need more credits.`;
  }
  if (raw.length > 120) return `Couldn't ${title.toLowerCase()} — see details.`;
  return `Couldn't ${title.toLowerCase()} — ${raw}`;
}
