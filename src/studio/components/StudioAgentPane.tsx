/**
 * Studio Agent Mode — Create/DM layout: chat stream + bottom composer.
 * Thread list lives in History (Create-style). BYOK lives in Settings → Agent.
 * Composer chrome matches DM/Create glass box (studio-dm-composer / accent corners).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowUp, Check, Loader2, Plus, RotateCcw, Settings, Square, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { StudioEmptyLogoButton } from "./StudioEmptyLogoButton";
import "./studio-messages.css";
import "./studio-agent.css";

type StudioAgentPaneProps = {
  activeThreadId: Id<"agentThreads"> | null;
  onActiveThreadChange: (id: Id<"agentThreads"> | null) => void;
  onOpenAgentSettings?: () => void;
  /** After minting a thread, promote agent:main → agent:<id> like Create→thread. */
  onBindThreadTab?: (threadId: Id<"agentThreads">) => void;
  onOpenNewAgentTab?: () => void;
  isMobile?: boolean;
};

function autosizeAgentComposer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  const next = Math.min(120, Math.max(36, el.scrollHeight));
  el.style.height = `${next}px`;
  el.classList.toggle("is-single-line", next <= 40);
}

export function StudioAgentPane({
  activeThreadId,
  onActiveThreadChange,
  onOpenAgentSettings,
  onBindThreadTab,
  onOpenNewAgentTab,
  isMobile = false,
}: StudioAgentPaneProps) {
  const createThread = useMutation(api.agentThreads.create);
  const decideApproval = useMutation(api.agentApprovals.decide);
  const cancelRun = useMutation(api.agentRuns.requestCancel);
  const sendTurn = useAction(api.agentActions.sendTurn);
  const retryRun = useAction(api.agentActions.retryRun);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<Id<"agentRuns"> | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);

  const messages = useQuery(
    api.agentThreads.listMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const approvals = useQuery(
    api.agentApprovals.listForThread,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const toolCalls = useQuery(
    api.agentRuns.listToolCallsForThread,
    activeThreadId ? { threadId: activeThreadId, limit: 40 } : "skip",
  );
  const runs = useQuery(
    api.agentRuns.listForThread,
    activeThreadId ? { threadId: activeThreadId, limit: 8 } : "skip",
  );

  const pendingApprovals = useMemo(
    () => (approvals ?? []).filter((row) => row.status === "pending"),
    [approvals],
  );

  const latestFailedRun = useMemo(
    () => (runs ?? []).find((row: { status: string }) => row.status === "failed" || row.status === "cancelled"),
    [runs],
  );

  useEffect(() => {
    const el = streamRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length, toolCalls?.length, busy]);

  useEffect(() => {
    autosizeAgentComposer(inputRef.current);
  }, [draft]);

  const ensureThread = useCallback(async () => {
    if (activeThreadId) return activeThreadId;
    const id = await createThread({});
    onActiveThreadChange(id);
    onBindThreadTab?.(id);
    return id;
  }, [activeThreadId, createThread, onActiveThreadChange, onBindThreadTab]);

  async function handleNewChat() {
    if (onOpenNewAgentTab) {
      onOpenNewAgentTab();
      setDraft("");
      return;
    }
    const id = await createThread({});
    onActiveThreadChange(id);
    onBindThreadTab?.(id);
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
      if (result.runId) {
        setActiveRunId(result.runId as Id<"agentRuns">);
      }
      if (!result.ok && result.error) {
        toast.error(result.error);
      } else if (result.creditsSpent > 0) {
        toast.message(`Agent turn · ${result.creditsSpent} credits`);
      } else if (result.usedByok) {
        toast.message("Agent turn · your API key");
      }
    } catch (error) {
      toast.error(friendlyConvexError(error, "Agent turn failed"));
    } finally {
      setBusy(false);
      setActiveRunId(null);
    }
  }

  async function handleCancel() {
    if (!activeRunId) return;
    try {
      await cancelRun({ runId: activeRunId });
      toast.message("Cancel requested");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not cancel"));
    }
  }

  async function handleRetry() {
    if (!latestFailedRun || busy) return;
    setBusy(true);
    try {
      const result = await retryRun({ runId: latestFailedRun._id });
      if (!result.ok && result.error) toast.error(result.error);
      else toast.message("Retried");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Retry failed"));
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
      toast.success(decision === "approve" ? "Approved — executing" : "Denied");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not update approval"));
    }
  }

  const hasMessages = Boolean(messages?.length);
  const canSend = Boolean(draft.trim()) && !busy;
  const recentTools = (toolCalls ?? []).slice(-8);

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
                <StudioEmptyLogoButton />
              </div>
            ) : null}

            {(messages ?? []).map((msg) => {
              if (msg.role === "tool") {
                return (
                  <div key={msg._id} className="studio-agent-tool-card">
                    <Wrench size={14} aria-hidden="true" />
                    <div>
                      <strong>{msg.toolName ?? "tool"}</strong>
                      <p>{msg.content}</p>
                    </div>
                  </div>
                );
              }

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
                {recentTools.length ? (
                  <span className="studio-agent-meta">
                    {" "}
                    · {recentTools[recentTools.length - 1]?.toolName}
                  </span>
                ) : null}
              </article>
            ) : null}
          </div>
          <div className="studio-chat-composer-gutter" aria-hidden="true" />
        </div>
      </div>

      <div className="studio-agent-composer-dock">
        <footer
          className={`studio-dm-composer is-split${isMobile ? " is-mobile-icons" : ""}`}
        >
          <div className="studio-dm-composer-box">
            <div className="studio-dm-composer-row is-message">
              <textarea
                ref={(el) => {
                  inputRef.current = el;
                  autosizeAgentComposer(el);
                }}
                value={draft}
                rows={2}
                enterKeyHint={isMobile ? "enter" : "send"}
                placeholder="Ask the agent to set up a project, generate, or work across Studio…"
                aria-label="Message Studio Agent"
                disabled={busy}
                onChange={(event) => {
                  setDraft(event.target.value);
                  autosizeAgentComposer(event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !isMobile) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
            </div>
            <div
              className="studio-dm-composer-row is-extras"
              role="toolbar"
              aria-label="Agent actions"
            >
              <button
                type="button"
                className="studio-settings-pill studio-dm-extra-pill"
                title="New agent chat"
                aria-label="New agent chat"
                onClick={() => void handleNewChat()}
              >
                <Plus aria-hidden="true" />
                <span className="studio-dm-extra-pill-label">New</span>
              </button>
              <button
                type="button"
                className="studio-settings-pill studio-dm-extra-pill"
                title="Agent settings"
                aria-label="Agent settings"
                onClick={() => onOpenAgentSettings?.()}
              >
                <Settings aria-hidden="true" />
                <span className="studio-dm-extra-pill-label">Settings</span>
              </button>
              {busy && activeRunId ? (
                <button
                  type="button"
                  className="studio-settings-pill studio-dm-extra-pill"
                  title="Cancel run"
                  aria-label="Cancel run"
                  onClick={() => void handleCancel()}
                >
                  <Square aria-hidden="true" />
                  <span className="studio-dm-extra-pill-label">Cancel</span>
                </button>
              ) : null}
              {!busy && latestFailedRun ? (
                <button
                  type="button"
                  className="studio-settings-pill studio-dm-extra-pill"
                  title="Retry last failed run"
                  aria-label="Retry last failed run"
                  onClick={() => void handleRetry()}
                >
                  <RotateCcw aria-hidden="true" />
                  <span className="studio-dm-extra-pill-label">Retry</span>
                </button>
              ) : null}
              <span className="studio-dm-extras-spacer" aria-hidden="true" />
              <button
                type="button"
                className="studio-composer-circle-btn studio-dm-composer-circle studio-composer-send-btn"
                disabled={!canSend}
                aria-label="Send"
                title="Send"
                onClick={() => void handleSend()}
              >
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
