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
