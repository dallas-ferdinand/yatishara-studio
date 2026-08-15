/**
 * Tool discovery + name repair for the Agent surface.
 *
 * WHY: `catalog q=` used to be a bare substring match, so any natural-language
 * query ("delete element", "list documents") returned zero tools with no hint.
 * The model then invented names (studio_list_folder, studio_describe_asset) or
 * pushed Pi-local tools through invoke (describe, update_step) — every one of
 * those came back as a red "Unknown tool" chip.
 */

/** Pi-local tools. These are top-level; they must never go through invoke. */
export const LOCAL_TOOL_NAMES = [
  "catalog",
  "describe",
  "invoke",
  "inspect",
  "remember",
  "skills",
  "plan",
  "ask",
];

/** plan actions the model sometimes calls as if they were tools. */
export const PLAN_ACTION_NAMES = [
  "get",
  "create",
  "set",
  "update",
  "update_step",
  "add_step",
  "remove_step",
  "set_list_status",
  "rename_list",
  "clear",
];

/** Invented names seen in production trajectories → real catalog tool. */
export const INVENTED_NAME_FIXES = {
  studio_list_folder: "studio_list_folders",
  studio_list_document: "studio_folder_contents",
  studio_list_documents: "studio_folder_contents",
  studio_list_assets: "studio_folder_contents",
  studio_list_scripts: "studio_folder_contents",
  studio_describe_asset: "studio_get_asset",
  studio_describe_document: "studio_get_document",
  studio_read_document: "studio_get_document",
  studio_open_document: "studio_get_document",
  studio_get_media: "studio_view_media",
  studio_list_frames: "studio_pull_frames",
  studio_extract_frames: "studio_pull_frames",
  studio_estimate: "studio_estimate_generation",
  studio_move: "studio_bulk_move",
  studio_rename_document: "studio_update_document",
};

const STOPWORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "any",
  "are",
  "can",
  "do",
  "for",
  "from",
  "get",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "one",
  "or",
  "please",
  "studio",
  "that",
  "the",
  "then",
  "these",
  "this",
  "to",
  "tool",
  "tools",
  "want",
  "with",
]);

/** Query word → catalog vocabulary, so creator language finds real tools. */
const SYNONYMS = {
  delete: ["trash", "delete", "remove"],
  remove: ["trash", "remove", "delete"],
  bin: ["trash"],
  script: ["document"],
  scripts: ["document"],
  prompt: ["document"],
  prompts: ["document"],
  doc: ["document"],
  docs: ["document"],
  md: ["document"],
  file: ["asset", "document"],
  files: ["asset", "document"],
  media: ["asset", "media"],
  image: ["image", "generate"],
  video: ["video", "generate"],
  audio: ["audio", "voice"],
  voiceover: ["audio", "voice"],
  vo: ["audio", "voice"],
  price: ["estimate", "pricing"],
  cost: ["estimate", "pricing"],
  describe: ["get"],
  read: ["get"],
  open: ["get"],
  show: ["get", "list"],
  find: ["search"],
  look: ["search"],
  post: ["post", "share"],
  publish: ["post", "share"],
  send: ["message", "send"],
  dm: ["message"],
  folder: ["folder"],
  element: ["element"],
  elements: ["element"],
  frame: ["frame"],
  frames: ["frame"],
};

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function expandTokens(tokens) {
  const out = new Set();
  for (const token of tokens) {
    out.add(token);
    for (const alt of SYNONYMS[token] || []) out.add(alt);
    // Cheap singular/plural so "elements" matches "element".
    if (token.endsWith("s") && token.length > 3) out.add(token.slice(0, -1));
    else out.add(`${token}s`);
  }
  return [...out];
}

/**
 * Character-bigram similarity (0..1). Cheap, dependency-free, good enough to
 * map studio_list_folder → studio_list_folders.
 */
