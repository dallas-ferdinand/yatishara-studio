/**
 * SOT: desk-chat-types
 * WHAT: Derived Studio-copied Desk chat/session types (keep in sync with mercuryos-desk-next).
 * WHY: One const object — do not re-declare ThreadStatus elsewhere.
 * HOW: typeof THREAD_STATUSES[number]
 * WHERE: /opt/yatishara-studio/src/lib/types.ts
 */

export const THREAD_STATUSES = ["idle", "streaming", "awaiting", "error", "cancelled"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  status: ThreadStatus;
  workspaceId?: string;
  composerDraft?: string;
  updatedAt?: number;
};

export type ChatState = {
  activeId: string | null;
  deskWorkspaceId: string;
  chats: ChatThread[];
  openAgentTabIds: string[];
};

export type RunSnapshot = {
  chatId: string;
  status: string;
  text?: string;
  streaming?: boolean;
  tools?: Array<{ name?: string; status?: string }>;
  agentId?: string | null;
};

export type Session = {
  gatewayUrl: string;
  token: string;
  deviceId: string;
  userId?: string;
  displayName?: string;
};
