/** Chat schema and SDK alignment constants. */

export const CHAT_SCHEMA_VERSION = 5;

/** @typedef {"pending"|"running"|"awaiting_user"|"finished"|"error"|"cancelled"} RunLifecycleStatus */
export const RUN_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  AWAITING_USER: "awaiting_user",
  FINISHED: "finished",
  ERROR: "error",
  CANCELLED: "cancelled",
});

/** @typedef {"idle"|"active"|"awaiting_user"|"error"} ChatThreadStatus */
export const THREAD_STATUS = Object.freeze({
  IDLE: "idle",
  ACTIVE: "active",
  AWAITING_USER: "awaiting_user",
  ERROR: "error",
});

/** SDKMessage.type values we must handle (Cursor SDK stream events). */
export const SDK_MESSAGE_TYPES = Object.freeze([
  "system",
  "user",
  "assistant",
  "thinking",
  "tool_call",
  "status",
  "task",
  "request",
]);

export const TERMINAL_RUN_STATUSES = new Set([
  RUN_STATUS.FINISHED,
  RUN_STATUS.ERROR,
  RUN_STATUS.CANCELLED,
]);

export function isTerminalRunStatus(status) {
  return TERMINAL_RUN_STATUSES.has(status);
}
