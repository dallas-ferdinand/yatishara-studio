/** Unified workspace tabs — chats, files, and Pulse share one ordered strip. */
import { getChatTabSignal, chatTabClassName } from "./chat-tab-signals.js";

export const CHAT_TAB_PREFIX = "chat:";
export const FILE_TAB_PREFIX = "file:";
export const PULSE_TAB_PREFIX = "pulse:";
export const BUCKETS_TAB_PREFIX = "buckets:";
export const PULSE_TAB_KEY = `${PULSE_TAB_PREFIX}main`;
export const BUCKETS_TAB_KEY = `${BUCKETS_TAB_PREFIX}main`;

export function chatTabKey(chatId) {
  return `${CHAT_TAB_PREFIX}${chatId}`;
}

export function fileTabKey(fileTabId) {
  return `${FILE_TAB_PREFIX}${fileTabId}`;
}

export function pulseTabKey() {
  return PULSE_TAB_KEY;
}

export function bucketsTabKey() {
  return BUCKETS_TAB_KEY;
}

export function parseWorkspaceTabKey(key) {
  if (!key || typeof key !== "string") return null;
  if (key.startsWith(CHAT_TAB_PREFIX)) {
    return { kind: "chat", id: key.slice(CHAT_TAB_PREFIX.length) };
  }
  if (key.startsWith(FILE_TAB_PREFIX)) {
    return { kind: "file", id: key.slice(FILE_TAB_PREFIX.length) };
  }
  if (key.startsWith(PULSE_TAB_PREFIX)) {
    return { kind: "pulse", id: key.slice(PULSE_TAB_PREFIX.length) };
  }
  if (key.startsWith(BUCKETS_TAB_PREFIX)) {
    return { kind: "buckets", id: key.slice(BUCKETS_TAB_PREFIX.length) };
  }
  return null;
}

/** Keep saved order; append newly opened tabs at the end. */
export function syncTabOrder(order, availableKeys) {
  const available = new Set(availableKeys);
  const next = (Array.isArray(order) ? order : []).filter((k) => available.has(k));
  for (const key of availableKeys) {
    if (!next.includes(key)) next.push(key);
  }
  return next;
}

export function reorderTabKeys(order, fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return order ?? [];
  const next = [...(order ?? [])];
  const from = next.indexOf(fromKey);
  const to = next.indexOf(toKey);
  if (from < 0 || to < 0) return order ?? [];
  next.splice(from, 1);
  const insertAt = next.indexOf(toKey);
  if (insertAt < 0) return order ?? [];
  next.splice(insertAt, 0, fromKey);
  return next;
}

export function neighborTabKey(order, closedKey) {
  const list = order ?? [];
  const idx = list.indexOf(closedKey);
  if (idx < 0) return list[0] ?? null;
  return list[idx + 1] ?? list[idx - 1] ?? null;
}

export function buildUnifiedTabDescriptors({ chatTabs, fileTabs, order, pulseOpen, bucketsOpen }) {
  const byKey = new Map();
  for (const chat of chatTabs ?? []) {
    const signal = getChatTabSignal(chat);
    byKey.set(chatTabKey(chat.id), {
      key: chatTabKey(chat.id),
      kind: "chat",
      id: chat.id,
      title: chat.title || "New chat",
      status: chat.status,
      tabSignal: signal.key,
      tabTone: signal.tone,
      tabTitle: signal.title,
      tabClasses: chatTabClassName(signal),
      tabDotClass: signal.dotClass,
      dirty: false,
      loading: false,
    });
  }
  for (const file of fileTabs ?? []) {
    byKey.set(fileTabKey(file.id), {
      key: fileTabKey(file.id),
      kind: "file",
      id: file.id,
      title: file.name,
      path: file.path,
      dirty: Boolean(file.dirty),
      loading: Boolean(file.loading),
      saving: Boolean(file.saving),
      ext: file.ext,
      viewMode: file.viewMode,
      error: file.error,
    });
  }
  if (pulseOpen) {
    byKey.set(PULSE_TAB_KEY, {
      key: PULSE_TAB_KEY,
      kind: "pulse",
      id: "main",
      title: "Pulse",
    });
  }
  if (bucketsOpen) {
    byKey.set(BUCKETS_TAB_KEY, {
      key: BUCKETS_TAB_KEY,
      kind: "buckets",
      id: "main",
      title: "Buckets",
    });
  }
  const keys = syncTabOrder(order, [...byKey.keys()]);
  return keys.map((k) => byKey.get(k)).filter(Boolean);
}
