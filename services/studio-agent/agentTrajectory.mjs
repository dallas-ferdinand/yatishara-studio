/**
 * Turn trajectory for observability (compact).
 */

export function createTrajectory({ lane = "", message = "" } = {}) {
  const startedAt = Date.now();
  /** @type {Array<Record<string, unknown>>} */
  const tools = [];
  /** @type {string[]} */
  const errors = [];

  return {
    recordTool({ toolName, ok, error, pendingApproval, bytes }) {
      tools.push({
        toolName,
        ok: Boolean(ok),
        pendingApproval: Boolean(pendingApproval),
        error: error ? String(error).slice(0, 160) : undefined,
        bytes: typeof bytes === "number" ? bytes : undefined,
        t: Date.now() - startedAt,
      });
      if (error) errors.push(String(error).slice(0, 160));
    },
    snapshot() {
      return {
        lane: lane || undefined,
        messagePreview: String(message || "").slice(0, 120) || undefined,
        toolCount: tools.length,
        tools: tools.slice(-20),
        errors: errors.slice(-8),
        ms: Date.now() - startedAt,
      };
    },
  };
}
