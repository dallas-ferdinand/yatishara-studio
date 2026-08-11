/**
 * Compact agent intent hints — keep token cost low.
 * Catalog uses INTENT_BLURBS; turns may inject one LANE line when matched.
 */

/** @type {Record<string, string>} */
export const INTENT_BLURBS = {
  studio_share_asset_post:
    "Post owned image/video to public profile. Args:{assetId,caption?}. For post/share/publish — invoke, don't advise.",
  studio_generate_image:
    "Create image from prompt into a folder. Args:{prompt,folderId?}. Paid+approval. Estimate first if cost matters.",
  studio_generate_video:
    "Create video (paid+approval). People scenes: storyboard still via studio_generate_image first, then video.",
  studio_bulk_move:
    "Move items into a folder. Args:{targetFolderId,items:[{kind,id}]}. kind=asset|document|element|folder.",
  studio_trash:
    "Soft-delete one item. Args:{kind,id}. Destructive+approval.",
  studio_send_message:
    "Send text DM. Args:{conversationId,body}. Outbound+approval.",
  studio_send_media_message:
    "Send media in DM. Args:{conversationId,assetId|assetIds}. Outbound+approval.",
  studio_unshare_post:
    "Remove asset from public profile. Args:{assetId}.",
  studio_create_folder:
    "Create one folder. Args:{name,parentId?}. Nested paths → studio_ensure_path.",
  studio_workspace_tree:
    "Orient in workspace. Args:{} usually enough.",
  studio_search:
    "Search workspace. Args:{query,kinds?,limit?}.",
  studio_folder_contents:
    "List a folder. Args:{folderId} — real id only, never aliases.",
  studio_view_media:
    "Get media URLs for an asset. Args:{assetId}.",
  studio_estimate_generation:
    "Price a generation before paid generate. Args:{mode,prompt,...}.",
};

/** Curated starter set when catalog has no q/category (token budget). */
export const STARTER_TOOL_NAMES = Object.keys(INTENT_BLURBS);

/** @type {Record<string, Record<string, unknown>>} */
export const DESCRIBE_EXAMPLES = {
  studio_share_asset_post: { assetId: "<assetId>", caption: "optional" },
  studio_generate_image: { prompt: "a red bicycle on a beach", folderId: "<folderId?>" },
  studio_bulk_move: {
    targetFolderId: "<folderId>",
    items: [{ kind: "asset", id: "<assetId>" }],
  },
  studio_trash: { kind: "asset", id: "<id>" },
  studio_send_message: { conversationId: "<id>", body: "hello" },
  studio_send_media_message: { conversationId: "<id>", assetId: "<assetId>" },
};

/**
 * @param {string} message
 * @param {unknown[]} workingSet
 * @returns {string}
 */
export function detectActionLane(message, workingSet) {
  const text = String(message || "").toLowerCase();
  const items = Array.isArray(workingSet) ? workingSet : [];
  const hasAsset = items.some((i) => i && i.studioKind === "asset");
  const hasFolder = items.some((i) => i && i.studioKind === "folder");
  const hasMovable = items.some(
    (i) =>
      i &&
      ["asset", "document", "element", "folder"].includes(String(i.studioKind || "")),
  );

  if (/\b(post|publish|share\s+(this|it|to\s+(feed|profile|public)))\b/.test(text) && hasAsset) {
    return "LANE: invoke studio_share_asset_post with attached asset id (+ optional caption). Do not advise; do not claim unavailable unless invoke fails.";
  }
  if (/\b(generat(e|ing)|creat(e|ing)|make|draw|render)\b.{0,40}\b(image|picture|photo|still|art)\b/.test(text)
    || /\b(image|picture|photo)\b.{0,40}\b(generat|creat|make|draw|render)/.test(text)) {
    return "LANE: invoke studio_generate_image with the user prompt. Do not claim image gen unavailable unless invoke fails.";
  }
  if (/\b(generat(e|ing)|creat(e|ing)|make|render)\b.{0,40}\b(video|clip|footage)\b/.test(text)
    || /\b(video|clip)\b.{0,40}\b(generat|creat|make|render)/.test(text)) {
    return "LANE: invoke studio_generate_video (storyboard still first if people). Do not claim unavailable unless invoke fails.";
  }
  if (/\b(move|put|place|relocat)/.test(text) && hasMovable && hasFolder) {
    return "LANE: invoke studio_bulk_move { items:[{id,kind}], targetFolderId } using attached ids. kind=studioKind.";
  }
  if (/\b(trash|delet(e|ing)|remove|bin)\b/.test(text) && hasMovable) {
    return "LANE: invoke studio_trash { kind, id } for attached item(s). Approval may appear.";
  }
  if (/\b(send|dm|message)\b/.test(text) && (/\b(dm|message|chat|conversation)\b/.test(text) || hasAsset)) {
    if (hasAsset) {
      return "LANE: prefer studio_send_media_message for attached media; studio_send_message for text-only.";
    }
    return "LANE: invoke studio_send_message with conversationId + body.";
  }
  return "";
}

/**
 * Agent-facing short description.
 * @param {{ name: string, description?: string }} tool
 */
export function agentDescription(tool) {
  const blurb = INTENT_BLURBS[tool.name];
  if (blurb) return blurb;
  const raw = String(tool.description || "").replace(/\$\{[^}]+\}/g, "").trim();
  return raw.slice(0, 100);
}
