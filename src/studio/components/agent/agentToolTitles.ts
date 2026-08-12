/** Human-readable Agent step labels — never show raw studio_* as primary title. */

export type AgentStepKind =
  | "read"
  | "write"
  | "generate"
  | "approval"
  | "error"
  | "meta";

/** Imperative / infinitive stem — used for errors ("Couldn't browse workspace"). */
const TITLE_MAP: Record<string, string> = {
  // Pi meta tools
  catalog: "Look up tools",
  describe: "Inspect tool",
  invoke: "Run action",
  inspect: "Inspect media",
  remember: "Save memory",
  recall: "Recall memory",
  skills: "Load skill",
  plan: "Update todo",
  ask: "Ask question",
  // Studio tools
  studio_bootstrap: "Load workspace",
  studio_search: "Search",
  studio_workspace_tree: "Browse workspace",
  studio_list_folders: "List folders",
  studio_folder_contents: "Open folder",
  studio_get_folder: "Open folder",
  studio_create_folder: "Create folder",
  studio_ensure_path: "Create folder path",
  studio_update_folder: "Update folder",
  studio_bulk_move: "Move files",
  studio_resolve_path: "Resolve path",
  studio_project_context: "Load project",
  studio_view_media: "View media",
  studio_get_asset: "Open asset",
  studio_update_asset: "Update asset",
  studio_upload_asset: "Upload asset",
  studio_generate_image: "Generate image",
  studio_generate_video: "Generate video",
  studio_generate_audio: "Generate audio",
  studio_generate_batch: "Generate batch",
  studio_generate_script: "Generate script",
  studio_estimate_generation: "Estimate cost",
  studio_list_video_models: "List video models",
  studio_send_message: "Send message",
  studio_send_media_message: "Send media",
  studio_share_asset_post: "Share post",
  studio_unshare_post: "Unshare post",
  studio_trash: "Move to trash",
  studio_restore: "Restore item",
  studio_list_trash: "Open trash",
  studio_create_document: "Create script",
  studio_update_document: "Update script",
  studio_patch_document: "Patch script",
  studio_get_document: "Open script",
  studio_delete_document: "Move to trash",
};

/** Live / in-progress — progressive -ing. */
const LIVE_TITLE_MAP: Record<string, string> = {
  "Look up tools": "Looking up tools",
  "Inspect tool": "Inspecting tool",
  "Run action": "Running action",
  "Inspect media": "Inspecting media",
  "Save memory": "Saving memory",
  "Recall memory": "Recalling memory",
  "Load skill": "Loading skill",
  "Update todo": "Updating todo",
  "Ask question": "Asking question",
  "Load workspace": "Loading workspace",
  Search: "Searching",
  "Browse workspace": "Browsing workspace",
  "List folders": "Listing folders",
  "Open folder": "Opening folder",
  "Create folder": "Creating folder",
  "Create folder path": "Creating folder path",
  "Update folder": "Updating folder",
  "Move files": "Moving files",
  "Resolve path": "Resolving path",
  "Load project": "Loading project",
  "View media": "Viewing media",
  "Open asset": "Opening asset",
  "Update asset": "Updating asset",
  "Upload asset": "Uploading asset",
  "Generate image": "Generating image",
  "Generate video": "Generating video",
  "Generate audio": "Generating audio",
  "Generate batch": "Generating batch",
  "Generate script": "Generating script",
  "Estimate cost": "Estimating cost",
  "List video models": "Listing video models",
  "Send message": "Sending message",
  "Send media": "Sending media",
  "Share post": "Sharing post",
  "Unshare post": "Unsharing post",
  "Move to trash": "Moving to trash",
  "Restore item": "Restoring item",
  "Open trash": "Opening trash",
  "Create script": "Creating script",
  "Update script": "Updating script",
  "Patch script": "Patching script",
  "Open script": "Opening script",
};

/** Completed — past -ed / irregular. */
const PAST_TITLE_MAP: Record<string, string> = {
  "Look up tools": "Looked up tools",
  "Inspect tool": "Inspected tool",
  "Run action": "Ran action",
  "Inspect media": "Inspected media",
  "Save memory": "Saved memory",
  "Recall memory": "Recalled memory",
  "Load skill": "Loaded skill",
  "Update todo": "Updated todo",
  "Ask question": "Asked question",
  "Load workspace": "Loaded workspace",
  Search: "Searched",
  "Browse workspace": "Browsed workspace",
  "List folders": "Listed folders",
  "Open folder": "Opened folder",
  "Create folder": "Created folder",
  "Create folder path": "Created folder path",
  "Update folder": "Updated folder",
  "Move files": "Moved files",
  "Resolve path": "Resolved path",
  "Load project": "Loaded project",
  "View media": "Viewed media",
  "Open asset": "Opened asset",
  "Update asset": "Updated asset",
  "Upload asset": "Uploaded asset",
  "Generate image": "Generated image",
  "Generate video": "Generated video",
  "Generate audio": "Generated audio",
  "Generate batch": "Generated batch",
  "Generate script": "Generated script",
  "Estimate cost": "Estimated cost",
  "List video models": "Listed video models",
  "Send message": "Sent message",
  "Send media": "Sent media",
  "Share post": "Shared post",
  "Unshare post": "Unshared post",
  "Move to trash": "Moved to trash",
  "Restore item": "Restored item",
  "Open trash": "Opened trash",
  "Checked workspace": "Checked workspace",
  "Create script": "Created script",
  "Update script": "Updated script",
  "Patch script": "Patched script",
  "Open script": "Opened script",
};

