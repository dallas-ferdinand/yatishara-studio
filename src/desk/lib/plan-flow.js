function blocksFromChat(chat) {
  const out = [];
  for (const message of chat?.messages ?? []) {
    for (const block of message.blocks ?? []) out.push(block);
  }
  return out;
}

export function findPlanBlock(messages = [], callId = null) {
  for (let i = (messages ?? []).length - 1; i >= 0; i--) {
    const blocks = messages[i]?.blocks ?? [];
    for (let j = blocks.length - 1; j >= 0; j--) {
      const block = blocks[j];
      if (block?.type !== "plan") continue;
      if (!callId || block.callId === callId || block.id === callId) return block;
    }
  }
  return null;
}

export function normalizePlanSnapshot(block) {
  if (!block) return null;
  return {
    callId: block.callId ?? block.id ?? null,
    title: block.title ?? "Plan",
    content: block.content ?? block.text ?? block.markdown ?? "",
    status: block.status ?? "ready",
  };
}

export function planViewModel(state, chatId, callId = null) {
  const chat = state?.chats?.find((row) => row.id === chatId);
  const block = findPlanBlock([{ blocks: blocksFromChat(chat) }], callId);
  return normalizePlanSnapshot(block);
}

export function markPlanExecuted(state, chatId, callId, flows = null) {
  const chat = state?.chats?.find((row) => row.id === chatId);
  for (const message of chat?.messages ?? []) {
    for (const block of message.blocks ?? []) {
      if (block?.type === "plan" && (!callId || block.callId === callId || block.id === callId)) {
        block.status = "executed";
      }
    }
  }
  const flow = flows?.get?.(chatId);
  for (const block of flow?.blocks ?? []) {
    if (block?.type === "plan" && (!callId || block.callId === callId || block.id === callId)) {
      block.status = "executed";
    }
  }
}
