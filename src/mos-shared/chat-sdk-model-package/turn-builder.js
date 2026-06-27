/** Live SDKMessage[] → ViewBlock[] (streaming-safe). */
import {
  parseAskQuestionFromSdk,
  parseCreatePlanFromSdk,
  parseTodosFromSdk,
  isTodoToolCall,
  describeSdkToolCall,
} from "./sdk-tool-blocks.js";
import { mergeStreamingText } from "./text-merge.js";

function textFromAssistantContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && b.text)
    .map((b) => b.text)
    .join("");
}

function sealLastText(blocks) {
  const last = blocks[blocks.length - 1];
  if (last?.type === "text" && !last.sealed) last.sealed = true;
}

function activeTextBlock(blocks) {
  const last = blocks[blocks.length - 1];
  if (last?.type === "text" && !last.sealed) return last;
  return null;
}

function upsertQuestionBlock(blocks, callId, ask, status = "pending") {
  sealLastText(blocks);
  const idx = blocks.findIndex((b) => b.type === "question" && b.callId === callId);
  const item = {
    type: "question",
    callId,
    questions: ask.questions ?? [],
    status,
    answers: null,
  };
  if (idx >= 0) blocks[idx] = { ...blocks[idx], ...item };
  else blocks.push(item);
}

function upsertPlanBlock(blocks, callId, plan, status = "ready") {
  sealLastText(blocks);
  const idx = blocks.findIndex((b) => b.type === "plan" && b.callId === callId);
  const item = {
    type: "plan",
    callId: callId ?? `plan_${Date.now()}`,
    title: plan.title ?? "Plan",
    content: plan.content ?? "",
    overview: plan.overview ?? "",
    status,
  };
  if (idx >= 0) blocks[idx] = { ...blocks[idx], ...item };
  else blocks.push(item);
}

function upsertTodosBlock(blocks, callId, todos) {
  sealLastText(blocks);
  let idx = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === "todos") {
      idx = i;
      break;
    }
  }
  const item = {
    type: "todos",
    callId,
    items: todos.items ?? [],
  };
  if (idx >= 0) blocks[idx] = { ...blocks[idx], ...item };
  else blocks.push(item);
}

function upsertToolBlock(blocks, msg) {
  const callId = msg.call_id ?? msg.callId;
  if (!callId) return;
  const status = msg.status ?? "running";
  const described = describeSdkToolCall(msg);
  const idx = blocks.findIndex((b) => b.type === "tool" && b.callId === callId);
  const item = {
    type: "tool",
    callId,
    name: described.name,
    detail: described.detail,
    status,
    output: status === "completed" || status === "error" ? described.output : "",
    icon: described.icon,
    kind: described.kind,
    mcpServer: described.mcpServer,
    mcpTool: described.mcpTool,
    mcpToolSlug: described.mcpToolSlug,
    editPreview: described.editPreview,
    parentCallId: msg.parent_call_id ?? msg.parentCallId ?? null,
  };
  if (idx >= 0) {
    blocks[idx] = { ...blocks[idx], ...item };
  } else {
    sealLastText(blocks);
    blocks.push(item);
  }
}

function inferToolKind(name) {
  const n = String(name ?? "").toLowerCase();
  if (/^task$|subagent/.test(n)) return "task";
  if (/^mcp|^user-/.test(n)) return "mcp";
  if (/shell|terminal|bash/.test(n)) return "shell";
  return "default";
}

export { inferToolKind };

/**
 * Apply one SDKMessage to a mutable blocks array.
 * @param {import("./types.js").ViewBlock[]} blocks
 * @param {object} msg
 */
export function applySdkMessage(blocks, msg) {
  if (!msg?.type) return blocks;

  switch (msg.type) {
    case "system": {
      break;
    }
    case "assistant": {
      const text = textFromAssistantContent(msg.message?.content);
      if (!text) break;
      const active = activeTextBlock(blocks);
      if (active) {
        active.content = mergeStreamingText(active.content, text);
      } else {
        blocks.push({ type: "text", content: text, sealed: false });
      }
      break;
    }
    case "thinking": {
      const text = String(msg.text ?? "");
      const last = blocks[blocks.length - 1];
      if (!text) {
        if (last?.type === "thinking" && msg.thinking_duration_ms != null) {
          last.durationMs = msg.thinking_duration_ms;
        }
        break;
      }
      if (last?.type === "thinking" && !last.sealed) {
        last.content = mergeStreamingText(last.content, text);
        if (msg.thinking_duration_ms != null) last.durationMs = msg.thinking_duration_ms;
      } else {
        sealLastText(blocks);
        blocks.push({
          type: "thinking",
          content: text,
          durationMs: msg.thinking_duration_ms ?? null,
          collapsed: true,
          sealed: false,
        });
      }
      break;
    }
    case "tool_call": {
      const callId = msg.call_id ?? msg.callId;
      const status = msg.status ?? "running";
      const todos = status === "completed" ? parseTodosFromSdk(msg) : null;
      if (todos) {
        upsertTodosBlock(blocks, callId, todos);
        break;
      }
      if (!isTodoToolCall(msg)) {
        const ask = parseAskQuestionFromSdk(msg);
        if (ask && (status === "running" || !msg.status)) {
          upsertQuestionBlock(blocks, callId, ask);
        }
        const plan = parseCreatePlanFromSdk(msg);
        if (plan && status === "completed") {
          upsertPlanBlock(blocks, callId, plan);
        }
        upsertToolBlock(blocks, msg);
      }
      break;
    }
    case "status": {
      const message = msg.message ?? msg.status;
      if (message) blocks.push({ type: "status", message: String(message) });
      break;
    }
    case "task": {
      blocks.push({
        type: "task",
        status: msg.status ?? undefined,
        text: msg.text ?? undefined,
        callId: msg.call_id ?? msg.callId ?? undefined,
      });
      break;
    }
    case "request": {
      blocks.push({
        type: "request",
        requestId: msg.request_id ?? msg.requestId,
        status: "pending",
      });
      break;
    }
    case "user":
      break;
    default:
      break;
  }
  return blocks;
}

/**
 * @param {object[]} sdkMessages
 * @returns {{ blocks: import("./types.js").ViewBlock[], content: string }}
 */
export function buildViewFromSdkMessages(sdkMessages, { streaming = false } = {}) {
  /** @type {import("./types.js").ViewBlock[]} */
  const blocks = [];
  for (const msg of sdkMessages ?? []) applySdkMessage(blocks, msg);

  const last = blocks[blocks.length - 1];
  if (!streaming && (last?.type === "text" || last?.type === "thinking")) last.sealed = true;

  const content = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n\n")
    .trim();

  return { blocks, content };
}
