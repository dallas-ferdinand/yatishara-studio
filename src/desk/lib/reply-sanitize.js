/** Strip MCP / tool JSON leakage from assistant prose (gateway parity). */

function looksLikeJson(s) {
  const t = String(s ?? "").trim();
  if (t.length < 2) return false;
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function jsonCharRatio(s) {
  const t = String(s ?? "");
  if (!t.length) return 0;
  const jsony = (t.match(/[{}\[\]",:]/g) ?? []).length;
  return jsony / t.length;
}

export function looksMostlyJson(text) {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (looksLikeJson(t)) return true;
  if (t.includes('"status"') && t.includes('"error"') && jsonCharRatio(t) > 0.08) return true;
  if (jsonCharRatio(t) > 0.14 && /"\w+"\s*:/.test(t)) return true;
  return false;
}

export function stripToolLeakage(text) {
  let t = String(text ?? "").trim();
  if (!t) return "";
  t = t.replace(/\n*\*\*[^*\n]{1,120}\*\*\s*\n+(?:\{[\s\S]*?\}|\[[\s\S]*?\])(?=\n\n|\s*$)/g, "\n\n");
  t = t.replace(/(?:^|\n\n)\s*(\{[\s\S]*?\}|\[[\s\S]*?\])(?=\n\n|$)/gm, (block) => {
    const inner = block.trim();
    return looksLikeJson(inner) || looksMostlyJson(inner) ? "\n\n" : block;
  });
  t = t.replace(/:\s*\{"status"\s*:\s*\d+[\s\S]*?\}(?=\]|$|\s)/g, " [details omitted]");
  t = t.replace(/^\s*"?(providerIdentifier|toolName|serverStatus)"?\s*[:=].*$/gim, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

export function sanitizeAssistantReply(text) {
  return stripToolLeakage(String(text ?? "").trim());
}
