"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, MessageCircle, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import "./studio-messages.css";

export type DmConversationId = Id<"dmConversations">;

type StudioMessagesPaneProps = {
  conversationId: DmConversationId | null;
  onSelectConversation: (conversationId: DmConversationId | null) => void;
  onOpenProfile?: (username: string) => void;
  /** When true (mobile), empty pane shows the chat list instead of the select prompt. */
  showChatListWhenEmpty?: boolean;
};

function timeLabel(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayLabel(value: number): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** WhatsApp-style relative stamp for the chat-list rail. */
export function conversationTimeLabel(value: number, now = Date.now()): string {
  const date = new Date(value);
  const diffMs = Math.max(0, now - value);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m`;
  if (diffMs < day && date.toDateString() === new Date(now).toDateString()) {
    return timeLabel(value);
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  if (diffMs < 7 * day) {
    return date.toLocaleDateString([], { weekday: "short" });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

export function StudioMessagesPane({
  conversationId,
  onSelectConversation,
  onOpenProfile,
  showChatListWhenEmpty = false,
}: StudioMessagesPaneProps) {
  const [expiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  );
  const conversations = useQuery(api.dms.listMyConversations, { expiresUnix });
  const messages = useQuery(
    api.dms.listMessages,
    conversationId ? { conversationId } : "skip",
  );
  const send = useMutation(api.dms.sendMessage);
  const markRead = useMutation(api.dms.markRead);

  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeRow = useMemo(
    () =>
      conversationId
        ? conversations?.find((row) => row.conversationId === conversationId)
        : undefined,
    [conversationId, conversations],
  );

  const lastMessageId = messages?.length
    ? messages[messages.length - 1]!._id
    : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId, lastMessageId]);

  useEffect(() => {
    if (!conversationId || !activeRow?.unread) return;
    void markRead({ conversationId });
  }, [activeRow?.unread, conversationId, lastMessageId, markRead]);

  useEffect(() => {
    setDraft("");
    setSendError("");
    if (conversationId) inputRef.current?.focus();
  }, [conversationId]);

  async function handleSend() {
    if (!conversationId) return;
    const body = draft.trim();
    if (!body || sendBusy) return;
    setSendBusy(true);
    setSendError("");
    try {
      await send({ conversationId, body });
      setDraft("");
      inputRef.current?.focus();
    } catch (error) {
      setSendError(friendlyConvexError(error, "Could not send message"));
    } finally {
      setSendBusy(false);
    }
  }

  if (!conversationId) {
    if (showChatListWhenEmpty) {
      return (
        <div className="studio-dm-pane">
          <div className="studio-dm-list-host">
            {conversations === undefined ? (
              <p className="studio-dm-empty">Loading…</p>
            ) : conversations.length === 0 ? (
              <div className="studio-dm-empty-state">
                <MessageCircle aria-hidden="true" />
                <strong>No chats yet</strong>
                <p>Open someone’s profile and tap Message to start a chat.</p>
              </div>
            ) : (
              <ul className="studio-dm-conversations">
                {conversations.map((row) => (
                  <li key={row.conversationId}>
                    <StudioDmConversationRow
                      row={row}
                      active={false}
                      onSelect={() => onSelectConversation(row.conversationId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="studio-dm-pane">
        <div className="studio-dm-empty-state is-select">
          <MessageCircle aria-hidden="true" />
          <strong>Select a chat to start chatting</strong>
          <p>Pick a conversation from the sidebar, or search for someone to message.</p>
        </div>
      </div>
    );
  }

  const peerLabel =
    activeRow?.peer.displayName?.trim() ||
    (activeRow ? `@${activeRow.peer.username}` : "Chat");

  let lastDay = "";

  return (
    <div className="studio-dm-pane">
      <header className="studio-dm-chat-head">
        {showChatListWhenEmpty ? (
          <button
            type="button"
            className="studio-dm-back"
            onClick={() => onSelectConversation(null)}
            aria-label="Back to chats"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="studio-dm-chat-peer"
          onClick={() =>
            activeRow ? onOpenProfile?.(activeRow.peer.username) : undefined
          }
        >
          <StudioProfileAvatar
            size="sm"
            src={activeRow?.peer.avatarUrl}
            displayName={activeRow?.peer.displayName}
            name={activeRow?.peer.username}
            alt=""
          />
          <span className="studio-dm-chat-peer-copy">
            <strong>{peerLabel}</strong>
            {activeRow ? <span>@{activeRow.peer.username}</span> : null}
          </span>
        </button>
      </header>

      <div className="studio-dm-scroll" ref={scrollRef}>
        {messages === undefined ? (
          <p className="studio-dm-empty">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="studio-dm-empty-state">
            <MessageCircle aria-hidden="true" />
            <strong>Say hi</strong>
            <p>This is the start of your chat with {peerLabel}.</p>
          </div>
        ) : (
          <div className="studio-dm-messages">
            {messages.map((message) => {
              const day = dayLabel(message.createdAt);
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <div key={message._id} className="studio-dm-message-block">
                  {showDay ? (
                    <div className="studio-dm-day" role="separator">
                      <span>{day}</span>
                    </div>
                  ) : null}
                  <div
                    className={`studio-dm-bubble-row${message.fromMe ? " is-mine" : ""}`}
                  >
                    <div className="studio-dm-bubble">
                      <p>{message.body}</p>
                      <time dateTime={new Date(message.createdAt).toISOString()}>
                        {timeLabel(message.createdAt)}
                      </time>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sendError ? <p className="studio-dm-error">{sendError}</p> : null}

      <footer className="studio-dm-composer">
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          placeholder="Message…"
          aria-label={`Message ${peerLabel}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="button"
          className="studio-dm-send"
          onClick={() => void handleSend()}
          disabled={sendBusy || !draft.trim()}
          aria-label="Send message"
        >
          {sendBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </footer>
    </div>
  );
}

export function StudioDmConversationRow({
  row,
  active,
  onSelect,
}: {
  row: {
    conversationId: DmConversationId;
    peer: { username: string; displayName?: string; avatarUrl?: string };
    lastMessagePreview?: string;
    lastMessageAt: number;
    lastMessageFromMe: boolean;
    unread: boolean;
  };
  active: boolean;
  onSelect: () => void;
}) {
  const label = row.peer.displayName?.trim() || `@${row.peer.username}`;
  const preview = row.lastMessagePreview
    ? `${row.lastMessageFromMe ? "You: " : ""}${row.lastMessagePreview}`
    : "Tap to start chatting";
  return (
    <button
      type="button"
      className={`studio-dm-row${active ? " is-active" : ""}${row.unread ? " is-unread" : ""}`}
      onClick={onSelect}
    >
      <StudioProfileAvatar
        size="sm"
        src={row.peer.avatarUrl}
        displayName={row.peer.displayName}
        name={row.peer.username}
        alt=""
      />
      <span className="studio-dm-row-copy">
        <span className="studio-dm-row-top">
          <strong>{label}</strong>
          <time className={row.unread ? "is-unread" : undefined}>
            {conversationTimeLabel(row.lastMessageAt)}
          </time>
        </span>
        <span className="studio-dm-row-bottom">
          <span className="studio-dm-row-preview">{preview}</span>
          {row.unread ? (
            <span className="studio-dm-unread-dot" aria-label="Unread" />
          ) : null}
        </span>
      </span>
    </button>
  );
}
