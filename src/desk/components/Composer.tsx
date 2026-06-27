// @ts-nocheck
"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Icon } from "./Icons";
import { AttachmentChipRow } from "./AttachmentChip";
import { AttachmentPreviewSheet } from "./AttachmentPreviewSheet";
import { contextLabel } from "@mos-app/composer-paste.js";
import { updatePendingAttachment } from "@mos-app/chat-prefs.js";
import {
  sendChatMessage,
  getPendingAttachments,
  removeAttachment,
  setChatAgentPrefs,
  stopRun,
  queueDepth,
  getLiveActivityStatus,
  getPendingQuestionPrompt,
  getQueuedMessages,
  clearMessageQueue,
  queuedPreviewLine,
  removeQueuedItem,
  multitaskStatusLine,
  isChatBusy,
  ensureChatHealed,
  api,
  store,
  setComposerDraft,
  clearComposerDraft,
} from "@/desk/lib/agent-run";
import {
  RefPickerScope,
  parseRefAtContext,
  scopedComposerPrefix,
  scopeLabel,
} from "@/desk/lib/ref-picker";
import { searchRefPickerResults, refRowSubtitle, groupRefResults } from "@/desk/lib/ref-picker-search";
import { ComposerMentionEditor } from "./ComposerMentionEditor";
import {
  getComposerTextAndCaret,
  getComposerRefTextAndCaret,
  replaceComposerRefRange,
  insertMentionAtCaret,
  removeMentionById,
  refItemToAttachment,
  workspaceEntryToAttachment,
  workspaceTabToAttachment,
  serializeComposerContent,
  blocksToPlainText,
  mergeAttachmentsIntoBlocks,
  updateMentionNode,
  collectInlineMentionIds,
  findMentionAttachmentId,
  resolveComposerDropCaret,
  handleComposerMentionKeydown,
  syncInlineAttachmentsFromEditor,
  pruneOrphanComposerMentions,
  refQueryDeleteEnd,
} from "@/desk/lib/composer-mentions";
import { fileExt, fileViewerKind, refPickerIcon } from "@/desk/lib/file-kind";
import { attachmentIsImage } from "@/desk/lib/attachment-model.js";
import { QueuedMessagesStrip } from "./QueuedMessagesStrip";
import { chatAgentSummary, clearChatAgentPrefs, addPendingAttachment } from "@mos-app/chat-prefs.js";
import { wireComposerPaste, pasteContextFromClipboard, editorContextLabel, terminalContextLabel } from "@mos-app/composer-paste.js";
import { AgentLiveStatusStrip } from "./AgentLiveStatusStrip";
import { EXPLORER_DND_TYPE, readExplorerDragData } from "@/desk/lib/explorer-dnd";
import { isAutoModel, AUTO_MODEL } from "@mos-app/model-choice.js";
import { updatePrefs } from "@mos-app/agent-prefs.js";
import { uploadChatFile } from "@mos-app/file-transfer.js";
import * as voice from "@/desk/lib/voice-desk";
import { ComposerMobileMenu } from "./ComposerMobileMenu";
import { ContextWindowRing } from "./ContextWindowRing";

const COMPOSER_TEXTAREA_MAX_PX = 168;
const DEFAULT_SOPHIE_EXPRESSION = {
  face: "😐",
  label: "plain",
  accent: "#c4a574",
  mood: "plain",
  energy: "steady",
  signal: "neutral",
  tension: "",
  care: "",
  needsQuiet: false,
};
const SOPHIE_EXPRESSION_PRESETS = [
  {
    key: "playful",
    label: "Playful",
    face: "😏",
    chosenTone: "playful",
    uiSignal: "warm-violet",
    currentMood: "playful, focused",
    energy: "bright-medium",
    colorAccent: "#e879f9",
    colorScheme: "fuchsia",
  },
  {
    key: "warm",
    label: "Warm",
    face: "🙂",
    chosenTone: "warm",
    uiSignal: "warm",
    currentMood: "present, practical",
    energy: "medium",
    colorAccent: "#fb7185",
    colorScheme: "rose",
  },
  {
    key: "serious",
    label: "Sharp",
    face: "🤨",
    chosenTone: "serious",
    uiSignal: "serious",
    currentMood: "focused, no theater",
    energy: "steady",
    colorAccent: "#818cf8",
    colorScheme: "indigo",
  },
  {
    key: "quiet",
    label: "Quiet",
    face: "😌",
    chosenTone: "calm",
    uiSignal: "calm",
    currentMood: "quiet, attentive",
    energy: "low-medium",
    colorAccent: "#38bdf8",
    colorScheme: "sky",
    needsQuiet: true,
  },
];

function sophieExpressionView(expression = {}, theme = {}) {
  return {
    face: theme.face ?? expression.face ?? DEFAULT_SOPHIE_EXPRESSION.face,
    label: theme.label ?? expression.chosenTone ?? DEFAULT_SOPHIE_EXPRESSION.label,
    accent: theme.accent ?? expression.colorAccent ?? DEFAULT_SOPHIE_EXPRESSION.accent,
    mood: expression.currentMood ?? DEFAULT_SOPHIE_EXPRESSION.mood,
    energy: expression.energy ?? DEFAULT_SOPHIE_EXPRESSION.energy,
    signal: expression.uiSignal ?? expression.chosenTone ?? DEFAULT_SOPHIE_EXPRESSION.signal,
    tension: expression.feltTension ?? DEFAULT_SOPHIE_EXPRESSION.tension,
    care: expression.careSignal ?? DEFAULT_SOPHIE_EXPRESSION.care,
    needsQuiet: Boolean(expression.needsQuiet ?? DEFAULT_SOPHIE_EXPRESSION.needsQuiet),
  };
}

function newAttachmentId() {
  return `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function filesFromDataTransfer(dataTransfer) {
  if (!dataTransfer?.files?.length) return [];
  return [...dataTransfer.files].filter((f) => f?.name);
}

function resizeComposerTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_TEXTAREA_MAX_PX)}px`;
}