export function similarity(a, b) {
  const left = String(a || "").toLowerCase();
  const right = String(b || "").toLowerCase();
  if (!left || !right) return 0;
  if (left === right) return 1;
  const grams = (text) => {
    const set = new Set();
    for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
    return set;
  };
  const l = grams(left);
  const r = grams(right);
  if (!l.size || !r.size) return 0;
  let shared = 0;
  for (const gram of l) if (r.has(gram)) shared += 1;
  return (2 * shared) / (l.size + r.size);
}

/**
 * Rank agent-surface tools for a query. Never returns an empty list when tools
 * exist: exact/token matches first, then closest-name fallbacks.
 *
 * @param {Array<{ name: string, description?: string, category?: string }>} tools
 * @param {string} query
 * @param {number} [limit]
 * @returns {{ tools: Array<object>, mode: "token"|"fuzzy" }}
 */
export function searchTools(tools, query, limit = 24) {
  const list = Array.isArray(tools) ? tools : [];
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return { tools: list.slice(0, limit), mode: "token" };

  const tokens = expandTokens(tokenize(raw));
  const scored = [];
  for (const tool of list) {
    const name = String(tool.name || "").toLowerCase();
    const haystack = `${name} ${String(tool.description || "").toLowerCase()}`;
    let score = 0;
    if (name.includes(raw.replace(/\s+/g, "_"))) score += 6;
    if (haystack.includes(raw)) score += 4;
    for (const token of tokens) {
      if (name.includes(token)) score += 2;
      else if (haystack.includes(token)) score += 1;
    }
    if (score > 0) scored.push({ tool, score });
  }

  if (scored.length) {
    scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
    return { tools: scored.slice(0, limit).map((row) => row.tool), mode: "token" };
  }

  // Nothing matched — hand back closest names rather than an empty catalog.
  const needle = raw.replace(/\s+/g, "_");
  const fuzzy = list
    .map((tool) => ({ tool, score: similarity(needle, tool.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit, 8))
    .map((row) => row.tool);
  return { tools: fuzzy, mode: "fuzzy" };
}

/**
 * Repair a tool name the model passed to invoke.
 *
 * @param {string} name
 * @param {(name: string) => boolean} isKnown
 * @param {string[]} knownNames
 * @returns {{ kind: "ok", name: string }
 *   | { kind: "local", name: string, planAction?: string }
 *   | { kind: "repaired", name: string, from: string }
 *   | { kind: "unknown", candidates: string[] }}
 */
export function resolveInvokeName(name, isKnown, knownNames) {
  const raw = String(name || "").trim();
  if (!raw) return { kind: "unknown", candidates: [] };

  if (isKnown(raw)) return { kind: "ok", name: raw };

  if (LOCAL_TOOL_NAMES.includes(raw)) return { kind: "local", name: raw };
  if (PLAN_ACTION_NAMES.includes(raw)) {
    return { kind: "local", name: "plan", planAction: raw };
  }

  const fixed = INVENTED_NAME_FIXES[raw];
  if (fixed && isKnown(fixed)) return { kind: "repaired", name: fixed, from: raw };

  // Missing/extra studio_ prefix.
  const prefixed = raw.startsWith("studio_") ? raw.slice(7) : `studio_${raw}`;
  if (isKnown(prefixed)) return { kind: "repaired", name: prefixed, from: raw };
  if (LOCAL_TOOL_NAMES.includes(prefixed)) {
    return { kind: "local", name: prefixed };
  }

  // Singular/plural drift (studio_list_folder → studio_list_folders).
  for (const variant of [`${raw}s`, raw.replace(/s$/, "")]) {
    if (variant !== raw && isKnown(variant)) {
      return { kind: "repaired", name: variant, from: raw };
    }
  }

  const ranked = (Array.isArray(knownNames) ? knownNames : [])
    .map((known) => ({ known, score: similarity(raw, known) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && best.score >= 0.82) {
    return { kind: "repaired", name: best.known, from: raw };
  }
  return {
    kind: "unknown",
    candidates: ranked.slice(0, 5).map((row) => row.known),
  };
}
