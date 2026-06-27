"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatState, ChatThread, RunSnapshot, Session, ThreadStatus } from "@/lib/types";
import { GatewayClient } from "@/lib/gateway";

function emptyState(): ChatState {
  return {
    activeId: null,
    deskWorkspaceId: "mercuryos",
    chats: [],
    openAgentTabIds: [],
  };
}

function newChat(): ChatThread {
  const id = crypto.randomUUID();
  return {
    id,
    title: "New chat",
    messages: [],
    status: "idle",
    workspaceId: "mercuryos",
    composerDraft: "",
    updatedAt: Date.now(),
  };
}

function previewTitle(text: string): string {
  const t = text.trim();
  if (!t) return "New chat";
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

export function useDeskSession(session: Session) {
  const clientRef = useRef(new GatewayClient(session));
  const [state, setState] = useState<ChatState>(emptyState);
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const persist = useCallback(
    async (next: ChatState, rev: number) => {
      try {
        const newRev = await clientRef.current.putChats(next, rev);
        revisionRef.current = newRev;
        setRevision(newRev);
      } catch {
        /* conflict — server wins on next load */
      }
    },
    [],
  );

  const scheduleSave = useCallback(
    (next: ChatState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(next, revisionRef.current), 600);
    },
    [persist],
  );

  const applyState = useCallback(
    (updater: (prev: ChatState) => ChatState, save = true) => {
      setState((prev) => {
        const updated = updater(prev);
        if (save) scheduleSave(updated);
        return updated;
      });
    },
    [scheduleSave],
  );

  const activeChat = state.chats.find((c) => c.id === state.activeId) ?? null;

  const stopPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const mergeRun = useCallback((chatId: string, run: RunSnapshot | null) => {
    if (!run) return;
    const live = run.status === "streaming" || run.status === "awaiting_input";
    applyState((prev) => {
      const chats: ChatThread[] = prev.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        const messages = [...chat.messages];
        const text = run.text ?? "";
        const last = messages[messages.length - 1];
        if (last?.role === "assistant" && (last.streaming || live)) {
          messages[messages.length - 1] = {
            ...last,
            content: text,
            streaming: live,
          };
        } else if (text) {
          messages.push({
            id: crypto.randomUUID(),
            role: "assistant",
            content: text,
            streaming: live,
          });
        }
        return {
          ...chat,
          messages,
          status: (live ? "streaming" : "idle") as ThreadStatus,
          updatedAt: Date.now(),
        };
      });
      return { ...prev, chats };
    });
    if (!live) stopPoll();
  }, [applyState, stopPoll]);

  const startPoll = useCallback(
    (chatId: string) => {
      stopPoll();
      pollTimer.current = setInterval(async () => {
        try {
          const run = await clientRef.current.pollRun(chatId);
          mergeRun(chatId, run);
        } catch {
          stopPoll();
        }
      }, 1200);
    },
    [mergeRun, stopPoll],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { revision: rev, state: remote } = await clientRef.current.getChats();
        if (cancelled) return;
        if (remote?.chats?.length) {
          setState(remote);
          revisionRef.current = rev;
          setRevision(rev);
          if (!remote.activeId) {
            setState((s) => ({ ...s, activeId: remote.chats[0]?.id ?? null }));
          }
        } else {
          const chat = newChat();
          const initial = {
            ...emptyState(),
            activeId: chat.id,
            chats: [chat],
            openAgentTabIds: [chat.id],
          };
          setState(initial);
          const newRev = await clientRef.current.putChats(initial, 0);
          revisionRef.current = newRev;
          setRevision(newRev);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      stopPoll();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [stopPoll]);

  const selectChat = (id: string) => {
    applyState((prev) => ({ ...prev, activeId: id }), false);
  };

  const createChat = () => {
    const chat = newChat();
    applyState((prev) => ({
      ...prev,
      activeId: chat.id,
      chats: [chat, ...prev.chats],
      openAgentTabIds: [chat.id, ...prev.openAgentTabIds.filter((x) => x !== chat.id)],
    }));
  };

  const setDraft = (draft: string) => {
    if (!state.activeId) return;
    applyState((prev) => ({
      ...prev,
      chats: prev.chats.map((c) =>
        c.id === prev.activeId ? { ...c, composerDraft: draft } : c,
      ),
    }));
  };

  const sendMessage = async (text: string) => {
    const chatId = state.activeId;
    if (!chatId || !text.trim()) return;
    const trimmed = text.trim();
    applyState((prev) => ({
      ...prev,
      chats: prev.chats.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          title: c.messages.length === 0 ? previewTitle(trimmed) : c.title,
          composerDraft: "",
          status: "streaming",
          messages: [
            ...c.messages,
            { id: crypto.randomUUID(), role: "user", content: trimmed },
            { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true },
          ],
          updatedAt: Date.now(),
        };
      }),
    }));
    try {
      await clientRef.current.sendMessage(chatId, trimmed, state.deskWorkspaceId);
      startPoll(chatId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      applyState((prev) => ({
        ...prev,
        chats: prev.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                status: "error",
                messages: c.messages.filter((m) => !m.streaming).concat({
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: msg,
                }),
              }
            : c,
        ),
      }));
    }
  };

  const cancelRun = async () => {
    if (!state.activeId) return;
    await clientRef.current.cancelRun(state.activeId);
    stopPoll();
    applyState((prev) => ({
      ...prev,
      chats: prev.chats.map((c) =>
        c.id === prev.activeId
          ? {
              ...c,
              status: "idle",
              messages: c.messages.map((m) => ({ ...m, streaming: false })),
            }
          : c,
      ),
    }));
  };

  return {
    ready,
    state,
    activeChat,
    selectChat,
    createChat,
    setDraft,
    sendMessage,
    cancelRun,
    isStreaming: activeChat?.status === "streaming",
  };
}
