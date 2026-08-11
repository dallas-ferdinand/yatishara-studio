/**
 * Progressive skill packs — short recipes loaded on demand (Anthropic Skills pattern).
 */

/** @type {Array<{ id: string, title: string, when: string, steps: string[], tools: string[] }>} */
export const SKILL_PACKS = [
  {
    id: "post-feed",
    title: "Post to public profile",
    when: "User wants to post/share/publish an owned image or video to the feed",
    tools: ["studio_share_asset_post", "studio_is_asset_shared"],
    steps: [
      "Use attached asset id (or search if none).",
      "invoke studio_share_asset_post { assetId, caption? }.",
      "If approval card appears, stop — chat UI handles it.",
      "After ok, invoke studio_is_asset_shared { assetId } before claiming posted.",
    ],
  },
  {
    id: "generate-image",
    title: "Generate an image",
    when: "User wants a new image / picture / still created",
    tools: ["studio_estimate_generation", "studio_generate_image", "studio_view_media"],
    steps: [
      "If spend is unclear, invoke studio_estimate_generation { mode:\"image\", prompt } first.",
      "invoke studio_generate_image { prompt, folderId? } (attached folder if present).",
      "On approval card, stop.",
      "After ok, note the new assetId; optionally studio_view_media to confirm.",
    ],
  },
  {
    id: "generate-video-people",
    title: "Generate video with people",
    when: "User wants a video clip, especially with people/characters",
    tools: [
      "studio_estimate_generation",
      "studio_generate_image",
      "studio_generate_video",
    ],
    steps: [
      "Estimate if cost unclear.",
      "People scenes: studio_generate_image storyboard still with refs first.",
      "Then studio_generate_video with startFrameAssetId + same refs.",
      "Wait for completion; never claim done without tool ok.",
    ],
  },
  {
    id: "move-items",
    title: "Move items into a folder",
    when: "User says move/put/place items into a folder",
    tools: ["studio_bulk_move", "studio_folder_contents"],
    steps: [
      "Build items from attached chips: { kind: studioKind, id: studioId }.",
      "invoke studio_bulk_move { targetFolderId, items }.",
      "Optional verify: studio_folder_contents { folderId: targetFolderId }.",
    ],
  },
  {
    id: "trash-cleanup",
    title: "Trash / delete",
    when: "User wants to trash, delete, or remove Studio items",
    tools: ["studio_trash", "studio_list_trash"],
    steps: [
      "invoke studio_trash { kind, id } for each attached item (approval likely).",
      "Do not hard-delete; trash is soft-delete.",
    ],
  },
  {
    id: "send-dm",
    title: "Send a DM",
    when: "User wants to message someone in Studio DMs",
    tools: ["studio_send_message", "studio_send_media_message"],
    steps: [
      "Text-only → studio_send_message { conversationId, body }.",
      "Attached media → studio_send_media_message { conversationId, assetId|assetIds }.",
      "Outbound needs approval unless YOLO is on.",
    ],
  },
];

export function listSkills() {
  return SKILL_PACKS.map((s) => ({
    id: s.id,
    title: s.title,
    when: s.when,
    tools: s.tools,
  }));
}

export function getSkill(id) {
  const needle = String(id || "").trim().toLowerCase();
  return SKILL_PACKS.find((s) => s.id === needle) || null;
}

export function matchSkills(query) {
  const q = String(query || "").toLowerCase();
  if (!q) return listSkills();
  return SKILL_PACKS.filter(
    (s) =>
      s.id.includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.when.toLowerCase().includes(q) ||
      s.tools.some((t) => t.includes(q)),
  ).map((s) => ({ id: s.id, title: s.title, when: s.when, tools: s.tools }));
}

export function skillPromptBlock() {
  return `Skills: call skills (list) or skills {id} for recipes (post-feed, generate-image, generate-video-people, move-items, trash-cleanup, send-dm).`;
}
