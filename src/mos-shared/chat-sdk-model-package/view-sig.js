/** Build ViewBlock[] signature for DOM patch caching. */
export function viewStreamSig(blocks) {
  if (!blocks?.length) return "0";
  return blocks
    .map((b) => {
      if (b.type === "text") return `t:${b.content?.length ?? 0}:${b.sealed ? 1 : 0}`;
      if (b.type === "tool") return `o:${b.callId}:${b.status}:${b.output?.length ?? 0}`;
      if (b.type === "thinking") return `k:${b.content?.length ?? 0}:${b.durationMs ?? 0}:${b.sealed ? 1 : 0}`;
      if (b.type === "task") return `tk:${b.callId ?? ""}:${b.status ?? ""}`;
      if (b.type === "request") return `rq:${b.requestId}:${b.status ?? ""}`;
      return `${b.type}:${b.status ?? ""}`;
    })
    .join("|");
}

/**
 * @param {import("./types.js").ViewBlock[]} blocks
 * @param {string} [content]
 */
export function buildViewCache(blocks, content, source = "sdk_messages") {
  const text =
    String(content ?? "").trim() ||
    blocks
      .filter((b) => b.type === "text")
      .map((b) => b.content)
      .join("\n\n")
      .trim();
  return {
    version: 1,
    blocks,
    content: text,
    sig: viewStreamSig(blocks),
    builtAt: Date.now(),
    source,
  };
}
