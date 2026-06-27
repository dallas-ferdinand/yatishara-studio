/** ConversationTurn[] → ViewBlock[] (terminal authoritative). */
import { buildViewFromSdkMessages } from "./turn-builder.js";

function textFromStep(step) {
  if (!step) return "";
  if (step.type === "assistantMessage") return String(step.message?.text ?? "");
  if (step.type === "thinkingMessage") return String(step.message?.text ?? "");
  return "";
}

function toolFromStep(step) {
  if (step.type !== "toolCall") return null;
  const tc = step.message ?? step.toolCall ?? step;
  const callId = tc.callId ?? tc.id ?? tc.call_id;
  return {
    type: "tool",
    callId: callId ?? `tool-${Math.random().toString(36).slice(2, 8)}`,
    name: tc.name ?? tc.toolName ?? "Tool",
    detail: "",
    status: tc.status ?? "completed",
    output: summarizeToolOutput(tc.result ?? tc.output),
    kind: "default",
    parentCallId: tc.parentCallId ?? tc.parent_call_id ?? null,
  };
}

function summarizeToolOutput(result) {
  if (result == null) return "";
  if (typeof result === "string") return result.slice(0, 12_000);
  try {
    const s = JSON.stringify(result);
    return s.length > 12_000 ? `${s.slice(0, 12_000)}…` : s;
  } catch {
    return String(result).slice(0, 12_000);
  }
}

/**
 * @param {object[]} turns ConversationTurn[]
 * @returns {{ blocks: import("./types.js").ViewBlock[], content: string }}
 */
export function buildViewFromTurns(turns) {
  /** @type {import("./types.js").ViewBlock[]} */
  const blocks = [];

  for (const turn of turns ?? []) {
    if (turn.type === "shellConversationTurn") {
      const cmd = turn.turn?.shellCommand?.command ?? turn.shellCommand?.command;
      const out = turn.turn?.shellOutput ?? turn.shellOutput;
      if (cmd) {
        blocks.push({
          type: "tool",
          callId: `shell-${blocks.length}`,
          name: "Shell",
          detail: cmd,
          status: "completed",
          output: [out?.stdout, out?.stderr].filter(Boolean).join("\n").slice(0, 12_000),
          kind: "shell",
        });
      }
      continue;
    }

    const agentTurn = turn.turn ?? turn;
    const steps = agentTurn.steps ?? [];
    for (const step of steps) {
      if (step.type === "assistantMessage") {
        const text = textFromStep(step);
        if (text) blocks.push({ type: "text", content: text, sealed: true });
      } else if (step.type === "thinkingMessage") {
        const text = textFromStep(step);
        if (text) {
          blocks.push({
            type: "thinking",
            content: text,
            durationMs: step.message?.thinkingDurationMs ?? step.message?.thinking_duration_ms ?? null,
            collapsed: true,
            sealed: true,
          });
        }
      } else if (step.type === "toolCall") {
        const tool = toolFromStep(step);
        if (tool) blocks.push(tool);
      }
    }
  }

  const content = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n\n")
    .trim();

  return { blocks, content };
}

/**
 * Prefer conversation turns; fall back to sdk messages.
 * @param {object} run RunRecord-like
 */
export function buildRunView(run) {
  if (run.turns?.length) {
    const view = buildViewFromTurns(run.turns);
    return { ...view, source: "conversation_turns" };
  }
  if (run.result?.text) {
    const fromMsgs = buildViewFromSdkMessages(run.sdkMessages ?? []);
    if (!fromMsgs.content && run.result.text) {
      fromMsgs.blocks.push({ type: "text", content: run.result.text, sealed: true });
      fromMsgs.content = run.result.text;
    }
    return { ...fromMsgs, source: "sdk_messages" };
  }
  return { ...buildViewFromSdkMessages(run.sdkMessages ?? []), source: "sdk_messages" };
}
