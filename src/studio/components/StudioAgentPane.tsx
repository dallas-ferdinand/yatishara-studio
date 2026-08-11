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
import { ArrowUp, Loader2, Mic, Paperclip, Plus, RotateCcw, Settings, Square } from "lucide-react";
import { toast } from "sonner";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import {
  EXPLORER_DND_TYPE,
  readExplorerDragData,
} from "@/desk/lib/explorer-dnd";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
import { StudioEmptyLogoButton } from "./StudioEmptyLogoButton";
import { AgentTurnTimeline } from "./agent/AgentTurnTimeline";
import "./studio-messages.css";
import "./studio-agent.css";

const AGENT_ATTACH_EVENT = "studio-agent-attach";

type AgentAttachment = {
  id: string;
  kind?: string;
  label: string;
  path?: string;
  filename?: string;
  studioKind?: string;
  studioId?: string;
  mimeType?: string;
  thumbnailUrl?: string;
};

type StudioAgentPaneProps = {
  activeThreadId: Id<"agentThreads"> | null;
  onActiveThreadChange: (id: Id<"agentThreads"> | null) => void;
  onOpenAgentSettings?: () => void;
  /** After minting a thread, promote agent:main → agent:<id> like Create→thread. */
  onBindThreadTab?: (threadId: Id<"agentThreads">) => void;
  onOpenNewAgentTab?: () => void;
  onOpenFolder?: (folderId: Id<"folders">) => void;
  isMobile?: boolean;
};

function autosizeAgentComposer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  const next = Math.min(120, Math.max(36, el.scrollHeight));
  el.style.height = `${next}px`;
  el.classList.toggle("is-single-line", next <= 40);
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function kindFromMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function inferAgentAttachmentKind(entry: Record<string, unknown>): string {
  const direct = entry.mediaKind ?? entry.kind;
  if (direct === "image" || direct === "video" || direct === "audio") return direct;
  const mime = String(entry.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return entry.studioKind === "document" ? "file" : "context";
}

function entryToAgentAttachment(entry: Record<string, unknown>): AgentAttachment | null {
  const studioKind =
    typeof entry.studioKind === "string"
      ? entry.studioKind
      : entry.type === "dir"
        ? "folder"
        : undefined;
  const studioId = typeof entry.studioId === "string" ? entry.studioId : undefined;
  const label =
    (typeof entry.name === "string" && entry.name) ||
    (typeof entry.label === "string" && entry.label) ||
    (typeof entry.title === "string" && entry.title) ||
    "Reference";
  const path =
    (typeof entry.path === "string" && entry.path) ||
    (studioKind && studioId
      ? `/Studio/${studioKind === "element" ? "elements" : studioKind === "folder" ? "folders" : "assets"}/${studioId}`
      : "");
  const id = (studioKind && studioId ? `${studioKind}:${studioId}` : path || label).trim();
  if (!id) return null;
  return {
    id,
    kind: inferAgentAttachmentKind(entry),
    label,
    path: path || undefined,
    filename: typeof entry.name === "string" ? entry.name : label,
    studioKind,
    studioId,
    mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
    thumbnailUrl:
      typeof entry.thumbnailUrl === "string" ? entry.thumbnailUrl : undefined,
  };
}

function isComposerAttachmentToken(node: Node | null | undefined) {
  return node?.nodeType === Node.ELEMENT_NODE && (node as Element).classList?.contains("studio-inline-tag");
}

function readComposerEditorText(editor: HTMLDivElement | null) {
  if (!editor) return "";
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? "");
      return;
    }
    if (isComposerAttachmentToken(node)) {
      parts.push("\uFFFC");
      return;
    }
    node.childNodes.forEach(walk);
  };
  editor.childNodes.forEach(walk);
  return parts.join("").replace(/[ \t]+\n/g, "\n").replace(/\s{2,}/g, " ");
}

