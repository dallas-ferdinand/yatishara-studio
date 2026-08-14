/**
 * Compact agent intent hints — keep token cost low.
 * Catalog uses INTENT_BLURBS; turns may inject one LANE line when matched.
 */

/** @type {Record<string, string>} */
export const INTENT_BLURBS = {
  studio_share_asset_post:
    "Post owned image/video to public profile. Args:{assetId,caption?}. For post/share/publish — invoke, don't advise.",
  studio_generate_image:
    "Create image from prompt into a folder. Args:{prompt,folderId?}. Default folderId=CWD. Paid+approval. Estimate first if cost matters. Quote cost as $ / TTD only.",
  studio_generate_video:
    "Create video (paid+approval). Default folderId=CWD. People scenes: storyboard still via studio_generate_image first, then video. Quote cost as $ / TTD only.",
  studio_create_document:
    "Create a Script (.md) in a folder. Args:{folderId,title,contentMarkdown}. contentMarkdown REQUIRED and non-empty for prompts/scripts. Never remember script bodies. Include References: asset lines. Default folderId=CWD.",
  studio_patch_document:
    "DEFAULT for creator edits (add/fix/longer/tweak). Args:{documentId,oldString,newString} or edits[]. Exact search/replace — never rewrite whole Script for a small ask.",
  studio_update_document:
    "Full rewrite/rename/move ONLY. Args:{documentId,title?,contentMarkdown?,folderId?}. Use for empty body or explicit rewrite/from scratch — otherwise studio_patch_document.",
  studio_get_document:
    "Read a Script by id (includes contentMarkdown).",
  studio_bulk_move:
    "Move items into a folder. Args:{targetFolderId,items:[{kind,id}]}. kind=asset|document|element|folder.",
  studio_trash:
    "Soft-delete one item. Args:{kind:folder|asset|document|element,id}. Never invent studio_delete_document — use this. Destructive+approval.",
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
    "Price a generation before paid generate. Args:{mode,prompt,...}. Prefer this before generate when spend isn't confirmed. Report $ / TTD only — never say credits.",
  studio_list_video_models:
    "List real Studio video models + descriptions/caps. Call before inventing model details. Never invent legacy/pipeline marketing.",
  studio_create_element:
    "Create a .element (@unique-name) with optional image/video. Args:{type:character|prop|location,name,folderId?,description?,referenceAssetIds?}. Upload media first. Tag @name in prompts + element://id in ## References. Generate with referenceElementIds.",
  studio_update_element:
    "Swap element media or edit name/description. Args:{elementId,name?,description?,referenceAssetIds?}.",
  studio_list_elements:
    "List .element files. Args:{folderId?,type?}.",
  studio_pull_frames:
    "Extract N stills from a video (VO cadence: count=clamp(round(duration/2),4,8)). Args:{assetId,startSec?,endSec?,count?} or timesSec[]. Then inspect frame assets.",
  studio_generate_audio:
    "ElevenLabs audio. Args:{prompt,audioType:voiceover|sfx|music,elevenVoiceId? for VO,folderId?}. VO uses eleven_v3. Paid+approval. Estimate first. Quote $ / TTD only.",
  studio_explore_voices:
    "List/search ElevenLabs voices for voiceover. Pick elevenVoiceId before studio_generate_audio when none is chosen.",
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

  // Surgical edits MUST win over create-prompt (e.g. "make it a longer prompt").
  const editAsk =
    /\b(make\s+it\s+(longer|shorter|better)|longer\s+(prompt|script)|shorten|add\s+(a\s+|more\s+|the\s+)?|fix\s+(it|this|that|the)\b|edit\s+(it|this|that|the)\b|change\s+(it|this|that|the|only)\b|update\s+(it|this|that|the)\b|tweak|revise|insert\s+|remove\s+|delete\s+the\b|expand\s+(it|this|that|the)\b|trim\s+)\b/.test(
      text,
    ) ||
    /\b(it'?s\s+empty|fill\s+(it|this)|that\s+(prompt|script)|the\s+(prompt|script)|existing\s+(prompt|script)|this\s+(prompt|script))\b/.test(
      text,
    ) ||
    (/\b(improve|optimize)\b/.test(text) &&
      /\b(it|this|that|the\s+(prompt|script))\b/.test(text));
  if (editAsk) {
    return "LANE: EDIT existing Script — get real documentId (CWD index / folder_contents), studio_get_document, then studio_patch_document with exact oldString→newString for ONLY the asked change. Preserve ``` fence, headings, References, and everything they did not mention. Never studio_update_document full rewrite unless the body is empty or they explicitly asked rewrite/from scratch. Never create a second Script with the same title.";
  }

  if (
    /\b(create|make|new|add)\b.{0,40}\belement\b/.test(text) ||
    /\.element\b/.test(text)
  ) {
    return "LANE: studio_upload_asset if they gave media, then studio_create_element {type,name,folderId:CWD,description?,referenceAssetIds}. Unique @name (no spaces). Later prompts: @name + element://id in ## References, generate with referenceElementIds.";
  }

  // Voiceover from video / VO script — before generic script craft
  if (
    !editAsk &&
    (/\b(voice\s*-?\s*over|voiceover|\bvo\b|narrat(e|or|ion))\b/.test(text) ||
      (/\b(script|write|craft)\b/.test(text) &&
        /\b(voice\s*-?\s*over|voiceover|\bvo\b|narrat)/.test(text)))
  ) {
    return "LANE: skills {id:\"prompt-voiceover\"}. Video chip → pull_frames (count clamp(round(dur/2),4,8)) → inspect → studio_create_document title \"VO script — …\" with ## Voiceover ```text fence (spoken lines only). ALWAYS paste that fence in chat for Copy. Ask once to generate ElevenLabs audio; only on yes → estimate → studio_generate_audio. Tags-only enhance for v3 — never rewrite spoken words.";
  }

  // Prompt craft before generate — progressive skill load + save as editable doc
  if (/\b(hyper[\s-]?motion|whip|smash|fpv)\b/.test(text)) {
    return "LANE: skills {id:\"prompt-hypermotion\"} then craft a sealed production prompt. Save via studio_create_document to CWD. Paste in chat only if they asked to see/copy it. Prefer videoModel seedance-2.5. Studio branding only.";
  }
  if (/\b(cinematic|filmed|continuous[\s-]?take|lifestyle\s+ad)\b/.test(text)
    && /\b(prompt|video|clip|ad|shot)\b/.test(text)) {
    return "LANE: skills {id:\"prompt-cinematic\"} then craft sealed prompt → studio_create_document in CWD. Chat paste only if asked. Prefer videoModel seedance-2.5.";
  }
  if (
    !editAsk &&
    (/\b(write|craft|create|give)\b.{0,40}\b(prompt|script)\b/.test(text) ||
      /\b(prompt|script)\b.{0,40}\b(for|for\s+me|please)\b/.test(text) ||
      /\b(image|product|hero|still|video|ad)\b.{0,40}\b(prompt|script)\b/.test(text) ||
      /\b(prompt|script)\b.{0,40}\b(image|product|hero|still|video|ad)\b/.test(text) ||
      /\bcreate a script\b/.test(text) ||
      /\bshot script\b/.test(text) ||
      // "make a prompt" (new) but not "make it longer"
      (/\bmake\b.{0,40}\b(prompt|script)\b/.test(text) &&
        !/\bmake\s+it\b/.test(text)))
  ) {
    return "LANE: skills {id} matching prompt-image / prompt-cinematic / prompt-hypermotion. Write a dense sealed prompt/script. If they need a locked character/prop/location, studio_create_element then @name + element:// in References. If CWD already has a Prompt/Script → EDIT with studio_patch_document (or update only if empty). Else studio_create_document {folderId:CWD, title:\"Prompt — …\" or \"Script — …\", contentMarkdown NON-EMPTY with ```text fence + References: asset:// and element:// lines}. NEVER remember the script body. Do not dump the full prompt in chat unless they asked to see/copy it.";
  }
  if (/\b(generat(e|ing)|creat(e|ing)|make|draw|render)\b.{0,40}\b(image|picture|photo|still|art)\b/.test(text)
    || /\b(image|picture|photo)\b.{0,40}\b(generat|creat|make|draw|render)/.test(text)) {
    return "LANE: skills {id:\"generate-image\"} if multi-step; invoke studio_generate_image with the user prompt. Do not claim unavailable unless invoke fails.";
  }
  if (/\b(generat(e|ing)|creat(e|ing)|make|render|animat)\b.{0,40}\b(video|clip|footage)\b/.test(text)
    || /\b(video|clip)\b.{0,40}\b(generat|creat|make|render|animat)/.test(text)
    || /\banimat(e|ing)\b/.test(text)) {
    return "LANE: Assume defaults (seedance-2.5, sensible duration/aspect from stills). skills generate-video (+ prompt pack). invoke studio_estimate_generation NOW, then studio_generate_video (or storyboard still first if people). No menus. No invented caps.";
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