const WRITE_TOOLS = new Set([
  "studio_create_folder",
  "studio_ensure_path",
  "studio_update_folder",
  "studio_bulk_move",
  "studio_create_document",
  "studio_update_document",
  "studio_patch_document",
  "studio_upload_asset",
  "studio_update_asset",
  "studio_trash",
  "studio_restore",
  "studio_delete_document",
  "remember",
  "plan",
]);

const GENERATE_TOOLS = new Set([
  "studio_generate_image",
  "studio_generate_video",
  "studio_generate_audio",
  "studio_generate_batch",
  "studio_generate_script",
]);

/** Quiet meta — may collapse only for duplicate catalog peeks. */
const META_TOOLS = new Set(["catalog", "describe"]);

/** Always show as their own chip (never collapse into "Checked workspace"). */
const ALWAYS_VISIBLE_TOOLS = new Set([
  "skills",
  "remember",
  "recall",
  "plan",
  "ask",
  "inspect",
  "catalog",
  "describe",
  "invoke",
]);

const READ_PREFIXES = [
  "studio_list_",
  "studio_get_",
  "studio_search",
  "studio_workspace_",
  "studio_resolve_",
  "studio_project_",
  "studio_view_",
  "studio_estimate_",
];

function toProgressiveGuess(base: string): string {
  const t = base.trim();
  if (!t) return "Working";
  if (/\bing\b/i.test(t)) return t;
  // "Search" → "Searching"; "Move files" → "Moving files"
  const parts = t.split(" ");
  const verb = parts[0] || t;
  const rest = parts.slice(1).join(" ");
  let ing = verb;
  if (/e$/i.test(verb) && !/ee$/i.test(verb)) ing = `${verb.slice(0, -1)}ing`;
  else if (/[^aeiou][aeiou][^aeiou]$/i.test(verb)) ing = `${verb}${verb.slice(-1)}ing`;
  else ing = `${verb}ing`;
  return rest ? `${ing} ${rest}` : ing;
}

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

/** Present progressive while live; past when completed. Never "Done". */
export function displayToolTitle(toolName: string, status: string): string {
  const base = humanToolTitle(toolName);
  if (status === "started" || status === "queued" || status === "pending_approval") {
    return LIVE_TITLE_MAP[base] || toProgressiveGuess(base);
  }
  if (status === "failed") return base;
  return PAST_TITLE_MAP[base] || base;
}

export function deriveStepKind(
  toolName: string,
  status: string,
  error?: string | null,
): AgentStepKind {
  if (status === "failed" || error) return "error";
  if (status === "pending_approval") return "approval";
  if (ALWAYS_VISIBLE_TOOLS.has(toolName)) {
    if (toolName === "inspect" || toolName === "recall") return "read";
    if (toolName === "ask") return "approval";
    return "write";
  }
  if (META_TOOLS.has(toolName)) return "meta";
  if (toolName === "inspect") return "read";
  if (GENERATE_TOOLS.has(toolName)) return "generate";
  if (WRITE_TOOLS.has(toolName)) return "write";
  if (READ_PREFIXES.some((p) => toolName.startsWith(p))) return "read";
  if (toolName.includes("generate")) return "generate";
  if (toolName.includes("send_") || toolName.includes("purchase")) return "approval";
  return "write";
}

export function isAlwaysVisibleTool(toolName?: string | null): boolean {
  return ALWAYS_VISIBLE_TOOLS.has(String(toolName || ""));
}

/** Media inspect / view — UI shows Thinking wash instead of a tool row. */
export function isMediaInspectTool(toolName?: string | null): boolean {
  const name = String(toolName || "");
  return name === "inspect" || name.includes("view_media");
}

export function friendlyErrorLine(toolName: string, error?: string | null): string {
  const action = humanToolTitle(toolName).toLowerCase();
  const raw = String(error || "").trim();
  if (!raw) return `Couldn't ${action}`;

  if (/invalid or expired agent capability/i.test(raw)) {
    return `Couldn't ${action} — session expired. Send again.`;
  }
  if (/insufficient|credit/i.test(raw)) {
    return `Couldn't ${action} — need more balance.`;
  }
  if (/not found/i.test(raw)) {
    return `Couldn't ${action} — not found`;
  }
  // Internal invoke / catalog / HTTP noise — keep the chip human.
  if (
    /missing path param/i.test(raw) ||
    /unknown tool/i.test(raw) ||
    /http\s*\d{3}/i.test(raw) ||
    /pathTemplate/i.test(raw) ||
    /argumentvalidation|extra field/i.test(raw) ||
    /\bstudio_[a-z0-9_]+\b/i.test(raw)
  ) {
    return `Couldn't ${action}`;
  }

  const cleaned = raw
    .replace(/\bstudio_[a-z0-9_]+\b/gi, "")
    .replace(/\bMissing path param\b[^.]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s—\-–:,.]+|[\s—\-–:,.]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length > 72 || /[{}\[\]`\\/]/.test(cleaned)) {
    return `Couldn't ${action}`;
  }
  return `Couldn't ${action} — ${cleaned}`;
}
