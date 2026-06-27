export type ThreadStatus = "idle" | "streaming" | "awaiting" | "error" | "cancelled";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
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