export function Composer({
  chatState,
  chatId,
  workspaceId,
  chat,
  onBump,
  onFocus,
  onBlur,
  health,
  activeSubagentCallId,
  keyboardOpen = false,
  isMobile = false,
  onRequestHeal,
  healBusy = false,
  showHealInComposer = false,
  shellTerminals,
  openFileTabs = [],
  embedded = false,
  inlineEdit = null,
  onEngagedChange = null,
}) {
  const isInline = Boolean(inlineEdit);
  const [input, setInput] = useState("");
  const [refScope, setRefScope] = useState(RefPickerScope.root);
  const [modelSearch, setModelSearch] = useState("");
  const [models, setModels] = useState([]);
  const [refOpen, setRefOpen] = useState(false);
  const [refQuery, setRefQuery] = useState("");
  const [refResults, setRefResults] = useState([]);
  const [refHighlightIndex, setRefHighlightIndex] = useState(0);
  const [refLoading, setRefLoading] = useState(false);
  const [mcpServers, setMcpServers] = useState([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [sophieExpression, setSophieExpression] = useState(DEFAULT_SOPHIE_EXPRESSION);
  const [sophiePanelOpen, setSophiePanelOpen] = useState(false);
  const [sophieExpressionBusy, setSophieExpressionBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const fileRef = useRef(null);
  const sendingRef = useRef(false);
  const sentClearUntilRef = useRef(0);
  const textareaRef = useRef(null);
  const submitBtnRef = useRef(null);

  const attachInlineRef = useRef(null);
  const pasteCtxRef = useRef({});
  const removeAttachmentRef = useRef(() => {});
  const micStartedRef = useRef(0);
  const micBusyRef = useRef(false);
  const dropInsertAtRef = useRef(null);
  const activeRefCtxRef = useRef(null);

  useEffect(() => {
    const onSelection = (e) => {
      const { text, path, source } = e.detail ?? {};
      const trimmed = String(text ?? "").trim();
      if (!trimmed || !chatId) return;
      const label =
        source === "terminal"
          ? terminalContextLabel(trimmed)
          : editorContextLabel(trimmed, path);
      attachInlineRef.current?.({ kind: "context", text: trimmed, label });
      textareaRef.current?.focus();
    };
    window.addEventListener("desk-add-selection", onSelection);
    return () => window.removeEventListener("desk-add-selection", onSelection);
  }, [chatId]);

  useEffect(() => {
    const onExpression = (event) => {
      const detail = event.detail ?? {};
      setSophieExpression(sophieExpressionView(detail.expression ?? {}, detail.theme ?? {}));
    };
    window.addEventListener("mercuryos-sophie-expression-change", onExpression);
    return () => window.removeEventListener("mercuryos-sophie-expression-change", onExpression);
  }, []);

  const inlineEditKeyRef = useRef(null);
  const composerChatKeyRef = useRef(null);

  const activeChatRow = chatState.chats.find((c) => c.id === chatId);
  const composerDraft = activeChatRow?.composerDraft ?? "";

  useLayoutEffect(() => {
    if (isInline) return;
    const chatKey = chatId ?? "";
    if (composerChatKeyRef.current === chatKey) return;
    composerChatKeyRef.current = chatKey;

    const draft = Date.now() < sentClearUntilRef.current ? "" : composerDraft;
    const el = textareaRef.current;
    if (el) {
      el.textContent = "";
      if (draft) el.appendChild(el.ownerDocument.createTextNode(draft));
      resizeComposerTextarea(el);
    }
    setInput(draft);
    setRefOpen(false);
    setRefScope(RefPickerScope.root);
    setRefQuery("");
    setComposerMenuOpen(false);
    setDragOver(false);
    setPreviewAttachment(null);
    activeRefCtxRef.current = null;
  }, [chatId, isInline, composerDraft]);

  useEffect(() => {
    if (isInline) {
      const key = `${chatId}:${inlineEdit?.editKey ?? ""}`;
      if (inlineEditKeyRef.current !== key) {
        inlineEditKeyRef.current = key;
        setInput(inlineEdit.text ?? "");
      }
      setRefOpen(false);
      setRefScope(RefPickerScope.root);
      setRefQuery("");
      setComposerMenuOpen(false);
      setDragOver(false);
      return;
    }
    inlineEditKeyRef.current = null;
  }, [chatId, isInline, inlineEdit?.editKey, inlineEdit?.text]);

  useEffect(() => {
    if (!chatId) return;
    const row = chatState.chats.find((c) => c.id === chatId);
    if (row?.status !== "streaming" && row?.status !== "awaiting") return;
    ensureChatHealed(chatState, chatId, workspaceId, onBump);
  }, [chatId, workspaceId, onBump]);

  useLayoutEffect(() => {
    resizeComposerTextarea(textareaRef.current);
  }, [chatId, input]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const ctx = pasteCtxRef.current;
    wireComposerPaste(el, {
      chatState: ctx.chatState,
      getActiveChatId: () => ctx.chatId,
      onAttach: () => ctx.onBump?.(),
      onInlineAttach: (partial) => ctx.attachWithInlineMention?.(partial),
      toast: (title, msg) => {
        const state = ctx.chatState;
        const id = ctx.chatId;
        if (!state || !id) return;
        store.addMessage(state, id, { role: "system", content: `${title}: ${msg}` });
        ctx.onBump?.();
      },
    });
  }, [chatId]);

  const pending = isInline
    ? (Array.isArray(inlineEdit.attachments) ? inlineEdit.attachments : [])
    : getPendingAttachments(chatState, chatId);

  const stripAttachments = pending.filter((a) => {
    if (attachmentIsImage(a)) return false;
    if (!a.inline) return true;
    if (a.kind === "context") return false;
    const path = a.workspacePath ?? a.path ?? a.filename ?? "";
    const mediaKind = fileViewerKind(fileExt(path));
    if (mediaKind === "image") return false;
    return mediaKind === "video";
  });

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const ids = collectInlineMentionIds(el);
    for (const att of pending) {
      if (att?.id && att.inline && ids.has(att.id)) {
        updateMentionNode(el, att, { workspaceId });
      }
    }
  }, [pending, workspaceId]);

  const attachWithInlineMention = (attachment, { replaceFrom = null, replaceTo = null, at = null, deleteLiteral = null } = {}) => {
    const id = attachment.id ?? newAttachmentId();
    const att = { ...attachment, id, inline: true };
    const insertAt =
      at != null
        ? at
        : dropInsertAtRef.current != null
          ? dropInsertAtRef.current
          : null;
    const refPos = getComposerRefTextAndCaret(textareaRef.current);
    const parsed =
      insertAt == null && replaceFrom == null
        ? parseRefAtContext(refPos.text, refPos.caret)
        : null;
    const ctx =
      replaceFrom != null && Number.isFinite(replaceFrom)
        ? {
            atStart: replaceFrom,
            deleteEnd:
              replaceTo != null && Number.isFinite(replaceTo)
                ? replaceTo
                : deleteLiteral
                  ? replaceFrom + deleteLiteral.length
                  : refPos.caret,
          }
        : parsed
          ? {
              atStart: parsed.atStart,
              deleteEnd: refQueryDeleteEnd(parsed.atStart, parsed.rawAfterAt),
            }
          : null;
    const literal =
      deleteLiteral ??
      (parsed?.rawAfterAt != null ? `@${parsed.rawAfterAt}` : null);
    insertMentionAtCaret(textareaRef.current, att, {
      replaceFrom: insertAt != null ? null : ctx?.atStart,
      replaceTo: insertAt != null ? null : ctx?.deleteEnd,
      deleteLiteral: insertAt != null ? null : literal,
      at: insertAt,
      workspaceId,
    });
    if (textareaRef.current) {
      dropInsertAtRef.current = getComposerTextAndCaret(textareaRef.current).caret;
      syncInputFromEditor({ skipRefPicker: ctx != null });
    }
    if (isInline) {
      patchInlineAttachments((list) => [...(list ?? []), att]);
    } else {
      addPendingAttachment(chatState, chatId, att);
      store.saveChats(chatState);
    }
    onBump();
    return att;
  };

  attachInlineRef.current = attachWithInlineMention;
  pasteCtxRef.current = { chatState, chatId, onBump, attachWithInlineMention };

  const openMentionPreview = (mentionId) => {
    const att = pending.find((a) => a.id === mentionId);
    if (att) {
      setPreviewAttachment(att);
      return;
    }
    const node = textareaRef.current?.querySelector(`[data-mention-id="${mentionId}"]`);
    if (!node) return;
    setPreviewAttachment({
      id: mentionId,
      kind: node.dataset.mentionKind ?? "ref",
      label: node.title || "Attachment",
      inline: true,
      path: node.dataset.mentionPath || undefined,
      workspacePath: node.dataset.mentionPath || undefined,
      stored: node.dataset.mentionStored || undefined,
      filename: node.title || undefined,
    });
  };

  useEffect(() => {
    if (isInline || !onEngagedChange) return;
    const engaged = Boolean(
      input.trim() || pending.length || recording || transcribing,
    );
    onEngagedChange(engaged);
  }, [isInline, onEngagedChange, input, pending.length, recording, transcribing]);

  const patchInlineAttachments = (updater) => {
    inlineEdit.onAttachmentsChange?.(updater);
    onBump();
  };

  const attachComposerFile = async (file, { insertAt = null } = {}) => {
    const at =
      insertAt != null
        ? insertAt
        : dropInsertAtRef.current != null
          ? dropInsertAtRef.current
          : getComposerTextAndCaret(textareaRef.current).caret;
    const attachId = newAttachmentId();
    const isImage = file.type?.startsWith("image/");
    const placeholderAtt = {
      id: attachId,
      kind: isImage ? "image" : "file",
      filename: file.name,
      label: file.name,
      uploading: true,
      progress: 0,
      inline: true,
    };

    const trackPending = (att) => {
      if (isInline) {
        patchInlineAttachments((list) => [...(list ?? []), att]);
      } else {
        addPendingAttachment(chatState, chatId, att);
        store.saveChats(chatState);
        onBump();
      }
    };

    const patchPending = (patch) => {
      if (isInline) {
        patchInlineAttachments((list) =>
          (list ?? []).map((a) => (a.id === attachId ? { ...a, ...patch } : a)),
        );
      } else {
        updatePendingAttachment(chatState, chatId, attachId, patch);
        store.saveChats(chatState);
        onBump();
      }
    };

    const dropPending = () => {
      removeMentionById(textareaRef.current, attachId);
      if (isInline) {
        patchInlineAttachments((list) => (list ?? []).filter((a) => a.id !== attachId));
      } else {
        removeAttachment(chatState, chatId, attachId);
        onBump();
      }
    };

    trackPending(placeholderAtt);
    if (isImage) {
      insertMentionAtCaret(textareaRef.current, placeholderAtt, { workspaceId, at });
      syncInputFromEditor();
    }

    try {
      const uploaded = await uploadChatFile(file, {
        onProgress: (p) => patchPending({ progress: p }),
      });
      if (uploaded.ok === false) throw new Error(uploaded.error ?? "Upload failed");
      const previewUrl = isImage && uploaded.stored ? api.uploadRawUrl(uploaded.stored) : null;
      const finalAtt = {
        ...placeholderAtt,
        uploading: false,
        progress: 100,
        path: uploaded.path,
        stored: uploaded.stored,
        size: uploaded.size,
        previewUrl,
      };
      patchPending(finalAtt);
      if (isImage) {
        updateMentionNode(textareaRef.current, finalAtt, { workspaceId });
      } else {
        insertMentionAtCaret(textareaRef.current, finalAtt, { workspaceId, at });
      }
      if (textareaRef.current) {
        dropInsertAtRef.current = getComposerTextAndCaret(textareaRef.current).caret;
        syncInputFromEditor();
      }
    } catch (err) {
      dropPending();
      throw err;
    }
  };

  const removeComposerAttachment = (attachId) => {
    removeMentionById(textareaRef.current, attachId);
    if (isInline) {
      patchInlineAttachments((list) => (list ?? []).filter((a) => a.id !== attachId));
      return;
    }
    removeAttachment(chatState, chatId, attachId);
    onBump();
  };
  removeAttachmentRef.current = removeComposerAttachment;

  const pushInlineTab = (tab, { at = null, clientX = null, clientY = null } = {}) => {
    const att = workspaceTabToAttachment(tab, newAttachmentId());
    if (!att) return;
    const insertAt =
      at ??
      (clientX != null && clientY != null
        ? resolveComposerDropCaret(textareaRef.current, clientX, clientY)
        : dropInsertAtRef.current);
    attachWithInlineMention(att, { at: insertAt });
  };

  const pushInlineWorkspaceEntry = (entry, { at = null } = {}) => {
    const att = workspaceEntryToAttachment(entry, newAttachmentId());
    attachWithInlineMention(att, { at });
  };
  const summary = chat ? chatAgentSummary(chat) : chatAgentSummary({ model: null, mode: null });
  const streaming = chat?.status === "streaming";
  const awaiting = chat?.status === "awaiting";
  const sending = isChatBusy(chatState, chatId);
  const queued = queueDepth(chatId, chatState);
  const queuedItems = getQueuedMessages(chatState, chatId);
  const queuePreview = queuedPreviewLine(chatState, chatId);
  const liveStatus =
    !keyboardOpen && !activeSubagentCallId
      ? getLiveActivityStatus(chatState, chatId)
      : activeSubagentCallId
        ? getLiveActivityStatus(chatState, chatId, { subagentCallId: activeSubagentCallId })
        : null;
  const liveBlocksSig =
    chat?.messages?.at(-1)?.role === "assistant" ? chat.messages.at(-1)?.flowSig ?? "" : "";
  const multitaskLine = multitaskStatusLine(health, chatState);
  const questionPrompt = awaiting ? getPendingQuestionPrompt(chatState, chatId) : null;

  useEffect(() => {
    api.fetchModels().then((m) => setModels(m ?? [])).catch(() => {});
    api.fetchMcps().then((s) => setMcpServers(s ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!streaming && !awaiting) return;
    const t = setInterval(() => setTick((n) => n + 1), 800);
    return () => clearInterval(t);
  }, [streaming, awaiting, chatId, liveBlocksSig]);

  useEffect(() => {
    if (!refOpen) return;
    let cancelled = false;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setRefLoading(true);
      try {
        const items = await searchRefPickerResults({
          refScope,
          refQuery,
          workspaceId,
          openFileTabs,
          shellTerminals,
          chats: chatState.chats,
          mcpServers,
          signal: ac.signal,
        });
        if (!cancelled) {
          setRefResults(items ?? []);
          setRefHighlightIndex(0);
        }
      } catch (err) {
        if (!cancelled && err?.name !== "AbortError") setRefResults([]);
      } finally {
        if (!cancelled) setRefLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(t);
    };
  }, [refQuery, refOpen, workspaceId, refScope, shellTerminals, chatState.chats, openFileTabs, mcpServers]);

  const placeholder = () => {
    if (isInline) return "Edit message…";
    if (awaiting) {
      return questionPrompt
        ? `Answer in the card above: ${questionPrompt.slice(0, 56)}${questionPrompt.length > 56 ? "…" : ""}`
        : "Answer in the card above…";
    }
    return "Add a follow-up";
  };

  const setComposerInput = (valueOrFn) => {
    setInput((prev) => {
      const next = typeof valueOrFn === "function" ? valueOrFn(prev) : valueOrFn;
      if (isInline) inlineEdit.onTextChange?.(next);
      else setComposerDraft(chatState, chatId, next);
      return next;
    });
  };

  useEffect(() => {
    const onFill = (e) => {
      const { text, chatId: targetId } = e.detail ?? {};
      if (!text || (targetId && targetId !== chatId)) return;
      setComposerInput(text);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        resizeComposerTextarea(textareaRef.current);
      });
    };
    window.addEventListener("mercuryos-composer-fill", onFill);
    return () => window.removeEventListener("mercuryos-composer-fill", onFill);
  }, [chatId, isInline, chatState]);

  useEffect(() => {
    const onSendFromUi = async (e) => {
      const { text, chatId: targetId, workspaceId: wsId } = e.detail ?? {};
      const trimmed = String(text ?? "").trim();
      if (!trimmed || (targetId && targetId !== chatId)) return;
      if (isInline) return;
      if (sendingRef.current) return;
      sendingRef.current = true;
      try {
        await sendChatMessage(chatState, chatId, trimmed, wsId ?? workspaceId, onBump);
      } finally {
        sendingRef.current = false;
      }
    };
    window.addEventListener("mercuryos-composer-send", onSendFromUi);
    return () => window.removeEventListener("mercuryos-composer-send", onSendFromUi);
  }, [chatId, chatState, workspaceId, onBump, isInline]);

  const onSend = async () => {
    const currentPending = isInline
      ? (Array.isArray(inlineEdit.attachments) ? inlineEdit.attachments : [])
      : getPendingAttachments(chatState, chatId);
    const el = textareaRef.current;
    if (el) pruneOrphanComposerMentions(el, currentPending);
    const rawBlocks = serializeComposerContent(el);
    const blocks = mergeAttachmentsIntoBlocks(rawBlocks, currentPending);
    const plain = blocksToPlainText(blocks, currentPending).trim();
    const text = plain || input.trim();
    if (!text && !currentPending.length) return;
    if (isInline) {
      inlineEdit.onSubmit?.({
        text,
        attachments: currentPending,
        contentBlocks: blocks.length ? blocks : undefined,
        anchorEl: submitBtnRef.current,
      });
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    sentClearUntilRef.current = Date.now() + 2500;
    setInput("");
    clearComposerDraft(chatState, chatId);
    setRefOpen(false);
    setComposerMenuOpen(false);
    dropInsertAtRef.current = null;
    if (textareaRef.current) {
      textareaRef.current.textContent = "";
      resizeComposerTextarea(textareaRef.current);
    }
    try {
      await sendChatMessage(chatState, chatId, text, workspaceId, onBump, {
        contentBlocks: blocks.length ? blocks : undefined,
      });
    } finally {
      sendingRef.current = false;
    }
  };

  const canSend = Boolean(input.trim() || pending.length);
  const showStop = !isInline && sending;

  const onStop = () => {
    void stopRun(chatState, chatId, onBump);
  };

  const onPrimaryAction = () => {
    if (isInline) {
      void onSend();
      return;
    }
    if (sending) {
      onStop();
      return;
    }
    onSend();
  };

  const applyExpressionResponse = (data) => {
    const expression = data?.expression ?? data?.result?.expression;
    if (expression) setSophieExpression(sophieExpressionView(expression));
  };

  const chooseSophieExpression = async (preset = null) => {
    setSophieExpressionBusy(true);
    try {
      const body = preset
        ? {
            ...preset,
            reason: `Dallas tuned Sophie expression UI: ${preset.label}`,
            source: "desk-ui",
          }
        : {
            reason: "Dallas asked Sophie to choose an expression from the Desk chip",
            source: "desk-ui",
          };
      const data = await api.chooseSophieExpression(body);
      applyExpressionResponse(data);
    } catch (err) {
      store.addMessage(chatState, chatId, { role: "system", content: `Sophie expression: ${err.message}` });
      onBump();
    } finally {
      setSophieExpressionBusy(false);
    }
  };

  const setMode = (mode) => {
    setChatAgentPrefs(chatState, chatId, { mode });
    store.saveChats(chatState);
    setComposerMenuOpen(false);
    onBump();
  };

  const setModel = (model) => {
    setChatAgentPrefs(chatState, chatId, { model });
    if (isAutoModel(model)) {
      void updatePrefs({ model: AUTO_MODEL, modelParams: [] });
    }
    store.saveChats(chatState);
    setComposerMenuOpen(false);
    setModelSearch("");
    onBump();
  };

  const onFilePick = async (e) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!picked.length) return;
    for (const file of picked) {
      try {
        await attachComposerFile(file);
      } catch (err) {
        store.addMessage(chatState, chatId, { role: "system", content: `Attach failed: ${err.message}` });
        onBump();
      }
    }
  };

  const addRef = async (item) => {
    const el = textareaRef.current;
    const snap = activeRefCtxRef.current;
    const refPos = getComposerRefTextAndCaret(el);
    const ctx = snap ?? (() => {
      const parsed = parseRefAtContext(refPos.text, refPos.caret);
      return parsed
        ? {
            atStart: parsed.atStart,
            caret: refPos.caret,
            scope: parsed.scope,
            query: parsed.query,
            rawAfterAt: parsed.rawAfterAt,
            deleteEnd: refQueryDeleteEnd(parsed.atStart, parsed.rawAfterAt),
            deleteLiteral: `@${parsed.rawAfterAt}`,
          }
        : null;
    })();

    if (item.kind === "scope" && item.scope) {
      const prefix = scopedComposerPrefix(item.scope);
      if (ctx && el) {
        replaceComposerRefRange(el, ctx.atStart, ctx.deleteEnd ?? ctx.caret, prefix);
      } else if (el) {
        replaceComposerRefRange(el, refPos.caret, refPos.caret, prefix);
      }
      syncInputFromEditor();
      setRefScope(item.scope);
      setRefQuery("");
      setRefHighlightIndex(0);
      activeRefCtxRef.current = null;
      el?.focus();
      return;
    }

    let pick = item;
    if (item.kind === "person" && item.remoteJid) {
      try {
        const identity = await api.resolvePerson(item.remoteJid, {
          displayName: item.name,
          phone: item.phone,
        });
        if (identity) {
          pick = {
            ...item,
            identity,
            name: identity.displayName ?? item.name,
            phone: identity.phone ?? item.phone,
            slug: identity.slug ?? item.slug,
          };
        }
      } catch {
        /* light identity from search is enough */
      }
    }

    attachWithInlineMention(refItemToAttachment(pick, newAttachmentId()), {
      replaceFrom: ctx?.atStart ?? null,
      replaceTo: ctx?.deleteEnd ?? null,
      deleteLiteral: ctx?.deleteLiteral ?? null,
    });
    activeRefCtxRef.current = null;
    setRefOpen(false);
    setRefQuery("");
    setRefScope(RefPickerScope.root);
    setRefHighlightIndex(0);
    el?.focus();
  };

  const pickHighlightedRef = () => {
    const item = refResults[refHighlightIndex];
    if (item) addRef(item);
  };

  const updateInput = (value, caret) => {
    const el = textareaRef.current;
    const plain = el ? getComposerTextAndCaret(el) : { text: value, caret: caret ?? value.length };
    const refPos = el ? getComposerRefTextAndCaret(el) : { text: value, caret: caret ?? value.length };
    setComposerInput(String(plain.text ?? "").replace(/\u200B/g, ""));
    syncInlineAttachmentsFromEditor(el, pending, (id) => removeAttachmentRef.current(id));
    const ctx = parseRefAtContext(refPos.text, refPos.caret);
    if (ctx) {
      activeRefCtxRef.current = {
        atStart: ctx.atStart,
        caret: refPos.caret,
        scope: ctx.scope,
        query: ctx.query,
        rawAfterAt: ctx.rawAfterAt,
        deleteEnd: refQueryDeleteEnd(ctx.atStart, ctx.rawAfterAt),
        deleteLiteral: `@${ctx.rawAfterAt}`,
      };
      setRefOpen(true);
      setRefScope(ctx.scope);
      setRefQuery(ctx.query);
      setRefHighlightIndex(0);
    } else if (!refPos.text.includes("@")) {
      activeRefCtxRef.current = null;
      setRefOpen(false);
      setRefScope(RefPickerScope.root);
      setRefQuery("");
      setRefHighlightIndex(0);
    }
  };

  const syncInputFromEditor = ({ skipRefPicker = false } = {}) => {
    const el = textareaRef.current;
    if (!el) return;
    const { text, caret } = getComposerTextAndCaret(el);
    if (skipRefPicker) {
      setComposerInput(text);
      return;
    }
    updateInput(text, caret);
  };

  const captureDropCaret = (e) => {
    const el = textareaRef.current;
    if (!el) return null;
    const at = resolveComposerDropCaret(el, e.clientX, e.clientY);
    dropInsertAtRef.current = at;
    return at;
  };

  const toggleMic = async () => {
    if (micBusyRef.current) return;

    if (recording) {
      micBusyRef.current = true;
      setRecording(false);
      setTranscribing(true);
      try {
        const elapsed = Date.now() - micStartedRef.current;
        if (elapsed < 700) {
          await voice.cancelRecording();
          throw new Error("Recording too brief — tap mic, speak, tap again to stop");
        }
        const data = await voice.stopRecording();
        const text = await voice.transcribeRecording(data);
        if (text) setComposerInput((v) => (v ? `${v} ${text}` : text));
      } catch (err) {
        store.addMessage(chatState, chatId, { role: "system", content: `Voice: ${err.message}` });
        onBump();
      } finally {
        setTranscribing(false);
        micBusyRef.current = false;
      }
      return;
    }

    micBusyRef.current = true;
    try {
      await voice.startRecording();
      micStartedRef.current = Date.now();
      setRecording(true);
    } catch (err) {
      store.addMessage(chatState, chatId, { role: "system", content: `Mic: ${err.message}` });
      onBump();
    } finally {
      micBusyRef.current = false;
    }
  };

  const filteredModels = (Array.isArray(models) ? models : []).filter((m) => {
    const id = m.id ?? m.label;
    if (!id || isAutoModel(id)) return false;
    const label = String(m.label ?? m.id ?? "").toLowerCase();
    const q = modelSearch.trim().toLowerCase();
    return !q || label.includes(q) || id.toLowerCase().includes(q);
  });

  const onComposerDragOver = (e) => {
    if (!chatId) return;
    const types = [...e.dataTransfer.types];
    const hasExplorer = types.includes(EXPLORER_DND_TYPE);
    const hasFiles = types.includes("Files");
    if (!hasExplorer && !hasFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
    captureDropCaret(e);
  };

  const onComposerDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };

  const onComposerDrop = async (e) => {
    setDragOver(false);
    if (!chatId) return;
    e.preventDefault();
    e.stopPropagation();
    const insertAt = captureDropCaret(e);

    try {
      const entry = readExplorerDragData(e.dataTransfer);
      if (entry) {
        if (isInline) {
          pushInlineWorkspaceEntry(entry, { at: insertAt });
        } else {
          attachWithInlineMention(workspaceEntryToAttachment(entry, newAttachmentId()), { at: insertAt });
        }
        return;
      }

      const dropped = filesFromDataTransfer(e.dataTransfer);
      if (!dropped.length) return;
      for (const file of dropped) {
        try {
          const atForFile =
            dropInsertAtRef.current != null
              ? dropInsertAtRef.current
              : getComposerTextAndCaret(textareaRef.current).caret;
          await attachComposerFile(file, { insertAt: atForFile });
        } catch (err) {
          store.addMessage(chatState, chatId, { role: "system", content: `Attach failed: ${err.message}` });
          onBump();
        }
      }
    } finally {
      dropInsertAtRef.current = null;
      textareaRef.current?.focus();
    }
  };

  const Wrapper = embedded ? "div" : "footer";
  const composerClass = [
    "cursor-composer",
    awaiting && !isInline ? "is-awaiting" : "",
    streaming && !isInline ? "is-streaming" : "",
    embedded ? "cursor-composer-embedded" : "",
    isInline ? "cursor-composer-inline" : "",
    isMobile ? "is-mobile" : "",
    dragOver ? "is-drag-over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Wrapper
      className={composerClass}
      onDragOver={onComposerDragOver}
      onDragLeave={onComposerDragLeave}
      onDrop={onComposerDrop}
    >
      {previewAttachment ? (
        <AttachmentPreviewSheet
          open
          layout="dock"
          attachment={previewAttachment}
          workspaceId={workspaceId}
          editable={previewAttachment?.kind === "context"}
          onClose={() => setPreviewAttachment(null)}
          onSaveText={(text) => {
            if (!previewAttachment?.id) return;
            const next = {
              ...previewAttachment,
              text,
              label: contextLabel(text),
            };
            if (isInline) {
              patchInlineAttachments((list) =>
                (list ?? []).map((a) => (a.id === previewAttachment.id ? next : a)),
              );
            } else {
              updatePendingAttachment(chatState, chatId, previewAttachment.id, {
                text,
                label: contextLabel(text),
              });
              store.saveChats(chatState);
            }
            updateMentionNode(textareaRef.current, next, { workspaceId });
            setPreviewAttachment(next);
            onBump();
          }}
        />
      ) : null}

      {stripAttachments.length ? (
        <AttachmentChipRow
          items={stripAttachments}
          workspaceId={workspaceId}
          onOpen={setPreviewAttachment}
          onRemove={(a) => removeComposerAttachment(a.id)}
          getUploadState={(a) => ({
            uploading: a.uploading,
            error: a.error,
            progress: a.progress,
          })}
        />
      ) : null}

      {refOpen ? (
        <div
          className="cursor-ref-picker"
          role="listbox"
          aria-label="Search files and tools"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="cursor-ref-picker-head">
            {refScope !== RefPickerScope.root ? (
              <button
                type="button"
                className="cursor-ref-scope-chip"
                onClick={() => {
                  setRefScope(RefPickerScope.root);
                  setRefQuery("");
                  setRefHighlightIndex(0);
                }}
              >
                ← Back
              </button>
            ) : null}
            {refScope !== RefPickerScope.root ? (
              <span className="cursor-ref-scope-label">{scopeLabel(refScope)}</span>
            ) : refQuery ? (
              <span className="cursor-ref-picker-query">{refQuery}</span>
            ) : (
              <span className="cursor-ref-picker-hint">Search files, folders, skills…</span>
            )}
            {refLoading ? <span className="cursor-ref-picker-loading">…</span> : null}
          </div>
          <div className="cursor-ref-list">
            {(() => {
              let flatIdx = 0;
              return groupRefResults(refResults).map((group) => (
                <div key={group.label} className="cursor-ref-group">
                  {group.items.map((item) => {
                    const idx = flatIdx++;
                    const highlighted = idx === refHighlightIndex;
                    const subtitle = refRowSubtitle(item);
                    return (
                      <button
                        key={`${item.kind ?? "item"}-${item.path ?? item.name}-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={highlighted}
                        className={`cursor-ref-row${highlighted ? " is-highlighted" : ""}`}
                        onMouseEnter={() => setRefHighlightIndex(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addRef(item)}
                      >
                        <Icon name={refPickerIcon(item)} size={14} className="cursor-ref-row-icon shrink-0" />
                        <span className="cursor-ref-row-main">
                          <span className="cursor-ref-row-name truncate">{item.name}</span>
                          {highlighted && subtitle ? (
                            <span className="cursor-ref-row-sub truncate">{subtitle}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
            {!refLoading && !refResults.length ? (
              <p className="cursor-ref-empty">Nothing matched — try another name or path</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {queued > 0 && !keyboardOpen && !activeSubagentCallId && !isInline ? (
        <QueuedMessagesStrip
          count={queued}
          preview={queuePreview}
          onClear={() => {
            clearMessageQueue(chatState, chatId, onBump);
            setQueueOpen(false);
          }}
        />
      ) : null}

      {queued > 1 && queueOpen && !isInline ? (
        <div className="cursor-queue-panel is-open">
          <button type="button" className="cursor-queue-header" onClick={() => setQueueOpen(false)}>
            <Icon name="chevDown" size={12} className="cursor-queue-chev" />
            <span>{queued} queued messages</span>
          </button>
          <ul className="cursor-queue-list">
            {queuedItems.map((m) => (
              <li key={m.id} className="cursor-queue-item">
                <span className="cursor-queue-dot" />
                <span className="cursor-queue-text">{m.content || "Attachment"}</span>
                <div className="cursor-queue-actions">
                  <button
                    type="button"
                    title="Remove from queue"
                    onClick={() => removeQueuedItem(chatState, chatId, m.id, onBump)}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!keyboardOpen && liveStatus && !isInline ? <AgentLiveStatusStrip status={liveStatus} /> : null}

      {multitaskLine && !streaming && !isInline ? (
        <p className="cursor-multitask-hint">{multitaskLine}</p>
      ) : null}

      {queued > 1 && !queueOpen && !isInline ? (
        <button type="button" className="cursor-queue-expand" onClick={() => setQueueOpen(true)}>
          Show {queued} queued messages
        </button>
      ) : null}

      <div
        className={`cursor-composer-box ${streaming ? "is-streaming" : ""} ${awaiting ? "is-awaiting" : ""} ${recording ? "is-recording" : ""} ${transcribing ? "is-transcribing" : ""}${dragOver ? " is-drop-target" : ""}`}
      >
        {awaiting && !isInline ? (
          <div className="cursor-composer-meta">
            <span className="cursor-composer-meta-item is-awaiting">
              <Icon name="askMode" size={12} />
              {questionPrompt
                ? `${questionPrompt.slice(0, 56)}${questionPrompt.length > 56 ? "…" : ""}`
                : "Reply in card above"}
            </span>
          </div>
        ) : null}
        <ComposerMentionEditor
          editorRef={textareaRef}
          chatKey={isInline ? `inline:${inlineEdit?.editKey ?? ""}` : chatId}
          value={input}
          placeholder={placeholder()}
          onFocus={onFocus}
          onBlur={onBlur}
          onMentionClick={openMentionPreview}
          onInput={(text, caret) => {
            updateInput(text, caret);
          }}
          onKeyDown={(e) => {
            const removedId = handleComposerMentionKeydown(textareaRef.current, e);
            if (removedId) {
              removeComposerAttachment(removedId);
              syncInputFromEditor();
              return;
            }
            if (e.key === "Escape" && isInline) {
              e.preventDefault();
              inlineEdit.onCancel?.();
              return;
            }
            if (refOpen && refResults.length) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setRefHighlightIndex((i) => Math.min(i + 1, refResults.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setRefHighlightIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                pickHighlightedRef();
                return;
              }
            }
            if (e.key === "Escape" && refOpen) {
              e.preventDefault();
              setRefOpen(false);
              setRefScope(RefPickerScope.root);
              setRefQuery("");
              return;
            }
            if (e.key === "@") {
              setRefOpen(true);
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (isInline) {
                if (canSend) void onSend();
                return;
              }
              if (sendingRef.current) return;
              if (sending && canSend) {
                void onSend();
                return;
              }
              if (sending) {
                onStop();
                return;
              }
              if (!canSend) return;
              void onSend();
            }
          }}
        />

        <div className={`cursor-composer-toolbar${isMobile ? " is-mobile" : ""}`}>
          <button
            type="button"
            className={`cursor-toolbar-icon cursor-composer-mobile-menu${
              composerMenuOpen || refOpen || summary.isCustom || summary.multitask ? " active" : ""
            }`}
            title="Mode, model, and tools"
            aria-expanded={composerMenuOpen}
            onClick={() => setComposerMenuOpen((v) => !v)}
          >
            <Icon name="plus" size={14} />
          </button>
          <ContextWindowRing
            messages={activeChatRow?.messages ?? []}
            chatState={chatState}
            chatId={chatId}
            onBump={onBump}
            disabled={streaming || awaiting}
          />
          {!isInline ? (
            <div
              className="cursor-composer-sophie-wrap"
              style={{ "--sophie-face-accent": sophieExpression.accent }}
            >
              <button
                type="button"
                className={`cursor-composer-sophie-face${sophiePanelOpen ? " is-open" : ""}`}
                title={`Sophie feels ${sophieExpression.label}`}
                aria-label={`Sophie expression: ${sophieExpression.label}`}
                aria-expanded={sophiePanelOpen}
                onClick={() => setSophiePanelOpen((v) => !v)}
              >
                <span className="cursor-composer-sophie-emoji" aria-hidden="true">{sophieExpression.face}</span>
                <span className="cursor-composer-sophie-label">{sophieExpression.label}</span>
                <span className="cursor-composer-sophie-spark" aria-hidden="true" />
              </button>
              {sophiePanelOpen ? (
                <div className="cursor-composer-sophie-panel" role="dialog" aria-label="Sophie expression">
                  <div className="cursor-composer-sophie-panel-head">
                    <span className="cursor-composer-sophie-panel-face" aria-hidden="true">
                      {sophieExpression.face}
                    </span>
                    <span>
                      <span className="cursor-composer-sophie-panel-title">Sophie is {sophieExpression.label}</span>
                      <span className="cursor-composer-sophie-panel-sub">
                        {sophieExpression.needsQuiet ? "quiet mode" : sophieExpression.energy}
                      </span>
                    </span>
                  </div>
                  <p className="cursor-composer-sophie-panel-mood">{sophieExpression.mood}</p>
                  {sophieExpression.tension ? (
                    <p className="cursor-composer-sophie-panel-note">{sophieExpression.tension}</p>
                  ) : sophieExpression.care ? (
                    <p className="cursor-composer-sophie-panel-note">{sophieExpression.care}</p>
                  ) : null}
                  <div className="cursor-composer-sophie-actions">
                    <button
                      type="button"
                      className="cursor-composer-sophie-action is-primary"
                      disabled={sophieExpressionBusy}
                      onClick={() => void chooseSophieExpression()}
                    >
                      {sophieExpressionBusy ? "Choosing…" : "Let me choose"}
                    </button>
                    {SOPHIE_EXPRESSION_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        className="cursor-composer-sophie-action"
                        disabled={sophieExpressionBusy}
                        onClick={() => void chooseSophieExpression(preset)}
                      >
                        {preset.face} {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="cursor-composer-mobile-outside">
            {!isInline ? (
              <button
                type="button"
                className={`cursor-toolbar-icon cursor-composer-mobile-outside-btn ${recording ? "is-recording" : ""} ${transcribing ? "is-transcribing" : ""}`}
                title={transcribing ? "Transcribing…" : recording ? "Stop recording" : "Voice input"}
                disabled={transcribing}
                onClick={toggleMic}
              >
                <Icon name={transcribing ? "loader" : "mic"} size={14} className={transcribing ? "chat-spin" : ""} />
              </button>
            ) : null}
            <button
              ref={submitBtnRef}
              type="button"
              className={`cursor-toolbar-icon cursor-composer-submit cursor-composer-mobile-outside-btn ${showStop ? "is-stop" : "is-send"}`}
              disabled={!showStop && !canSend}
              title={showStop ? "Stop agent" : isInline ? "Send edited message" : "Send"}
              onClick={onPrimaryAction}
            >
              <Icon name={showStop ? "stop" : "arrowUp"} size={14} />
            </button>
          </div>
          <input ref={fileRef} type="file" className="sr-only" multiple onChange={onFilePick} />
        </div>
      </div>

      <ComposerMobileMenu
        open={composerMenuOpen}
        onClose={() => setComposerMenuOpen(false)}
        summary={summary}
        models={models}
        filteredModels={filteredModels}
        modelSearch={modelSearch}
        onModelSearch={setModelSearch}
        onSetMode={setMode}
        onSetModel={setModel}
        onResetDefaults={
          summary.isCustom
            ? () => {
                clearChatAgentPrefs(chatState, chatId);
                store.saveChats(chatState);
                onBump();
              }
            : null
        }
        multitaskAvailable={health?.agent?.multitask != null}
        onToggleMultitask={
          health?.agent?.multitask != null
            ? () => {
                const next = !summary.multitask;
                setChatAgentPrefs(chatState, chatId, { multitask: next });
                store.saveChats(chatState);
                onBump();
              }
            : null
        }
        onFileRef={() => {
          const el = textareaRef.current;
          if (!refOpen && el) {
            el.focus();
            const { caret } = getComposerTextAndCaret(el);
            replaceComposerRefRange(el, caret, caret, "@");
            syncInputFromEditor();
          } else {
            setRefOpen((v) => !v);
            if (!refOpen) el?.focus();
          }
        }}
        onAttach={() => fileRef.current?.click()}
        onPaste={async () => {
          const res = await pasteContextFromClipboard({
            chatState,
            getActiveChatId: () => chatId,
            onAttach: () => onBump(),
            onInlineAttach: (partial) => attachWithInlineMention(partial),
          });
          if (!res.ok) {
            store.addMessage(chatState, chatId, { role: "system", content: `Paste: ${res.error}` });
            onBump();
          }
        }}
        onHeal={onRequestHeal ? () => void onRequestHeal() : null}
        healBusy={healBusy}
        showHeal={Boolean(streaming && onRequestHeal && showHealInComposer)}
        isInline={isInline}
        onCancelEdit={isInline ? () => inlineEdit.onCancel?.() : null}
      />
    </Wrapper>
  );
}
