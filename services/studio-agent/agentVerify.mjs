/**
 * Verify-after-act hints + optional cheap auto-checks.
 * When auto verify returns ok:false, invoke hard-fails so the model must repair.
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
    auto: "studio_view_media",
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
    auto: "studio_view_media",
    hint: (_args, result) => {
      const assetId = result?.data?.assetId || result?.assetId;
      if (result?.data?.stillRendering) {
        return "VERIFY: video still rendering in Files — do not claim finished; tell user to watch the folder.";
      }
      return assetId
        ? `VERIFY: video assetId=${assetId}. Poll/status ok before claiming done.`
        : "VERIFY: confirm video generation status/assetId before claiming done.";
    },
  },
  studio_bulk_move: {
    auto: "studio_folder_contents",
    hint: (args) =>
      args?.targetFolderId
        ? `VERIFY: optional studio_folder_contents { folderId: "${args.targetFolderId}" }.`
        : "VERIFY: confirm items landed in the target folder.",
  },
  studio_trash: {
    hint: () => "VERIFY: item should be gone from folder; list_trash if user asks.",
  },
  studio_get_document: {
    hint: (_args, result) =>
      result?.ok === false && /not found/i.test(String(result?.error ?? ""))
        ? "VERIFY: id is stale. studio_folder_contents on CWD (or studio_search) to get the real documentId, then update/patch it. Do NOT create a duplicate Script."
        : null,
  },
  studio_create_document: {
    auto: "studio_get_document",
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
  studio_create_element: {
    auto: "studio_list_elements",
    hint: (_args, result) => {
      const id =
        result?.data?.elementId ||
        result?.data?._id ||
        result?.data?.id ||
        result?.elementId;
      return id
        ? `VERIFY: element id=${id}. Prefer element:// + @name in prompts; never claim Elements retired.`
        : "VERIFY: create_element must return elementId before claiming locked.";
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
  const data =
    result?.data && typeof result.data === "object" ? result.data : result || {};

  if (verifyTool === "studio_is_asset_shared") {
    const assetId =
      args?.assetId || data?.assetId || result?.assetId || null;
    return assetId ? { assetId: String(assetId) } : null;
  }

  if (verifyTool === "studio_get_document") {
    const documentId =
      data?.documentId ||
      data?._id ||
      data?.id ||
      data?.document?._id ||
      data?.document?.id ||
      args?.documentId ||
      null;
    return documentId ? { documentId: String(documentId) } : null;
  }

  if (verifyTool === "studio_view_media") {
    // Skip while still rendering — no asset yet.
    if (data?.stillRendering || data?.queued) return null;
    const assetId =
      data?.assetId ||
      result?.assetId ||
      (typeof data?.id === "string" && (data.kind === "image" || data.kind === "video")
        ? data.id
        : null) ||
      args?.assetId ||
      null;
    return assetId ? { assetId: String(assetId) } : null;
  }

  if (verifyTool === "studio_folder_contents") {
    const folderId = args?.targetFolderId || args?.folderId || data?.folderId || null;
    return folderId ? { folderId: String(folderId) } : null;
  }

  if (verifyTool === "studio_list_elements") {
    const folderId = args?.folderId || data?.folderId || null;
    return folderId ? { folderId: String(folderId) } : {};
  }

  return null;
}

/**
 * True when auto-verify payload proves the act failed.
 * @param {string} verifyTool
 * @param {any} verified
 * @param {Record<string, unknown>} args
 * @param {any} actResult
 */
export function isVerifyFailure(verifyTool, verified, args, actResult) {
  if (!verified || verified.ok === false) return true;
  const data =
    verified.data && typeof verified.data === "object" ? verified.data : verified;

  if (verifyTool === "studio_is_asset_shared") {
    return data.shared === false || data.isShared === false;
  }
  if (verifyTool === "studio_get_document") {
    const nested =
      data.document && typeof data.document === "object" ? data.document : {};
    const rawBody = data.contentMarkdown ?? data.content ?? nested.contentMarkdown ?? nested.content;
    const body = String(rawBody ?? "");
    const hasId = Boolean(
      data.documentId || data.id || data._id || nested.id || nested._id,
    );
    // Compacted get_document used to drop contentMarkdown — missing body is
    // not proof the Script is empty. Only fail when we can see an empty string.
    if (rawBody == null && hasId) return false;
    if (!body.trim()) return true;
    return false;
  }
  if (verifyTool === "studio_view_media") {
    const url =
      data.url ||
      data.imageUrl ||
      data.videoUrl ||
      data.mediaUrl ||
      data.signedUrl;
    return !url && !data.assetId && verified.ok === false;
  }
  if (verifyTool === "studio_list_elements") {
    const want =
      actResult?.data?.elementId ||
      actResult?.data?._id ||
      actResult?.data?.id ||
      null;
    if (!want) return false;
    const list = Array.isArray(data.elements)
      ? data.elements
      : Array.isArray(data.items)
        ? data.items
        : [];
    if (!list.length) return false; // list empty may mean scope miss — soft
    return !list.some(
      (el) =>
        String(el?.id ?? el?._id ?? el?.elementId ?? "") === String(want),
    );
  }
  return false;
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
