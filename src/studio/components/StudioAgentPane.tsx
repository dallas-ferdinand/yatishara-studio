/**
 * Studio Agent Mode pane — Claude Code / Cowork style chat over Studio tools.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bot, Loader2, Plus, Send, Wand2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";

type StudioAgentPaneProps = {
  onOpenCreate?: () => void;
};

export function StudioAgentPane({ onOpenCreate }: StudioAgentPaneProps) {
  const threads = useQuery(api.agentThreads.listMine, {});
  const createThread = useMutation(api.agentThreads.create);
  const decideApproval = useMutation(api.agentApprovals.decide);
  const sendTurn = useAction(api.agentActions.sendTurn);
  const saveByok = useAction(api.userAgentKeysActions.saveMine);
  const clearByok = useMutation(api.userAgentKeys.clearMine);
  const byok = useQuery(api.userAgentKeys.getMine, {});

  const [activeThreadId, setActiveThreadId] = useState<Id<"agentThreads"> | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [byokProvider, setByokProvider] = useState<
    "openai" | "anthropic" | "zai" | "openrouter"
  >("openai");
  const [byokKey, setByokKey] = useState("");
  const [byokBusy, setByokBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const messages = useQuery(
    api.agentThreads.listMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const approvals = useQuery(
    api.agentApprovals.listForThread,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );

  useEffect(() => {
    if (!activeThreadId && threads && threads.length > 0) {
      setActiveThreadId(threads[0]._id);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length, busy]);

  const pendingApprovals = useMemo(
    () => (approvals ?? []).filter((row) => row.status === "pending"),
    [approvals],
  );

  const ensureThread = useCallback(async () => {
    if (activeThreadId) return activeThreadId;
    const id = await createThread({});
    setActiveThreadId(id);
    return id;
  }, [activeThreadId, createThread]);

  async function handleNewChat() {
    const id = await createThread({});
    setActiveThreadId(id);
    setDraft("");
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
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

  async function handleSaveByok() {
    if (!byokKey.trim()) {
      toast.error("Paste an API key first");
      return;
    }
    setByokBusy(true);
    try {
      const result = await saveByok({
        provider: byokProvider,
        apiKey: byokKey.trim(),
      });
      setByokKey("");
      toast.success(`Saved key ${result.keyHint}`);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not save API key"));
    } finally {
      setByokBusy(false);
    }
  }

  return (
    <div className="studio-agent-pane" data-studio-agent="">
      <aside className="studio-agent-rail" aria-label="Agent chats">
        <div className="studio-agent-rail-head">
          <strong>Agent</strong>
          <button
            type="button"
            className="studio-agent-icon-btn"
            title="New agent chat"
            onClick={() => void handleNewChat()}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-agent-thread-list">
          {(threads ?? []).map((thread) => (
            <button
              key={thread._id}
              type="button"
              className={`studio-agent-thread${
                thread._id === activeThreadId ? " is-active" : ""
              }`}
              onClick={() => setActiveThreadId(thread._id)}
            >
              {thread.title}
            </button>
          ))}
          {threads && threads.length === 0 ? (
            <p className="studio-agent-empty">No chats yet</p>
          ) : null}
        </div>
        <div className="studio-agent-byok">
          <div className="studio-agent-byok-title">Your agent API key</div>
          {byok ? (
            <p className="studio-agent-byok-hint">
              {byok.provider} · {byok.keyHint}
              <button
                type="button"
                className="studio-agent-text-btn"
                onClick={() => void clearByok({})}
              >
                Remove
              </button>
            </p>
          ) : (
            <>
              <select
                className="studio-agent-select"
                value={byokProvider}
                onChange={(e) =>
                  setByokProvider(
                    e.target.value as
                      | "openai"
                      | "anthropic"
                      | "zai"
                      | "openrouter",
                  )
                }
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (compat URL)</option>
                <option value="zai">Z.ai / GLM</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              <input
                className="studio-agent-input"
                type="password"
                placeholder="sk-…"
                value={byokKey}
                onChange={(e) => setByokKey(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="studio-agent-secondary-btn"
                disabled={byokBusy}
                onClick={() => void handleSaveByok()}
              >
                {byokBusy ? "Saving…" : "Save key"}
              </button>
            </>
          )}
        </div>
      </aside>

      <section className="studio-agent-main">
        <header className="studio-agent-main-head">
          <div className="studio-agent-main-title">
            <Bot size={18} aria-hidden="true" />
            <span>Agent Mode</span>
          </div>
          <div className="studio-agent-main-actions">
            <button
              type="button"
              className="studio-agent-secondary-btn"
              onClick={() => onOpenCreate?.()}
            >
              <Wand2 size={14} aria-hidden="true" />
              Create
            </button>
          </div>
        </header>

        <div className="studio-agent-messages" ref={listRef}>
          {(messages ?? []).map((msg) => {
            if (msg.role === "approval" && msg.approvalId) {
              const pending = pendingApprovals.find(
                (row) => row._id === msg.approvalId,
              );
              const statusRow = (approvals ?? []).find(
                (row) => row._id === msg.approvalId,
              );
              return (
                <div key={msg._id} className="studio-agent-msg is-approval">
                  <div className="studio-agent-approval-card">
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
                </div>
              );
            }
            return (
              <div
                key={msg._id}
                className={`studio-agent-msg is-${msg.role}`}
              >
                <div className="studio-agent-bubble">{msg.content}</div>
              </div>
            );
          })}
          {busy ? (
            <div className="studio-agent-msg is-assistant">
              <div className="studio-agent-bubble is-thinking">
                <Loader2 className="animate-spin" size={14} aria-hidden="true" />
                Working…
              </div>
            </div>
          ) : null}
          {!messages?.length && !busy ? (
            <div className="studio-agent-hero">
              <Bot size={28} aria-hidden="true" />
              <h2>Studio Agent</h2>
              <p>
                Create projects, folders, and generation approvals with Studio
                tools — like a coding agent, inside Studio.
              </p>
            </div>
          ) : null}
        </div>

        <form
          className="studio-agent-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            className="studio-agent-textarea"
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
            type="submit"
            className="studio-agent-send"
            disabled={busy || !draft.trim()}
            aria-label="Send"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
