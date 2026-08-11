/**
 * Verify-after-act hints + optional cheap auto-checks.
 */

/** @type {Record<string, { hint: (args: object, result: any) => string|null, auto?: string }>} */
export const VERIFY_MAP = {
  studio_share_asset_post: {
    auto: "studio_is_asset_shared",
    hint: (args) =>
      args?.assetId
        ? `VERIFY: invoke studio_is_asset_shared { assetId: "${args.assetId}" } before claiming posted.`
        : "VERIFY: confirm share with studio_is_asset_shared.",
  },
  studio_generate_image: {
    hint: (_args, result) => {
      const assetId =
        result?.data?.assetId ||
        result?.assetId ||
        result?.data?.id ||
        result?.data?._id;
      return assetId
        ? `VERIFY: image ready assetId=${assetId}. Optional studio_view_media before describing it.`
        : "VERIFY: confirm generation returned an assetId before claiming done.";
    },
  },
  studio_generate_video: {
    hint: (_args, result) => {
      const assetId = result?.data?.assetId || result?.assetId;
      return assetId
        ? `VERIFY: video assetId=${assetId}. Poll/status ok before claiming done.`
        : "VERIFY: confirm video generation status/assetId before claiming done.";
    },
  },
  studio_bulk_move: {
    hint: (args) =>
      args?.targetFolderId
        ? `VERIFY: optional studio_folder_contents { folderId: "${args.targetFolderId}" }.`
        : "VERIFY: confirm items landed in the target folder.",
  },
  studio_trash: {
    hint: () => "VERIFY: item should be gone from folder; list_trash if user asks.",
  },
  studio_create_document: {
    hint: (_args, result) => {
      const id =
        result?.data?.documentId ||
        result?.data?._id ||
        result?.data?.id ||
        result?.data?.document?._id ||
        result?.data?.document?.id;
      return id
        ? `VERIFY: Script id=${id}. Use that id for studio_get_document / patch — never invent ids. Never create empty Prompt/Script bodies.`
        : "VERIFY: create must return document id; never claim saved without id; never empty Script contentMarkdown.";
    },
  },
  studio_send_message: {
    hint: () => "VERIFY: only claim sent if invoke ok (or approval pending).",
  },
  studio_send_media_message: {
    hint: () => "VERIFY: only claim sent if invoke ok (or approval pending).",
  },
};

export function verifyHintFor(toolName, args, result) {
  const entry = VERIFY_MAP[toolName];
  if (!entry) return null;
  try {
    return entry.hint(args || {}, result) || null;
  } catch {
    return null;
  }
}

export function autoVerifyTool(toolName) {
  return VERIFY_MAP[toolName]?.auto || null;
}

/**
 * Build args for a cheap auto-verify follow-up.
 * @param {string} verifyTool
 * @param {Record<string, unknown>} args
 * @param {any} result
 */
export function autoVerifyArgs(verifyTool, args, result) {
  if (verifyTool === "studio_is_asset_shared") {
    const assetId =
      args?.assetId || result?.data?.assetId || result?.assetId || null;
    return assetId ? { assetId: String(assetId) } : null;
  }
  return null;
}

/**
 * Generation often finishes writing assets, then a Convex returns validator
 * throws ReturnsValidationError — treat as success when assets/ids are present.
 * @param {string} toolName
 * @param {any} result
 */
export function salvageGenerationResult(toolName, result) {
  if (!/^studio_generate_(image|video|audio|batch)$/.test(String(toolName || ""))) {
    return result;
  }
  if (!result || result.ok !== false) return result;
  const err = String(result.error || result.data?.error || "");
  if (!/ReturnsValidationError/i.test(err)) return result;
  const data =
    result.data && typeof result.data === "object" ? result.data : result;
  const hasAssets = Array.isArray(data.assets) && data.assets.length > 0;
  const hasIds = Array.isArray(data.assetIds) && data.assetIds.length > 0;
  const hasOne =
    Boolean(data.assetId) ||
    (typeof data.id === "string" && data.kind === "image") ||
    (typeof data.id === "string" && data.kind === "video") ||
    (typeof data.id === "string" && data.kind === "audio");
  if (!hasAssets && !hasIds && !hasOne) return result;
  return {
    ...result,
    ok: true,
    salvagedFromValidationError: true,
    warning: err.slice(0, 240),
    error: undefined,
  };
}
