import { CHAT_SCHEMA_VERSION, RUN_STATUS } from "./constants.js";
import { runStatusFromSdkResult } from "./status.js";

/**
 * @param {object} partial
 * @returns {import("./types.js").RunRecord}
 */
export function createRunRecord(partial) {
  const now = Date.now();
  return {
    runId: partial.runId,
    requestId: partial.requestId ?? null,
    chatId: partial.chatId,
    agentId: partial.agentId ?? null,
    status: partial.status ?? RUN_STATUS.PENDING,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    endedAt: partial.endedAt ?? null,
    userPrompt: partial.userPrompt ?? { text: "" },
    workspaceId: partial.workspaceId ?? "mercuryos",
    workspacePath: partial.workspacePath ?? null,
    model: partial.model ?? null,
    mode: partial.mode ?? null,
    sdkMessages: [],
    result: null,
    turns: null,
    viewCache: null,
    parentRunId: partial.parentRunId ?? null,
    continuation: partial.continuation ?? null,
    source: partial.source ?? "desk",
    legacy: Boolean(partial.legacy),
    migrationNote: partial.migrationNote ?? null,
  };
}

/**
 * Append SDK message immutably (returns new array on the run object).
 * @param {import("./types.js").RunRecord} run
 * @param {object} message SDKMessage
 */
export function appendSdkMessage(run, message) {
  if (!message || typeof message !== "object") return run;
  run.sdkMessages = [...(run.sdkMessages ?? []), structuredClone(message)];
  run.updatedAt = Date.now();
  if (run.status === RUN_STATUS.PENDING) run.status = RUN_STATUS.RUNNING;
  return run;
}

/**
 * @param {import("./types.js").RunRecord} run
 * @param {object} result RunResult from run.wait()
 */
export function setRunResult(run, result) {
  if (!result) return run;
  run.result = {
    status: result.status,
    text: result.result ?? null,
    durationMs: result.durationMs ?? null,
    model: result.model?.id ?? result.model ?? null,
    git: result.git ?? null,
    requestId: result.requestId ?? null,
    errorMessage: result.status === "error" ? String(result.result ?? "Run failed") : null,
  };
  run.status = runStatusFromSdkResult(result.status);
  run.updatedAt = Date.now();
  if (!run.requestId && result.requestId) run.requestId = result.requestId;
  return run;
}

/**
 * @param {import("./types.js").RunRecord} run
 * @param {object[]} turns ConversationTurn[]
 */
export function setRunTurns(run, turns) {
  run.turns = Array.isArray(turns) ? structuredClone(turns) : [];
  run.updatedAt = Date.now();
  return run;
}

/**
 * @param {import("./types.js").RunRecord} run
 * @param {import("./types.js").RunViewCache} viewCache
 */
export function setRunViewCache(run, viewCache) {
  run.viewCache = viewCache;
  run.updatedAt = Date.now();
  return run;
}

/**
 * Mark run awaiting user input (AskQuestion / SDK request).
 * @param {import("./types.js").RunRecord} run
 */
export function markRunAwaitingUser(run) {
  run.status = RUN_STATUS.AWAITING_USER;
  run.updatedAt = Date.now();
  return run;
}

/**
 * Finalize timestamps on terminal run.
 * @param {import("./types.js").RunRecord} run
 */
export function finalizeRunTimestamps(run) {
  run.endedAt = Date.now();
  run.updatedAt = run.endedAt;
  return run;
}

/**
 * Merge completeness score for cross-device sync (higher = more authoritative).
 * @param {import("./types.js").RunRecord} run
 */
export function runCompletenessScore(run) {
  if (!run) return 0;
  let score = 0;
  if (run.turns?.length) score += 10_000;
  if (run.result) score += 5_000;
  score += (run.sdkMessages?.length ?? 0) * 10;
  if (run.viewCache?.blocks?.length) score += 100;
  if (run.legacy) score -= 50;
  return score;
}

/**
 * Pick richer run for merge conflicts.
 * @param {import("./types.js").RunRecord|null} a
 * @param {import("./types.js").RunRecord|null} b
 */
export function mergeRunsPreferComplete(a, b) {
  if (!a) return b;
  if (!b) return a;
  const sa = runCompletenessScore(a);
  const sb = runCompletenessScore(b);
  if (sb > sa) return b;
  if (sa > sb) return a;
  return (b.updatedAt ?? 0) >= (a.updatedAt ?? 0) ? b : a;
}

/**
 * @param {object} partial
 * @returns {import("./types.js").ChatThread}
 */
export function createChatThread(partial) {
  const now = Date.now();
  return {
    id: partial.id,
    title: partial.title ?? "New chat",
    pinned: Boolean(partial.pinned),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    agentId: partial.agentId ?? null,
    workspaceId: partial.workspaceId ?? "mercuryos",
    model: partial.model ?? null,
    mode: partial.mode ?? null,
    composerDraft: partial.composerDraft ?? "",
    pendingAttachments: partial.pendingAttachments ?? [],
    runIds: partial.runIds ?? [],
    lastRunId: partial.lastRunId ?? null,
    status: partial.status ?? "idle",
  };
}

/**
 * @param {object} partial
 * @returns {import("./types.js").ChatStateV5}
 */
export function createChatStateV5(partial = {}) {
  return {
    schemaVersion: CHAT_SCHEMA_VERSION,
    activeId: partial.activeId ?? null,
    deskWorkspaceId: partial.deskWorkspaceId ?? "mercuryos",
    uiUpdatedAt: partial.uiUpdatedAt ?? Date.now(),
    openAgentTabIds: partial.openAgentTabIds ?? [],
    openSubagentTabs: partial.openSubagentTabs ?? [],
    activeSubagentCallId: partial.activeSubagentCallId ?? null,
    threads: partial.threads ?? [],
    runs: partial.runs ?? {},
  };
}
