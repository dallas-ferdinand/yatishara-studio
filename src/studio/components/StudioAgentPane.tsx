/**
 * Studio Agent Mode — Create/DM layout: chat stream + bottom composer.
 * Thread list lives in History (Create-style). BYOK lives in Settings → Agent.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowUp, Bot, Check, Loader2, Plus, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";

type StudioAgentPaneProps = {
  activeThreadId: Id<"agentThreads"> | null;
  onActiveThreadChange: (id: Id<"agentThreads"> | null) => void;
  onOpenCreate?: () => void;
  onOpenAgentSettings?: () => void;
};

export function StudioAgentPane({
  activeThreadId,
  onActiveThreadChange,
  onOpenCreate,
  onOpenAgentSettings,
}: StudioAgentPaneProps) {
  const createThread = useMutation(api.agentThreads.create);
  const decideApproval = useMutation(api.agentApprovals.decide);
  const sendTurn = useAction(api.agentActions.sendTurn);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const messages = useQuery(
    api.agentThreads.listMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const approvals = useQuery(
    api.agentApprovals.listForThread,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );

  const pendingApprovals = useMemo(
    () => (approvals ?? []).filter((row) => row.status === "pending"),
    [approvals],
  );

  useEffect(() => {
    const el = streamRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length, busy]);

  const ensureThread = useCallback(async () => {
    if (activeThreadId) return activeThreadId;
    const id = await createThread({});
    onActiveThreadChange(id);
    return id;
  }, [activeThreadId, createThread, onActiveThreadChange]);

  async function handleNewChat() {
    const id = await createThread({});
    onActiveThreadChange(id);
    setDraft("");
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    stickToBottomRef.current = true;
    try {
      const threadId = await ensureThread();
      setDraft("");
      const result = await sendTurn({ threadId, message: text });
      if (result.creditsSpent > 0) {
        toast.message(`Agent turn · ${result.creditsSpent} credits`);
      } else if (result.usedByok) {
        toast.message("Agent turn · your API key");
      }
    } catch (error) {
      toast.error(friendlyConvexError(error, "Agent turn failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDecide(
    approvalId: Id<"agentApprovals">,
    decision: "approve" | "deny",
  ) {
    try {
      await decideApproval({ approvalId, decision });
      toast.success(decision === "approve" ? "Approved" : "Denied");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not update approval"));
    }
  }

  const hasMessages = Boolean(messages?.length);

  return (
    <div className="studio-agent-pane" data-studio-agent="">
      <div className="studio-chat-render-area">
        <div
          className="studio-chat-stream"
          ref={streamRef}
          onScroll={() => {
            const el = streamRef.current;
            if (!el) return;
            stickToBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
          }}
        >
          <div
            className={`studio-chat-stream-inner${hasMessages || busy ? "" : " is-empty"}`}
          >
            {!hasMessages && !busy ? (
              <div className="studio-agent-empty-hero">
                <Bot size={28} aria-hidden="true" />
                <h2>Studio Agent</h2>
                <p>
                  Set up projects, folders, and generation approvals — like a
                  coding agent, inside Studio.
                </p>
                <div className="studio-agent-empty-actions">
                  <button
                    type="button"
                    className="studio-agent-secondary-btn"
                    onClick={() => onOpenCreate?.()}
                  >
                    Open Create
                  </button>
                  <button
                    type="button"
                    className="studio-agent-secondary-btn"
                    onClick={() => onOpenAgentSettings?.()}
                  >
                    <Settings size={14} aria-hidden="true" />
                    Agent settings
                  </button>
                </div>
              </div>
            ) : null}

            {(messages ?? []).map((msg) => {
              if (msg.role === "approval" && msg.approvalId) {
                const pending = pendingApprovals.find(
                  (row) => row._id === msg.approvalId,
                );
                const statusRow = (approvals ?? []).find(
                  (row) => row._id === msg.approvalId,
                );
                return (
                  <div key={msg._id} className="studio-agent-approval-card">
                    <strong>{statusRow?.title ?? "Approval"}</strong>
                    <p>{msg.content}</p>
                    {statusRow?.estimatedCredits != null ? (
                      <p className="studio-agent-meta">
                        Est. {statusRow.estimatedCredits} credits
                      </p>
                    ) : null}
                    {pending ? (
                      <div className="studio-agent-approval-actions">
                        <button
                          type="button"
                          className="studio-agent-primary-btn"
                          onClick={() =>
                            void handleDecide(msg.approvalId!, "approve")
                          }
                        >
                          <Check size={14} aria-hidden="true" /> Approve
                        </button>
                        <button
                          type="button"
                          className="studio-agent-secondary-btn"
                          onClick={() =>
                            void handleDecide(msg.approvalId!, "deny")
                          }
                        >
                          <X size={14} aria-hidden="true" /> Deny
                        </button>
                      </div>
                    ) : (
                      <p className="studio-agent-meta">
                        {statusRow?.status ?? "done"}
                      </p>
                    )}
                  </div>
                );
              }

              const isUser = msg.role === "user";
              return (
                <article
                  key={msg._id}
                  className={`studio-chat-bubble${isUser ? " is-user" : ""}`}
                >
                  {msg.content}
                </article>
              );
            })}

            {busy ? (
              <article className="studio-chat-bubble is-thinking">
                <Loader2 className="animate-spin" size={14} aria-hidden="true" />
                Working…
              </article>
            ) : null}
          </div>
          <div className="studio-chat-composer-gutter" aria-hidden="true" />
        </div>
      </div>

      <div className="studio-chat-composer-align studio-agent-composer-dock">
        <div className="cursor-composer studio-agent-composer-shell">
          <div className="studio-agent-composer-toolbar">
            <button
              type="button"
              className="studio-composer-circle-btn"
              title="New agent chat"
              aria-label="New agent chat"
              onClick={() => void handleNewChat()}
            >
              <Plus size={14} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="studio-composer-circle-btn"
              title="Agent settings"
              aria-label="Agent settings"
              onClick={() => onOpenAgentSettings?.()}
            >
              <Settings size={14} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
          <div className="studio-agent-composer-input-row">
            <textarea
              className="studio-agent-composer-textarea"
              rows={2}
              placeholder="Ask the agent to set up a project, generate, or work across Studio…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={busy}
            />
            <button
              type="button"
              className="studio-composer-circle-btn studio-composer-send-btn"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              title="Send"
              onClick={() => void handleSend()}
            >
              {busy ? (
                <Loader2
                  size={14}
                  strokeWidth={2.25}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ArrowUp size={14} strokeWidth={2.25} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
