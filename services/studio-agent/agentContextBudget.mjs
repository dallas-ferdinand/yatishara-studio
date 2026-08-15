/**
 * Budget Prior conversation for Pi turns — snip old tool noise, keep episode IDs.
 * Inspired by Claude Code auto-compact: delivery of state, not raw transcript replay.
 */

const DEFAULT_MAX_CHARS = 14_000;
const KEEP_RECENT_MESSAGES = 10;

/**
 * @param {Array<{ role?: string, content?: string, toolName?: string }>} history
 * @param {{ maxChars?: number, keepRecent?: number, currentUser?: string }} [opts]
 * @returns {string} Prior block text (may be empty)
 */
export function budgetPriorHistory(history, opts = {}) {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const keepRecent = opts.keepRecent ?? KEEP_RECENT_MESSAGES;
  const rows = Array.isArray(history) ? history.slice() : [];
  if (!rows.length) return "";

  // Drop trailing echo of this turn's user message.
  const currentUser = String(opts.currentUser || "").trim();
  if (
    currentUser &&
    rows.length &&
    rows[rows.length - 1]?.role === "user" &&
    String(rows[rows.length - 1].content || "").trim() === currentUser
  ) {
    rows.pop();
  }

  const formatLine = (row) => {
    const role = String(row?.role || "?");
    const tool = String(row?.toolName || "").trim();
    const raw = String(row?.content || "").replace(/\s+/g, " ").trim();
    if (role === "tool") {
      return `tool: ${tool || "step"} — ${raw.slice(0, 420)}`;
    }
    if (role === "user") return `user: ${raw.slice(0, 1200)}`;
    if (role === "assistant") return `assistant: ${raw.slice(0, 900)}`;
    return `${role}: ${raw.slice(0, 400)}`;
  };

  if (rows.length <= keepRecent) {
    const text = rows.map(formatLine).join("\n");
    return text.length <= maxChars ? text : text.slice(-maxChars);
  }

  const older = rows.slice(0, -keepRecent);
  const recent = rows.slice(-keepRecent);

  // Digest older tools into episode facts; keep last 2 user/assistant from older window.
  const episode = [];
  const olderChat = [];
  for (const row of older) {
    const role = String(row?.role || "");
    if (role === "tool") {
      const line = formatLine(row);
      // Prefer lines that still carry ids.
      if (/(documentId|assetId|elementId|jobId|folderId)=/.test(line) || /✓|✗/.test(line)) {
        episode.push(line.replace(/^tool:\s*/, ""));
      }
    } else if (role === "user" || role === "assistant") {
      olderChat.push(row);
    }
  }
  const olderChatTail = olderChat.slice(-2).map(formatLine);
  const episodeTail = episode.slice(-12);

  const parts = [];
  if (episodeTail.length) {
    parts.push(`Earlier tools (compact):\n${episodeTail.join("\n")}`);
  }
  if (olderChatTail.length) {
    parts.push(`Earlier chat:\n${olderChatTail.join("\n")}`);
  }
  parts.push(`Recent:\n${recent.map(formatLine).join("\n")}`);

  let text = parts.filter(Boolean).join("\n\n");
  if (text.length > maxChars) {
    // Drop earlier chat first, then trim episode.
    text = [`Earlier tools (compact):\n${episodeTail.slice(-8).join("\n")}`, `Recent:\n${recent.map(formatLine).join("\n")}`]
      .filter(Boolean)
      .join("\n\n");
  }
  if (text.length > maxChars) text = text.slice(-maxChars);
  return text;
}

/**
 * Build a structured compact summary from recent history (no LLM).
 * @param {{ message: string, assistantText: string, history?: unknown[], scratchJson?: string, todosJson?: string, trajectory?: object }} args
 */
export function buildStructuredThreadSummary(args) {
  const message = String(args.message || "").slice(0, 240);
  const assistantText = String(args.assistantText || "").slice(0, 400);
  const traj = args.trajectory && typeof args.trajectory === "object" ? args.trajectory : null;
  const tools = Array.isArray(traj?.tools) ? traj.tools : [];
  const errors = Array.isArray(traj?.errors) ? traj.errors : [];
  const okTools = tools.filter((t) => t && t.ok).map((t) => t.toolName).filter(Boolean);
  const failTools = tools.filter((t) => t && !t.ok).map((t) => t.toolName).filter(Boolean);
  const lines = [
    `Focus: ${message}`,
    `Last reply: ${assistantText}`,
  ];
  if (okTools.length) {
    const uniq = [...new Set(okTools)].slice(0, 12);
    lines.push(`Succeeded tools: ${uniq.join(", ")}`);
  }
  if (failTools.length) {
    const uniq = [...new Set(failTools)].slice(0, 8);
    lines.push(`Failed tools: ${uniq.join(", ")}`);
  }
  if (errors.length) {
    lines.push(`Errors: ${errors.slice(-3).join(" | ")}`);
  }
  if (args.scratchJson) {
    lines.push(`Working: ${String(args.scratchJson).slice(0, 500)}`);
  }
  if (args.todosJson) {
    lines.push(`TODO: ${String(args.todosJson).slice(0, 400)}`);
  }
  // Pull high-signal ids from recent tool Prior lines in history.
  const ids = [];
  for (const row of Array.isArray(args.history) ? args.history.slice(-24) : []) {
    const content = String(row?.content || "");
    const m = content.match(
      /\b(?:documentId|assetId|elementId|jobId|folderId)=([a-z0-9]+)/gi,
    );
    if (m) ids.push(...m.slice(0, 4));
  }
  if (ids.length) {
    lines.push(`Key ids: ${[...new Set(ids)].slice(0, 12).join(", ")}`);
  }
  return lines.join("\n").slice(0, 4000);
}

/**
 * Coach blurb from last trajectory for next turn.
 * @param {object|null|undefined} traj
 */
export function formatTrajectoryCoach(traj) {
  if (!traj || typeof traj !== "object") return "";
  const tools = Array.isArray(traj.tools) ? traj.tools : [];
  const errors = Array.isArray(traj.errors) ? traj.errors : [];
  if (!tools.length && !errors.length) return "";
  const fails = tools.filter((t) => t && t.ok === false);
  const thrash = {};
  for (const t of tools) {
    const name = String(t?.toolName || "");
    if (!name) continue;
    thrash[name] = (thrash[name] || 0) + 1;
  }
  const thrashy = Object.entries(thrash)
    .filter(([, n]) => n >= 3)
    .map(([name, n]) => `${name}×${n}`);
  const lines = ["Last turn coach (do not repeat mistakes):"];
  if (fails.length) {
    lines.push(
      `- Failed: ${fails
        .slice(-5)
        .map((t) => `${t.toolName}${t.error ? ` (${String(t.error).slice(0, 80)})` : ""}`)
        .join("; ")}`,
    );
  }
  if (thrashy.length) {
    lines.push(`- Thrash — call once with fixed args: ${thrashy.join(", ")}`);
  }
  if (traj.lane) lines.push(`- Prior lane was: ${String(traj.lane).slice(0, 200)}`);
  const okNames = [...new Set(tools.filter((t) => t?.ok).map((t) => t.toolName))].slice(0, 8);
  if (okNames.length) lines.push(`- Worked: ${okNames.join(", ")}`);
  return lines.join("\n");
}
