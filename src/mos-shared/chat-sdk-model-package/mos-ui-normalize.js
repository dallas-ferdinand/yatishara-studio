/** Ensure desk assistant text uses mos-ui blocks (gateway + client). */

export function hasMosUiFence(text) {
  return /```\s*mos-ui\b/i.test(String(text ?? ""));
}

export function hasCompleteMosUiFence(text) {
  return /```\s*mos-ui\b[\s\S]*?```/i.test(String(text ?? ""));
}

export function wrapPlainTextAsMosUi(text, { tone = "neutral", title = null } = {}) {
  const body = String(text ?? "").trim();
  if (!body) return body;
  const payload = title
    ? {
        type: "stack",
        blocks: [
          { type: "hero", tone, title, body: body.slice(0, 2000) },
          { type: "card", tone: "neutral", body: body.length > 2000 ? body.slice(2000, 10_000) : "" },
        ].filter((b) => b.body || b.title),
      }
    : { type: "card", tone, body: body.slice(0, 10_000) };
  return `\`\`\`mos-ui\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

/** Wrap plain prose in mos-ui when the model skipped the fence. */
export function ensureMosUiContent(text, { streaming = false } = {}) {
  const t = String(text ?? "");
  if (!t.trim()) return t;
  if (hasMosUiFence(t)) {
    if (streaming && !hasCompleteMosUiFence(t)) return t;
    return t;
  }
  if (streaming) return t;
  return wrapPlainTextAsMosUi(t);
}

export function normalizeTextBlocks(blocks, { streaming = false } = {}) {
  return (blocks ?? []).map((b) => {
    if (b.type !== "text") return b;
    const live = streaming && !b.sealed;
    return { ...b, content: ensureMosUiContent(b.content, { streaming: live }) };
  });
}

/** Normalize desk run snapshot content + text blocks. */
export function normalizeDeskPayload(payload, { streaming = false } = {}) {
  if (!payload) return payload;
  const blocks = normalizeTextBlocks(payload.blocks, { streaming });
  const textFromBlocks = blocks
    .filter((b) => b.type === "text")
    .map((b) => String(b.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  let content = payload.content;
  if (textFromBlocks) {
    content = textFromBlocks.includes("```mos-ui") ? "" : textFromBlocks;
  } else if (content) {
    content = ensureMosUiContent(content, { streaming });
  }

  return {
    ...payload,
    content,
    blocks,
    mosUiNormalized: !streaming && Boolean(content || textFromBlocks),
  };
}
