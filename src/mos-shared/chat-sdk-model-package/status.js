import { RUN_STATUS, THREAD_STATUS, isTerminalRunStatus } from "./constants.js";

/**
 * Map SDK RunResult.status to our RunLifecycleStatus.
 * @param {"finished"|"error"|"cancelled"|string} sdkStatus
 * @returns {import("./constants.js").RunLifecycleStatus}
 */
export function runStatusFromSdkResult(sdkStatus) {
  switch (sdkStatus) {
    case "finished":
      return RUN_STATUS.FINISHED;
    case "error":
      return RUN_STATUS.ERROR;
    case "cancelled":
      return RUN_STATUS.CANCELLED;
    default:
      return RUN_STATUS.ERROR;
  }
}

/**
 * Derive thread status from its runs (latest wins for active).
 * @param {Array<{ status: string }>} runs
 * @returns {import("./constants.js").ChatThreadStatus}
 */
export function threadStatusFromRuns(runs) {
  if (!runs?.length) return THREAD_STATUS.IDLE;

  const live = [...runs].reverse().find((r) => !isTerminalRunStatus(r.status));
  if (!live) return THREAD_STATUS.IDLE;
  if (live.status === RUN_STATUS.AWAITING_USER) return THREAD_STATUS.AWAITING_USER;
  if (live.status === RUN_STATUS.ERROR) return THREAD_STATUS.ERROR;
  return THREAD_STATUS.ACTIVE;
}

/**
 * Legacy gateway run.status → RunLifecycleStatus.
 * @param {string} legacy
 */
export function runStatusFromLegacyGateway(legacy) {
  switch (legacy) {
    case "streaming":
      return RUN_STATUS.RUNNING;
    case "awaiting_input":
      return RUN_STATUS.AWAITING_USER;
    case "done":
      return RUN_STATUS.FINISHED;
    case "error":
      return RUN_STATUS.ERROR;
    case "cancelled":
      return RUN_STATUS.CANCELLED;
    default:
      return RUN_STATUS.RUNNING;
  }
}

/**
 * Legacy chat.status → ChatThreadStatus.
 * @param {string} legacy
 */
export function threadStatusFromLegacyChat(legacy) {
  switch (legacy) {
    case "streaming":
      return THREAD_STATUS.ACTIVE;
    case "awaiting":
      return THREAD_STATUS.AWAITING_USER;
    case "error":
      return THREAD_STATUS.ERROR;
    default:
      return THREAD_STATUS.IDLE;
  }
}
