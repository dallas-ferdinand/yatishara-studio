/**
 * High-signal tool observations — keep invoke results small for the model.
 * Agent-facing money is always $ / TTD — never "credits".
 */

const MAX_STR = 240;
const MAX_ARR = 12;
const MAX_KEYS = 16;
/** Ledger: TT$0.50 per credit — same as convex/lib/generationPricing CREDIT_PRICE_TTD */
const CREDIT_PRICE_TTD = 0.5;

function moneyLabelFromCredits(credits) {
  const n = Number(credits);
  if (!Number.isFinite(n)) return undefined;
  const ttd = Math.round(n * CREDIT_PRICE_TTD * 100) / 100;
  const pretty = ttd.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(ttd) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${pretty} TTD`;
}

/** Rewrite ledger credit fields → money labels for the model. */
function rewriteMoneyFields(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = { ...obj };
  if (out.creditsSpent != null) {
    const label = moneyLabelFromCredits(out.creditsSpent);
    if (label) out.cost = label;
    delete out.creditsSpent;
  }
  if (out.estimatedCredits != null) {
    const label = moneyLabelFromCredits(out.estimatedCredits);
    if (label) out.estimatedCost = label;
    delete out.estimatedCredits;
  }
  if (out.credits != null && typeof out.credits === "number") {
    const label = moneyLabelFromCredits(out.credits);
    if (label) out.cost = label;
    delete out.credits;
  }
  return out;
}

function textValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function truncate(value, max = MAX_STR) {
  if (typeof value !== "string") return value;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function slimValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return "[…]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARR).map((item) => slimValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    let n = 0;
    for (const [key, child] of Object.entries(value)) {
      if (n >= MAX_KEYS) {
        out._truncated = true;
        break;
      }
      // Drop huge / low-signal blobs
      if (
        /base64|thumbnailData|bytes|raw|embedding|promptEnhanced|fullPrompt/i.test(
          key,
        )
      ) {
        continue;
      }
      out[key] = slimValue(child, depth + 1);
      n += 1;
    }
    return out;
  }
  return String(value).slice(0, 80);
}

/** Per-tool preferred fields from result.data / root */
const FIELD_HINTS = {
  studio_share_asset_post: ["postId", "assetId", "caption", "shared", "url", "id"],
  studio_is_asset_shared: ["shared", "postId", "assetId"],
  studio_generate_image: [
    "assetId",
    "folderId",
    "generationId",
    "status",
    "name",
    "creditsSpent",
    "estimatedCredits",
    "cost",
    "assets",
    "assetIds",
    "thumbnailUrl",
    "url",
    "id",
  ],
  studio_generate_video: [
    "assetId",
    "folderId",
    "generationId",
    "status",
    "name",
    "creditsSpent",
    "assets",
    "assetIds",
    "thumbnailUrl",
    "url",
    "id",
  ],
  studio_generate_audio: [
    "assetId",
    "folderId",
    "generationId",
    "status",
    "name",
    "creditsSpent",
    "assets",
    "assetIds",
    "url",
    "id",
  ],
  studio_estimate_generation: [
    "credits",
    "creditsSpent",
    "estimatedCredits",
    "cost",
    "estimate",
    "mode",
    "ok",
  ],
  studio_create_document: ["id", "_id", "documentId", "folderId", "title", "name"],
  studio_bulk_move: ["moved", "errors", "count", "targetFolderId"],
  studio_trash: ["trashed", "kind", "id", "ok"],
  studio_create_folder: ["folderId", "id", "name", "path", "parentId"],
  studio_search: ["results", "items", "count", "query"],
  studio_workspace_tree: ["roots", "folders", "count", "truncated"],
  studio_folder_contents: ["folders", "assets", "documents", "elements"],
  studio_get_asset: ["_id", "id", "name", "kind", "folderId", "mimeType"],
  studio_view_media: ["thumbnailUrl", "preferredViewUrl", "url", "kind"],
  studio_send_message: ["messageId", "conversationId", "ok"],
  studio_send_media_message: ["messageIds", "conversationId", "ok", "delivered"],
};

/**
 * @param {string} toolName
 * @param {any} result
 * @param {{ verbose?: boolean, verifyHint?: string, verified?: any }} [extra]
 */
export function compactObservation(toolName, result, extra = {}) {
  const name = String(toolName || "").trim();
  if (result == null) {
    return { ok: false, toolName: name, error: "empty_result", ...extra };
  }
  if (typeof result === "string") {
    return { ok: true, toolName: name, text: truncate(result, 400), ...extra };
  }
  if (typeof result !== "object") {
    return { ok: true, toolName: name, value: result, ...extra };
  }

  const ok = result.ok !== false;
  const base = {
    ok,
    toolName: name,
    ...(result.pendingApproval ? { pendingApproval: true } : {}),
    ...(result.approvalId ? { approvalId: result.approvalId } : {}),
    ...(result.error ? { error: truncate(String(result.error), 320) } : {}),
    ...(result.code ? { code: result.code } : {}),
    ...(result.hint ? { hint: truncate(String(result.hint), 240) } : {}),
    ...(result.message && result.pendingApproval
      ? { message: truncate(String(result.message), 160) }
      : {}),
    ...extra,
  };

  if (extra.verbose) {
    return { ...base, data: rewriteMoneyFields(slimValue(result.data ?? result)) };
  }

  const data = result.data && typeof result.data === "object" ? result.data : result;
  const keys = FIELD_HINTS[name];
  if (keys) {
    const picked = pick(data, keys);
    // Also pull nested data if empty
    if (Object.keys(picked).length === 0 && result.data) {
      Object.assign(picked, pick(result.data, keys));
    }
    // Arrays: keep short summaries; generation assets keep media urls
    for (const [k, v] of Object.entries(picked)) {
      if (Array.isArray(v)) {
        if (
          k === "assets" &&
          v.every((item) => item && typeof item === "object")
        ) {
          picked[k] = v.slice(0, 6).map((item) =>
            pick(item, [
              "id",
              "_id",
              "name",
              "kind",
              "url",
              "thumbnailUrl",
              "mimeType",
            ]),
          );
        } else {
          picked[k] =
            v.length <= 5
              ? slimValue(v)
              : { count: v.length, sample: slimValue(v.slice(0, 3)) };
        }
      } else if (typeof v === "string") {
        picked[k] = truncate(v);
      }
    }
    if (Object.keys(picked).length) {
      return { ...base, data: rewriteMoneyFields(picked) };
    }
  }

  // Generic slim
  const slim = slimValue(
    pick(data, [
      "id",
      "_id",
      "assetId",
      "folderId",
      "postId",
      "name",
      "status",
      "kind",
      "count",
      "ok",
      "moved",
      "errors",
      "shared",
      "generationId",
      "conversationId",
      "messageId",
      "creditsSpent",
      "estimatedCredits",
      "message",
    ]),
  );
  if (Object.keys(slim).length) {
    return { ...base, data: rewriteMoneyFields(slim) };
  }
  return { ...base, data: rewriteMoneyFields(slimValue(data)) };
}

/**
 * Soft mask older observations in a turn log (for trajectory / debugging).
 * Keeps last `keep` entries full; older become { masked:true, toolName, ok }.
 * @param {any[]} observations
 * @param {number} [keep]
 */
export function maskOlderObservations(observations, keep = 4) {
  if (!Array.isArray(observations) || observations.length <= keep) {
    return observations || [];
  }
  const cutoff = observations.length - keep;
  return observations.map((row, index) => {
    if (index >= cutoff) return row;
    return {
      masked: true,
      toolName: row?.toolName || row?.name,
      ok: row?.ok,
      at: row?.at,
    };
  });
}

export function observationByteBudget(obs) {
  return Buffer.byteLength(JSON.stringify(obs ?? {}), "utf8");
}

export { textValue };
