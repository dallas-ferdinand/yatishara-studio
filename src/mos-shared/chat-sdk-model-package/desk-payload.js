/** Desk SSE/poll payload from SDK-native run state. */
import { RUN_STATUS } from "./constants.js";
import { buildViewFromSdkMessages } from "./turn-builder.js";
import { buildRunView } from "./conversation-builder.js";
import { viewStreamSig } from "./view-sig.js";

const MAX_BLOCK_OUTPUT = 12_000;

function slimBlocks(blocks) {
  return (blocks ?? []).map((b) => {
    if (b.type !== "tool" || !b.output) return b;
    const text = String(b.output);
    if (text.length <= MAX_BLOCK_OUTPUT) return b;
    return { ...b, output: `${text.slice(0, MAX_BLOCK_OUTPUT)}…` };
  });
}

function isLive(run) {
  const s = run.status;
  return (
    s === "streaming" ||
    s === "awaiting_input" ||
    s === RUN_STATUS.RUNNING ||
    s === RUN_STATUS.AWAITING_USER
  );
}

function resolvedViewCache(run) {
  return run.sdkViewCache ?? run.viewCache ?? null;
}

function shouldShowPlanningWait(blocks, streaming) {
  if (!streaming) return false;
  if (blocks.some((b) => b.type === "tool" && b.status === "running")) return false;
  if (blocks.some((b) => b.type === "thinking" && !b.sealed)) return false;
  if (blocks.some((b) => b.type === "question" && (b.status ?? "pending") === "pending")) return false;
  const liveText = blocks.some(
    (b) => b.type === "text" && !b.sealed && String(b.content ?? "").trim().length > 0,
  );
  return !liveText;
}

function errorTerminalPayload(run) {
  const errStatus = run.status === "error" || run.status === RUN_STATUS.ERROR;
  const cancelled = run.status === "cancelled" || run.status === RUN_STATUS.CANCELLED;
  if (!errStatus && !cancelled) return null;
  const errEv = (run.events ?? []).find((e) => e.type === "error");
  const msg =
    String(
      errEv?.message ??
        run.text ??
        run.sdkResult?.result ??
        run.result?.errorMessage ??
        run.result?.text ??
        "",
    ).trim() || (errStatus ? "Agent run failed" : "Run cancelled");
  return {
    chatId: run.chatId,
    runId: run.runId ?? null,
    requestId: run.requestId ?? null,
    status: errStatus ? "error" : "cancelled",
    agentId: run.agentId,
    streaming: false,
    content: msg,
    blocks: [],
    flowSig: `err:${errStatus ? "error" : "cancelled"}`,
    showPlanning: false,
    eventSeq: run.sdkMessages?.length ?? run.events?.length ?? 0,
  };
}

/**
 * Build desk-trimmed run snapshot preferring SDK data over legacy events.
 * @param {object} run Gateway in-memory or DB-hydrated run
 */
export function sdkDeskRunPayload(run) {
  if (!run) return null;

  const live = isLive(run);
  const base = {
    chatId: run.chatId,
    runId: run.runId ?? null,
    requestId: run.requestId ?? null,
    status:
      run.status === RUN_STATUS.RUNNING
        ? "streaming"
        : run.status === RUN_STATUS.AWAITING_USER
          ? "awaiting_input"
          : run.status === RUN_STATUS.FINISHED
            ? "done"
            : run.status === RUN_STATUS.ERROR
              ? "error"
              : run.status === RUN_STATUS.CANCELLED
                ? "cancelled"
                : run.status,
    agentId: run.agentId,
    sdkMessageSeq: run.sdkMessages?.length ?? 0,
  };

  const cache = resolvedViewCache(run);
  if (cache && !live) {
    const blocks = slimBlocks(cache.blocks);
    return {
      ...base,
      streaming: false,
      content: cache.content,
      blocks,
      flowSig: cache.sig,
      showPlanning: false,
      eventSeq: run.sdkMessages?.length ?? 0,
      sdkSource: cache.source ?? "conversation_turns",
    };
  }

  if (run.sdkMessages?.length) {
    const v =
      live && run.sdkLiveView?.blocks
        ? { blocks: run.sdkLiveView.blocks, content: run.sdkLiveView.content ?? "" }
        : buildViewFromSdkMessages(run.sdkMessages, { streaming: live });
    const showPlanning = shouldShowPlanningWait(v.blocks, live);
    const sig = `${viewStreamSig(v.blocks)}|p:${showPlanning ? 1 : 0}`;
    if (v.content || v.blocks.length || live) {
      return {
        ...base,
        streaming: live,
        content: v.content.length > 20_000 ? `${v.content.slice(0, 20_000)}…` : v.content,
        blocks: slimBlocks(v.blocks),
        flowSig: sig,
        showPlanning,
        eventSeq: run.sdkMessages.length,
        sdkSource: "sdk_messages",
      };
    }
  }

  if (!live && (run.turns?.length || run.result?.text)) {
    const v = buildRunView(run);
    return {
      ...base,
      streaming: false,
      content: v.content,
      blocks: slimBlocks(v.blocks),
      flowSig: viewStreamSig(v.blocks),
      showPlanning: false,
      eventSeq: run.sdkMessages?.length ?? 0,
      sdkSource: v.source ?? "conversation_turns",
    };
  }

  if (live) {
    return {
      ...base,
      streaming: true,
      content: "",
      blocks: [],
      flowSig: "live:0|p:1",
      showPlanning: true,
      eventSeq: run.sdkMessages?.length ?? 0,
      sdkSource: "pending",
    };
  }

  return errorTerminalPayload(run);
}