function createComposerAttachmentToken(attachment: AgentAttachment) {
  const token = document.createElement("span");
  token.className = "studio-inline-tag";
  token.contentEditable = "false";
  token.draggable = true;
  token.dataset.attachmentId = attachment.id;
  token.dataset.label = attachment.label;
  token.dataset.kind = attachment.kind ?? "file";
  token.dataset.tokenId = `tag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  token.dataset.attachment = JSON.stringify(attachment);
  token.addEventListener("dragstart", (event) => {
    token.classList.add("is-dragging");
    event.dataTransfer?.setData(
      "application/x-studio-composer-token",
      JSON.stringify({ ...attachment, tokenId: token.dataset.tokenId }),
    );
  });
  token.addEventListener("dragend", () => token.classList.remove("is-dragging"));

  const kind = document.createElement("span");
  kind.className = "studio-inline-tag-kind";
  kind.textContent =
    attachment.kind === "image" ? "IMG" : attachment.kind === "video" ? "VID" : attachment.kind === "audio" ? "AUD" : attachment.studioKind === "folder" ? "DIR" : "REF";
  const label = document.createElement("span");
  label.className = "studio-inline-tag-label";
  label.textContent = attachment.label || attachment.filename || "Reference";
  token.append(kind, label);
  return token;
}

function buildComposerEditorHtmlFromState(draft: string, attachments: AgentAttachment[] = []) {
  const shell = document.createElement("div");
  let tokenIndex = 0;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    shell.appendChild(document.createTextNode(buffer));
    buffer = "";
  };
  for (const ch of String(draft ?? "")) {
    if (ch === "\uFFFC") {
      flush();
      const attachment = attachments[tokenIndex++];
      if (attachment) {
        shell.appendChild(createComposerAttachmentToken(attachment));
        shell.appendChild(document.createTextNode(" "));
      }
      continue;
    }
    buffer += ch;
  }
  flush();
  while (tokenIndex < attachments.length) {
    const attachment = attachments[tokenIndex++];
    if (!attachment) continue;
    shell.appendChild(createComposerAttachmentToken(attachment));
    shell.appendChild(document.createTextNode(" "));
  }
  return shell.innerHTML;
}

function ensureSelectionInEditor(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
    return selection.getRangeAt(0);
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

function focusComposerEditorEnd(editor: HTMLDivElement | null) {
  if (!editor) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  editor.focus();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function normalizeComposerInsertRange(editor: HTMLDivElement | null, range: Range | null) {
  if (!editor || !range) return range;
  let node: Node | null = range.startContainer;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const token = (node as Element | null)?.closest?.(".studio-inline-tag");
  if (!token || !editor.contains(token)) return range;
  const next = document.createRange();
  next.setStartAfter(token);
  next.collapse(true);
  return next;
}

function insertComposerAttachmentToken(
  editor: HTMLDivElement | null,
  attachment: AgentAttachment,
  insertRange: Range | null = null,
) {
  if (!editor) return;
  const range = normalizeComposerInsertRange(
    editor,
    insertRange ? insertRange.cloneRange() : ensureSelectionInEditor(editor),
  );
  if (!range) return;
  const token = createComposerAttachmentToken(attachment);
  const spacer = document.createTextNode(" ");
  range.deleteContents();
  range.insertNode(spacer);
  range.insertNode(token);
  range.setStart(spacer, spacer.nodeValue?.length ?? 1);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.focus();
}

function readComposerTokenDragData(dataTransfer: DataTransfer | null) {
  try {
    const raw = dataTransfer?.getData("application/x-studio-composer-token");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function moveComposerDraggedToken(editor: HTMLDivElement | null, tokenId: string) {
  if (!editor || !tokenId) return;
  const token = editor.querySelector(`[data-token-id="${CSS.escape(tokenId)}"]`);
  const next = token?.nextSibling;
  token?.remove();
  if (next?.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.nodeValue ?? "")) next.remove();
}

function rangeFromPointInEditor(editor: HTMLDivElement | null, clientX: number, clientY: number) {
  if (!editor) return null;
  let range: Range | null = null;
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(clientX, clientY);
  } else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range || !editor.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  return range;
}

function previousTokenFromSelection(editor: HTMLDivElement | null) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !editor?.contains(selection.anchorNode)) {
    return null;
  }
  const { anchorNode, anchorOffset } = selection;
  if (anchorNode === editor) return editor.childNodes[anchorOffset - 1] ?? null;
  if (anchorNode?.nodeType === Node.TEXT_NODE) {
    if (anchorOffset > 0) return null;
    return anchorNode.previousSibling ?? null;
  }
  return null;
}

function removeComposerTokenBeforeCaret(
  editor: HTMLDivElement | null,
  setAttachments: (updater: (items: AgentAttachment[]) => AgentAttachment[]) => void,
) {
  if (!editor) return false;
  const token = previousTokenFromSelection(editor);
  if (!isComposerAttachmentToken(token)) return false;
  const tokenEl = token as HTMLElement;
  const id = tokenEl.dataset.attachmentId;
  const after = tokenEl.nextSibling;
  const range = document.createRange();
  range.setStartBefore(tokenEl);
  range.collapse(true);
  tokenEl.remove();
  if (after?.nodeType === Node.TEXT_NODE && /^\s*$/.test(after.nodeValue ?? "")) after.remove();
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (id) setAttachments((items) => items.filter((item) => item.id !== id));
  return true;
}

function moveCaretAcrossComposerToken(editor: HTMLDivElement | null, direction: "left" | "right") {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !editor?.contains(selection.anchorNode)) return false;
  const { anchorNode, anchorOffset } = selection;
  const isLeft = direction === "left";
  if (anchorNode === editor) {
    const sibling = editor.childNodes[isLeft ? anchorOffset - 1 : anchorOffset];
    if (!isComposerAttachmentToken(sibling)) return false;
    const range = document.createRange();
    if (isLeft) range.setStartBefore(sibling);
    else range.setStartAfter(sibling);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  return false;
}

export function StudioAgentPane({
  activeThreadId,
  onActiveThreadChange,
  onOpenAgentSettings,
  onBindThreadTab,
  onOpenNewAgentTab,
  onOpenFolder,
  isMobile = false,
}: StudioAgentPaneProps) {
  const createThread = useMutation(api.agentThreads.create);
  const decideApproval = useMutation(api.agentApprovals.decide);
  const cancelRun = useMutation(api.agentRuns.requestCancel);
  const ensureMessagesFolder = useMutation(api.folders.ensureMessagesFolderForMe);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);
  const sendTurn = useAction(api.agentActions.sendTurn);
  const retryRun = useAction(api.agentActions.retryRun);
  const transcribeVoice = useAction(api.voiceActions.transcribe);

  const [draft, setDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([]);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [activeRunId, setActiveRunId] = useState<Id<"agentRuns"> | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const stickToBottomRef = useRef(true);
  const micBusyRef = useRef(false);
  const micStartedRef = useRef(0);

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

  const hasTurns = useMemo(() => {
    const userCount = (messages ?? []).filter((m) => m.role === "user").length;
    return userCount > 0 || busy;
  }, [messages, busy]);

  const latestFailedRun = useMemo(
    () => (runs ?? []).find((row: { status: string }) => row.status === "failed" || row.status === "cancelled"),
    [runs],
  );
  const cancellableRunId = useMemo(
    () =>
      activeRunId ??
      ((runs ?? []).find((row: { status: string }) =>
        ["queued", "running", "awaiting_approval"].includes(row.status),
      )?._id ?? null),
    [activeRunId, runs],
  );

  useEffect(() => {
    const el = streamRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length, toolCalls?.length, busy]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = buildComposerEditorHtmlFromState(draft, attachments);
    if (editor.innerHTML !== html) editor.innerHTML = html;
  }, [draft, attachments]);

  useEffect(() => {
    function onAttach(event: Event) {
      const detail = (event as CustomEvent<{ attachment?: AgentAttachment }>).detail;
      const attachment = detail?.attachment;
      if (!attachment?.id) return;
      setAttachments((prev) => {
        if (prev.some((item) => item.id === attachment.id)) return prev;
        insertComposerAttachmentToken(editorRef.current, attachment);
        setDraft(readComposerEditorText(editorRef.current));
        return [...prev, attachment];
      });
    }
    window.addEventListener(AGENT_ATTACH_EVENT, onAttach as EventListener);
    return () => window.removeEventListener(AGENT_ATTACH_EVENT, onAttach as EventListener);
  }, []);

  useEffect(() => {
    return () => {
      void import("@/desk/lib/voice-desk")
        .then((voice) => voice.cancelRecording())
        .catch(() => {});
    };
  }, []);

  const attachAgentEntry = useCallback((
    entry: Record<string, unknown> | null | undefined,
    insertRange: Range | null = null,
  ) => {
    const attachment = entry ? entryToAgentAttachment(entry) : null;
    if (!attachment?.id) return false;
    setAttachments((prev) => {
      if (prev.some((item) => item.id === attachment.id)) return prev;
      insertComposerAttachmentToken(editorRef.current, attachment, insertRange);
      setDraft(readComposerEditorText(editorRef.current));
      return [...prev, attachment];
    });
    return true;
  }, []);

  const uploadAgentFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      const list = files ? Array.from(files) : [];
      if (!list.length) return;
      setUploading(true);
      try {
        const folderId = await ensureMessagesFolder({});
        const nextAttachments: AgentAttachment[] = [];
        for (const file of list) {
          const mimeType = file.type || "application/octet-stream";
          const kind = kindFromMime(mimeType);
          const assetId = await uploadStudioAsset({
            file,
            folderId,
            kind,
            reserveUpload,
            commitStagingUpload,
            name: file.name,
          });
          nextAttachments.push({
            id: `asset:${assetId}`,
            kind,
            label: file.name,
            filename: file.name,
            path: `/Studio/assets/${assetId}`,
            studioKind: "asset",
            studioId: assetId,
            mimeType,
          });
        }
        setAttachments((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...nextAttachments.filter((item) => !seen.has(item.id))];
        });
      } catch (error) {
        toast.error(friendlyConvexError(error, "Upload failed"));
      } finally {
        setUploading(false);
      }
    },
    [commitStagingUpload, ensureMessagesFolder, reserveUpload],
  );

  const ensureThread = useCallback(async () => {
    if (activeThreadId) return activeThreadId;
    const id = await createThread({});
    onActiveThreadChange(id);
    onBindThreadTab?.(id);
    return id;
  }, [activeThreadId, createThread, onActiveThreadChange, onBindThreadTab]);

  async function toggleVoice() {
    if (micBusyRef.current || uploading || busy || transcribing) return;
    try {
      if (recording) {
        micBusyRef.current = true;
        setRecording(false);
        setTranscribing(true);
        const voice = await import("@/desk/lib/voice-desk");
        const elapsed = Date.now() - micStartedRef.current;
        if (elapsed < 700) {
          await voice.cancelRecording();
          throw new Error("No audio detected. Tap mic, speak, then tap again to stop.");
        }
        const data = await voice.stopRecording();
        if (!data?.blob) {
          throw new Error("No audio detected. Tap mic, speak, then tap again to stop.");
        }
        const result = await transcribeVoice({
          audioBase64: await blobToBase64(data.blob),
          mimetype: data.mimetype || data.blob.type || "audio/webm",
        });
        const text = result?.text?.trim();
        if (!text) {
          throw new Error("No speech detected. Speak a bit longer, then tap the mic to stop.");
        }
        setDraft((prev) => `${prev}${prev ? " " : ""}${text}`);
        return;
      }

      micBusyRef.current = true;
      const voice = await import("@/desk/lib/voice-desk");
      await voice.startRecording();
      micStartedRef.current = Date.now();
      setRecording(true);
    } catch (error) {
      setRecording(false);
      toast.error(friendlyConvexError(error, "Couldn't turn that into text. Try again."));
    } finally {
      setTranscribing(false);
      micBusyRef.current = false;
    }
  }

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
    if ((!text && attachments.length === 0) || busy) return;
    setBusy(true);
    stickToBottomRef.current = true;
    try {
      const threadId = await ensureThread();
      setPendingUserText(text);
      setPendingAttachments(attachments);
      setDraft("");
      setAttachments([]);
      const result = await (sendTurn as any)({
        threadId,
        message: text,
        attachments: attachments.map((item) => ({
          studioKind: item.studioKind,
          studioId: item.studioId,
          kind: item.kind,
          label: item.label,
          path: item.path,
        })),
      });
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
      setPendingUserText(null);
      setPendingAttachments([]);
    }
  }

  async function handleCancel() {
    if (!cancellableRunId) return;
    try {
      await cancelRun({ runId: cancellableRunId });
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

  const hasMessages = hasTurns;
  const canSend = (Boolean(draft.trim()) || attachments.length > 0) && !busy;

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
            {!hasTurns ? (
              <div className="studio-agent-empty-hero">
                <StudioEmptyLogoButton />
              </div>
            ) : (
              <AgentTurnTimeline
                messages={(messages ?? []) as any}
                toolCalls={toolCalls ?? []}
                runs={runs ?? []}
                approvals={approvals ?? []}
                busy={busy}
                activeRunId={cancellableRunId}
                pendingUserText={pendingUserText}
                pendingAttachments={pendingAttachments}
                onDecideApproval={handleDecide}
                onOpenFolder={onOpenFolder}
              />
            )}
          </div>
          <div className="studio-chat-composer-gutter" aria-hidden="true" />
        </div>
      </div>

      <div className="studio-agent-composer-dock">
        <footer
          className={`studio-dm-composer is-split${isMobile ? " is-mobile-icons" : ""}${dragOver ? " is-drop-target is-touch-drop-hover" : ""}`}
          data-drop-target="composer"
          onDragEnter={() => setDragOver(true)}
          onDragOver={(event) => {
            const types = Array.from(event.dataTransfer?.types ?? []);
            if (
              !types.includes(EXPLORER_DND_TYPE) &&
              !types.includes("application/x-studio-composer-token")
            ) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragOver(false);
            }
          }}
          onDrop={(event) => {
            setDragOver(false);
            const tokenAttachment = readComposerTokenDragData(event.dataTransfer) as
              | (AgentAttachment & { tokenId?: string })
              | null;
            const entry = readExplorerDragData(event.dataTransfer) as
              | Record<string, unknown>
              | null;
            event.preventDefault();
            if (tokenAttachment) {
              moveComposerDraggedToken(editorRef.current, tokenAttachment.tokenId ?? "");
              insertComposerAttachmentToken(
                editorRef.current,
                tokenAttachment,
                rangeFromPointInEditor(editorRef.current, event.clientX, event.clientY),
              );
              setDraft(readComposerEditorText(editorRef.current));
              return;
            }
            if (entry) {
              attachAgentEntry(
                entry,
                rangeFromPointInEditor(editorRef.current, event.clientX, event.clientY),
              );
              return;
            }
            if (event.dataTransfer?.files?.length) {
              void uploadAgentFiles(event.dataTransfer.files);
            }
          }}
        >
          <input
            ref={uploadInputRef}
            className="sr-only"
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            onChange={(event) => {
              void uploadAgentFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <div
            className={`studio-dm-composer-box${recording ? " is-recording" : ""}${transcribing ? " is-transcribing" : ""}${dragOver ? " is-drop-target is-touch-drop-hover" : ""}`}
            data-drop-target="composer"
          >
            <div
              className="studio-dm-composer-row is-message"
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                focusComposerEditorEnd(editorRef.current);
              }}
            >
              <div
                ref={editorRef}
                role="textbox"
                aria-multiline="true"
                contentEditable={!busy}
                suppressContentEditableWarning
                data-placeholder="Ask the agent to set up a project, generate, or work across Studio…"
                className="cursor-composer-mention-editor"
                onInput={() => {
                  setDraft(readComposerEditorText(editorRef.current));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !isMobile) {
                    event.preventDefault();
                    void handleSend();
                    return;
                  }
                  if (event.key === "Backspace") {
                    if (removeComposerTokenBeforeCaret(editorRef.current, setAttachments)) {
                      event.preventDefault();
                      setDraft(readComposerEditorText(editorRef.current));
                    }
                    return;
                  }
                  if (
                    (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                    moveCaretAcrossComposerToken(
                      editorRef.current,
                      event.key === "ArrowLeft" ? "left" : "right",
                    )
                  ) {
                    event.preventDefault();
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
                className="studio-composer-circle-btn studio-dm-composer-circle"
                title={uploading ? "Uploading..." : "Upload media"}
                aria-label={uploading ? "Uploading media" : "Upload media"}
                disabled={busy || recording || transcribing}
                onClick={() => uploadInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 size={14} strokeWidth={2.25} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Paperclip size={14} strokeWidth={2.25} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                className={`studio-composer-circle-btn studio-dm-composer-circle cursor-composer-mic${recording ? " is-recording" : ""}${transcribing ? " is-transcribing" : ""}`}
                title={transcribing ? "Turning voice into text..." : recording ? "Stop recording" : "Use your voice"}
                aria-label={transcribing ? "Turning voice into text" : recording ? "Stop recording" : "Use your voice"}
                onClick={() => void toggleVoice()}
                disabled={transcribing || uploading || busy}
              >
                {transcribing ? (
                  <Loader2 size={14} strokeWidth={2.25} className="animate-spin" aria-hidden="true" />
                ) : recording ? (
                  <span className="studio-composer-mic-dot" aria-hidden="true" />
                ) : (
                  <Mic size={14} strokeWidth={2.25} aria-hidden="true" />
                )}
              </button>
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
                disabled={!busy && !canSend}
                aria-label={busy ? "Stop" : "Send"}
                title={busy ? "Stop" : "Send"}
                onClick={() => void (busy ? handleCancel() : handleSend())}
              >
                {busy ? <Square aria-hidden="true" /> : (
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
