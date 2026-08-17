"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music2,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import {
  flattenPastedHtmlInComposer,
  insertPlainTextAtSelection,
  isRichComposerInputType,
  plainTextFromClipboard,
} from "@/studio/lib/composerPasteIntelligence";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
import { MediaLoadFrame } from "./media-load-frame";
import { mentionFallbackAvatarStyle } from "@/studio/lib/profileAvatar";
import { StudioAssetPickerSheet } from "./StudioAssetPickerSheet";
import { StudioChatAudioPlayer } from "./StudioChatAudioPlayer";
import { MicrophoneWaveform } from "@/components/ui/waveform";

type PostComposeTabProps = {
  assetId?: string;
  onCancel: () => void;
  onPublished: (args: { handle: string; postId: string }) => void;
  /** Files rail / dock pick — same chooser as DMs, not the list-folder sheet. */
  onRequestPickAsset?: (request: {
    kinds?: ReadonlyArray<"image" | "video" | "audio" | "document">;
    pickMode?: "choose" | "share";
    title?: string;
    maxSelected?: number;
    onConfirm?: (
      assets: Array<{
        _id: string;
        name: string;
        kind: string;
        signedThumbnailUrl?: string;
      }>,
    ) => void;
  }) => void;
};

const MAX_CAPTION = 2200;
const MAX_POST_MEDIA = 6;
const CHIP_CLASS = "post-compose-inline-chip";

type PostMediaKind = "image" | "video" | "audio";

type ComposeSlot = {
  key: string;
  assetId?: Id<"assets">;
  kind: PostMediaKind;
  name: string;
  previewUrl?: string;
  file?: File;
};

type InlineTrigger =
  | { kind: "hash"; query: string; start: number; end: number }
  | { kind: "mention"; query: string; start: number; end: number };

type MentionMeta = {
  username: string;
  displayName?: string;
  avatarUrl?: string;
};

function getInlineTrigger(text: string, caret: number): InlineTrigger | null {
  const before = text.slice(0, caret);
  const hash = before.match(/(?:^|[\s\n])#([a-zA-Z0-9_]{0,32})$/);
  if (hash) {
    const query = hash[1] ?? "";
    const start = caret - query.length - 1;
    return { kind: "hash", query, start, end: caret };
  }
  const mention = before.match(/(?:^|[\s\n])@([a-zA-Z0-9._]{0,30})$/);
  if (mention) {
    const query = mention[1] ?? "";
    const start = caret - query.length - 1;
    return { kind: "mention", query, start, end: caret };
  }
  return null;
}

function isChipEl(node: Node | null): boolean {
  return Boolean(
    node &&
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).classList.contains(CHIP_CLASS),
  );
}

function chipSerializedLength(el: HTMLElement): number {
  if (el.dataset.kind === "hash") {
    return 1 + (el.dataset.tag?.length ?? 0);
  }
  if (el.dataset.kind === "mention") {
    return 1 + (el.dataset.username?.length ?? 0);
  }
  return 0;
}

function serializeEditor(root: HTMLElement): { caption: string; caret: number } {
  const sel = window.getSelection();
  let caret = 0;
  let caretSet = false;
  let caption = "";

  const markCaretBefore = (node: Node) => {
    if (caretSet || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    if (range.startContainer === node && range.startOffset === 0) {
      caret = caption.length;
      caretSet = true;
    }
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (sel?.rangeCount && !caretSet && sel.getRangeAt(0).startContainer === node) {
        caret = caption.length + sel.getRangeAt(0).startOffset;
        caretSet = true;
      }
      caption += text;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      markCaretBefore(el);
      caption += "\n";
      return;
    }
    if (isChipEl(el)) {
      markCaretBefore(el);
      if (el.dataset.kind === "hash" && el.dataset.tag) {
        caption += `#${el.dataset.tag}`;
      } else if (el.dataset.kind === "mention" && el.dataset.username) {
        caption += `@${el.dataset.username}`;
      }
      if (sel?.rangeCount && !caretSet) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer) || range.startContainer === el) {
          caret = caption.length;
          caretSet = true;
        }
      }
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };

  for (const child of Array.from(root.childNodes)) walk(child);
  if (!caretSet) caret = caption.length;
  if (caption.endsWith("\n") && root.lastChild?.nodeName === "BR") {
    // keep trailing newline from explicit BR
  }
  return { caption: caption.slice(0, MAX_CAPTION), caret: Math.min(caret, MAX_CAPTION) };
}

function createHashChip(doc: Document, tag: string): HTMLSpanElement {
  const chip = doc.createElement("span");
  chip.className = `${CHIP_CLASS} is-hash`;
  chip.contentEditable = "false";
  chip.dataset.kind = "hash";
  chip.dataset.tag = tag;
  chip.setAttribute("data-token", `#${tag}`);
  const label = doc.createElement("span");
  label.className = "post-compose-inline-chip-label";
  label.textContent = `#${tag}`;
  chip.appendChild(label);
  return chip;
}

function createMentionChip(doc: Document, meta: MentionMeta): HTMLSpanElement {
  const chip = doc.createElement("span");
  chip.className = `${CHIP_CLASS} is-mention`;
  chip.contentEditable = "false";
  chip.dataset.kind = "mention";
  chip.dataset.username = meta.username;
  if (meta.displayName) chip.dataset.displayName = meta.displayName;
  if (meta.avatarUrl) chip.dataset.avatarUrl = meta.avatarUrl;
  chip.setAttribute("data-token", `@${meta.username}`);

  const media = doc.createElement("span");
  media.className = "post-compose-inline-chip-avatar";
  if (meta.avatarUrl) {
    const img = doc.createElement("img");
    img.src = meta.avatarUrl;
    img.alt = "";
    img.draggable = false;
    media.appendChild(img);
  } else {
    Object.assign(
      media.style,
      mentionFallbackAvatarStyle(meta.displayName, meta.username),
    );
  }

  const label = doc.createElement("span");
  label.className = "post-compose-inline-chip-label";
  label.textContent = meta.username;

  chip.appendChild(media);
  chip.appendChild(label);
  return chip;
}

function placeCaretAfter(node: Node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function deleteSerializedRange(root: HTMLElement, start: number, end: number) {
  let offset = 0;
  const toRemove: Array<{ node: Text; start: number; end: number } | { chip: HTMLElement }> =
    [];

  const walk = (node: Node) => {
    if (offset >= end) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const nodeStart = offset;
      const nodeEnd = offset + text.length;
      const sliceStart = Math.max(start, nodeStart);
      const sliceEnd = Math.min(end, nodeEnd);
      if (sliceStart < sliceEnd) {
        toRemove.push({
          node: node as Text,
          start: sliceStart - nodeStart,
          end: sliceEnd - nodeStart,
        });
      }
      offset = nodeEnd;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      offset += 1;
      return;
    }
    if (isChipEl(el)) {
      const len = chipSerializedLength(el);
      const nodeStart = offset;
      const nodeEnd = offset + len;
      if (start < nodeEnd && end > nodeStart) {
        toRemove.push({ chip: el });
      }
      offset = nodeEnd;
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };

  for (const child of Array.from(root.childNodes)) walk(child);

  for (const item of toRemove) {
    if ("chip" in item) {
      item.chip.remove();
      continue;
    }
    const value = item.node.textContent ?? "";
    item.node.textContent = value.slice(0, item.start) + value.slice(item.end);
    if (!item.node.textContent) item.node.remove();
  }
}

function setSerializedCaret(root: HTMLElement, target: number) {
  const sel = window.getSelection();
  if (!sel) return;
  let offset = 0;

  const placeInText = (node: Text, local: number) => {
    const range = document.createRange();
    range.setStart(node, Math.max(0, Math.min(local, node.textContent?.length ?? 0)));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (target <= offset + text.length) {
        placeInText(node as Text, target - offset);
        return true;
      }
      offset += text.length;
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      if (target <= offset + 1) {
        const range = document.createRange();
        range.setStartAfter(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      offset += 1;
      return false;
    }
    if (isChipEl(el)) {
      const len = chipSerializedLength(el);
      if (target <= offset + len) {
        const range = document.createRange();
        range.setStartAfter(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      offset += len;
      return false;
    }
    for (const child of Array.from(el.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) return;
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertNodeAtCaret(root: HTMLElement, node: Node) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    root.appendChild(node);
    const space = document.createTextNode(" ");
    root.appendChild(space);
    placeCaretAfter(space);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  const space = document.createTextNode(" ");
  if (node.parentNode) {
    if (node.nextSibling) node.parentNode.insertBefore(space, node.nextSibling);
    else node.parentNode.appendChild(space);
  }
  placeCaretAfter(space);
}

function getCaretMenuPosition(wrap: HTMLElement): { top: number; left: number } {
  const fallback = { top: 44, left: 12 };
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return fallback;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    range.insertNode(marker);
    rect = marker.getBoundingClientRect();
    marker.parentNode?.removeChild(marker);
    // Restore caret without leaving the marker behind
    const restore = document.createRange();
    restore.setStart(range.startContainer, range.startOffset);
    restore.collapse(true);
    sel.removeAllRanges();
    sel.addRange(restore);
  }
  if (!Number.isFinite(rect.top) || (rect.top === 0 && rect.left === 0 && rect.height === 0)) {
    return fallback;
  }
  const wrapRect = wrap.getBoundingClientRect();
  const menuWidth = Math.min(280, wrap.clientWidth - 16);
  const rawLeft = rect.left - wrapRect.left;
  const left = Math.round(
    Math.max(8, Math.min(rawLeft, Math.max(8, wrap.clientWidth - menuWidth - 8))),
  );
  const top = Math.round(Math.max(8, rect.bottom - wrapRect.top + 4));
  return { top, left };
}

function fileMediaKind(file: File): PostMediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

const VOICE_NOTE_MAX_SECONDS = 300;

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

function recordingTimeLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PostComposeTab({
  assetId,
  onCancel,
  onPublished,
  onRequestPickAsset,
}: PostComposeTabProps) {
  const captionId = useId();
  const shareAsset = useMutation(api.profiles.shareAsset);
  const ensureStudioDefaults = useMutation(api.users.ensureStudioDefaults);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const myProfile = useQuery(api.profiles.getMine, { expiresUnix });
  const seedIds = assetId ? [assetId as Id<"assets">] : [];
  const seededAssets = useQuery(
    api.assets.listByIds,
    seedIds.length ? { assetIds: seedIds, quality: "preview", expiresUnix } : "skip",
  );
  const seededAsset = seededAssets?.[0] ?? null;
  const signedSeed = seededAsset as
    | (NonNullable<typeof seededAsset> & {
        signedReadUrl?: string;
        signedThumbnailUrl?: string;
        kind?: string;
      })
    | null;

  const [slots, setSlots] = useState<ComposeSlot[]>([]);
  const [slotIndex, setSlotIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);
  const slotsRef = useRef<ComposeSlot[]>([]);

  const [caption, setCaption] = useState("");
  const [caret, setCaret] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<{
    file: File;
    previewUrl: string;
    durationSec: number;
  } | null>(null);
  const [recState, setRecState] = useState<"idle" | "recording" | "paused" | "sending">(
    "idle",
  );
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recElapsedMsRef = useRef(0);
  const recTickStartRef = useRef(0);
  const recFinalDurationRef = useRef(0);
  const recIntentRef = useRef<"send" | "cancel">("cancel");
  const finishRecordingRef = useRef<((intent: "send" | "cancel") => void) | null>(
    null,
  );
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mentionMeta, setMentionMeta] = useState<Record<string, MentionMeta>>({});
  const editorRef = useRef<HTMLDivElement>(null);
  const suggestWrapRef = useRef<HTMLDivElement>(null);

  slotsRef.current = slots;

  const clearRecTimer = useCallback(() => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  }, []);

  const teardownRecorder = useCallback(() => {
    clearRecTimer();
    recStreamRef.current?.getTracks().forEach((track) => track.stop());
    recStreamRef.current = null;
    recorderRef.current = null;
  }, [clearRecTimer]);

  const startRecTimer = useCallback(() => {
    clearRecTimer();
    recTickStartRef.current = Date.now();
    recTimerRef.current = setInterval(() => {
      const elapsed =
        (recElapsedMsRef.current + (Date.now() - recTickStartRef.current)) / 1000;
      setRecSeconds(elapsed);
      if (elapsed >= VOICE_NOTE_MAX_SECONDS) finishRecordingRef.current?.("send");
    }, 250);
  }, [clearRecTimer]);

  const finishRecording = useCallback(
    (intent: "send" | "cancel") => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      if (recorder.state === "recording") {
        recElapsedMsRef.current += Date.now() - recTickStartRef.current;
      }
      clearRecTimer();
      recFinalDurationRef.current = Math.min(
        VOICE_NOTE_MAX_SECONDS,
        recElapsedMsRef.current / 1000,
      );
      recIntentRef.current = intent;
      setRecState(intent === "send" ? "sending" : "idle");
      recorder.stop();
    },
    [clearRecTimer],
  );
  finishRecordingRef.current = finishRecording;

  const pauseRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.pause();
    } catch {
      toast.error("Pause is not supported on this device");
      return;
    }
    recElapsedMsRef.current += Date.now() - recTickStartRef.current;
    clearRecTimer();
    setRecSeconds(recElapsedMsRef.current / 1000);
    setRecState("paused");
  }, [clearRecTimer]);

  const resumeRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    try {
      recorder.resume();
    } catch {
      toast.error("Could not resume recording");
      return;
    }
    setRecState("recording");
    startRecTimer();
  }, [startRecTimer]);

  const startRecording = useCallback(async () => {
    if (recState !== "idle" || publishing) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access was blocked");
      return;
    }
    const mimeType = pickRecorderMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    recStreamRef.current = stream;
    recorderRef.current = recorder;
    recChunksRef.current = [];
    recIntentRef.current = "cancel";
    recElapsedMsRef.current = 0;
    recFinalDurationRef.current = 0;
    setRecSeconds(0);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const durationSec = Math.min(
        VOICE_NOTE_MAX_SECONDS,
        recFinalDurationRef.current || recElapsedMsRef.current / 1000,
      );
      const blob = new Blob(recChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      const intent = recIntentRef.current;
      recChunksRef.current = [];
      teardownRecorder();

      if (intent !== "send" || durationSec < 1 || blob.size === 0) {
        setRecState("idle");
        if (intent === "send" && durationSec < 1) {
          toast.error("Voice note too short — hold on a bit longer");
        }
        return;
      }

      const file = new File([blob], "Voice note.webm", {
        type: blob.type || "audio/webm",
      });
      const previewUrl = URL.createObjectURL(blob);
      setPendingVoice((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return { file, previewUrl, durationSec };
      });
      setRecState("idle");
    };
    recorder.start(250);
    setRecState("recording");
    startRecTimer();
  }, [publishing, recState, startRecTimer, teardownRecorder]);

  function clearPendingVoice() {
    setPendingVoice((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  useEffect(() => {
    if (seededRef.current || !signedSeed) return;
    const kind = signedSeed.kind;
    if (kind !== "image" && kind !== "video" && kind !== "audio") return;
    seededRef.current = true;
    setSlots([
      {
        key: String(signedSeed._id),
        assetId: signedSeed._id as Id<"assets">,
        kind,
        name: signedSeed.name,
        previewUrl:
          signedSeed.signedReadUrl || signedSeed.signedThumbnailUrl || undefined,
      },
    ]);
  }, [signedSeed]);

  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current) {
        if (slot.file && slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      }
      teardownRecorder();
    };
  }, [teardownRecorder]);

  const trigger = useMemo(() => getInlineTrigger(caption, caret), [caption, caret]);

  const hashSuggestions = useQuery(
    api.hashtags.suggestHashtags,
    trigger?.kind === "hash" ? { query: trigger.query, limit: 8 } : "skip",
  );
  const peopleSuggestions = useQuery(
    api.hashtags.suggestPeople,
    trigger?.kind === "mention" && trigger.query.length >= 1
      ? { query: trigger.query, limit: 8, expiresUnix }
      : "skip",
  );

  const current = slots[Math.min(slotIndex, Math.max(0, slots.length - 1))] ?? null;
  const previewUrl = current?.previewUrl;
  const isVideo = current?.kind === "video";
  const isAudio = current?.kind === "audio";
  const canPublish = slots.length > 0 && !publishing && recState === "idle";
  const remaining = MAX_POST_MEDIA - slots.length;
  const seeding = Boolean(assetId) && seededAssets === undefined;

  const showHashSuggest = trigger?.kind === "hash" && (hashSuggestions?.length ?? 0) > 0;
  const showPeopleSuggest =
    trigger?.kind === "mention" && (peopleSuggestions?.length ?? 0) > 0;
  const menuOpen = showHashSuggest || showPeopleSuggest;
  const menuCount = showHashSuggest
    ? (hashSuggestions?.length ?? 0)
    : showPeopleSuggest
      ? (peopleSuggestions?.length ?? 0)
      : 0;

  useEffect(() => {
    setMenuIndex(0);
  }, [trigger?.kind, trigger?.query, menuCount]);

  useEffect(() => {
    setMenuDismissed(false);
  }, [trigger?.kind, trigger?.start, trigger?.query]);

  // Fill missing mention chip avatars once suggestions / my profile resolve.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const byUser = new Map<string, string>();
    for (const person of peopleSuggestions ?? []) {
      if (person.avatarUrl) byUser.set(person.username.toLowerCase(), person.avatarUrl);
    }
    if (myProfile?.username && myProfile.avatarUrl) {
      byUser.set(myProfile.username.toLowerCase(), myProfile.avatarUrl);
    }
    for (const [username, meta] of Object.entries(mentionMeta)) {
      if (meta.avatarUrl) byUser.set(username.toLowerCase(), meta.avatarUrl);
    }
    if (byUser.size === 0) return;

    const chips = el.querySelectorAll<HTMLElement>(
      '.post-compose-inline-chip.is-mention[data-kind="mention"]',
    );
    for (const chip of chips) {
      const username = (chip.dataset.username || "").toLowerCase();
      const url = byUser.get(username);
      if (!url) continue;
      const media = chip.querySelector(".post-compose-inline-chip-avatar");
      if (!media) continue;
      const existing = media.querySelector("img");
      if (existing) {
        if (existing.getAttribute("src") !== url) existing.setAttribute("src", url);
        continue;
      }
      media.replaceChildren();
      const node = media as HTMLElement;
      node.style.backgroundImage = "";
      node.style.backgroundSize = "";
      node.style.backgroundRepeat = "";
      node.style.background = "";
      node.style.color = "";
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.draggable = false;
      media.appendChild(img);
      chip.dataset.avatarUrl = url;
    }
  }, [peopleSuggestions, myProfile?.username, myProfile?.avatarUrl, mentionMeta]);

  useLayoutEffect(() => {
    if (!menuOpen || menuDismissed) {
      setMenuPos((prev) => (prev == null ? prev : null));
      return;
    }
    const wrap = suggestWrapRef.current;
    const next = wrap ? getCaretMenuPosition(wrap) : { top: 44, left: 12 };
    setMenuPos((prev) =>
      prev && prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [menuOpen, menuDismissed, trigger, caption, caret]);

  function syncFromEditor() {
    const el = editorRef.current;
    if (!el) return;
    const next = serializeEditor(el);
    const captionText = next.caption.replace(/\u00a0/g, " ");
    setCaption(captionText);
    setCaret(Math.min(next.caret, captionText.length));
    el.classList.toggle("is-empty", captionText.length === 0);
  }

  function applyHashChip(tag: string) {
    const el = editorRef.current;
    if (!el || !trigger || trigger.kind !== "hash") return;
    el.focus();
    const insertAt = trigger.start;
    deleteSerializedRange(el, trigger.start, trigger.end);
    setSerializedCaret(el, insertAt);
    const chip = createHashChip(document, tag);
    insertNodeAtCaret(el, chip);
    syncFromEditor();
    setMenuPos(null);
  }

  function applyMentionChip(meta: MentionMeta) {
    const el = editorRef.current;
    if (!el || !trigger || trigger.kind !== "mention") return;
    el.focus();
    const insertAt = trigger.start;
    deleteSerializedRange(el, trigger.start, trigger.end);
    setSerializedCaret(el, insertAt);
    const resolved: MentionMeta = {
      ...meta,
      avatarUrl:
        meta.avatarUrl ||
        (myProfile?.username?.toLowerCase() === meta.username.toLowerCase()
          ? myProfile.avatarUrl
          : undefined),
    };
    setMentionMeta((prev) => ({ ...prev, [resolved.username]: resolved }));
    const chip = createMentionChip(document, resolved);
    insertNodeAtCaret(el, chip);
    syncFromEditor();
    setMenuPos(null);
  }

  function pickAutoMention(): MentionMeta | null {
    if (trigger?.kind !== "mention" || !peopleSuggestions?.length) return null;
    const q = trigger.query.toLowerCase();
    if (!q) return null;
    const exact = peopleSuggestions.find((person) => person.username.toLowerCase() === q);
    if (exact) {
      return {
        username: exact.username,
        displayName: exact.displayName,
        avatarUrl: exact.avatarUrl,
      };
    }
    const prefixMatches = peopleSuggestions.filter((person) =>
      person.username.toLowerCase().startsWith(q),
    );
    if (prefixMatches.length === 1) {
      const only = prefixMatches[0]!;
      return {
        username: only.username,
        displayName: only.displayName,
        avatarUrl: only.avatarUrl,
      };
    }
    // Prefer top result when query is a clear unique stem (menu highlight)
    if (prefixMatches.length > 0 && menuIndex < prefixMatches.length) {
      return null;
    }
    return null;
  }

  function pickAutoHash(): string | null {
    if (trigger?.kind !== "hash" || !hashSuggestions?.length) return null;
    const q = trigger.query.toLowerCase();
    if (!q) return null;
    const exact = hashSuggestions.find((item) => item.tag === q);
    if (exact) return exact.tag;
    const prefixMatches = hashSuggestions.filter((item) => item.tag.startsWith(q));
    if (prefixMatches.length === 1) return prefixMatches[0]!.tag;
    return null;
  }

  function applyMenuSelection(index = menuIndex) {
    if (showHashSuggest) {
      const item = hashSuggestions?.[index];
      if (!item) return;
      applyHashChip(item.tag);
      return;
    }
    if (showPeopleSuggest) {
      const person = peopleSuggestions?.[index];
      if (!person) return;
      applyMentionChip({
        username: person.username,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
      });
    }
  }

  function tryAutoFinish(): boolean {
    if (trigger?.kind === "mention") {
      const meta = pickAutoMention();
      if (meta) {
        applyMentionChip(meta);
        return true;
      }
      // Fall back to highlighted menu row when suggestions are visible
      if (showPeopleSuggest && !menuDismissed) {
        applyMenuSelection();
        return true;
      }
    }
    if (trigger?.kind === "hash") {
      const tag = pickAutoHash();
      if (tag) {
        applyHashChip(tag);
        return true;
      }
      if (showHashSuggest && !menuDismissed) {
        applyMenuSelection();
        return true;
      }
    }
    return false;
  }

  function onEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const completingKey =
      event.key === "Enter" ||
      event.key === "Tab" ||
      event.key === " " ||
      event.key === "Spacebar";

    if (menuOpen && !menuDismissed && menuCount > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMenuIndex((prev) => (prev + 1) % menuCount);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMenuIndex((prev) => (prev - 1 + menuCount) % menuCount);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuDismissed(true);
        return;
      }
      if (completingKey) {
        event.preventDefault();
        if (event.key === " " || event.key === "Spacebar") {
          // Space: prefer exact/unique auto-finish, else top menu item
          if (!tryAutoFinish()) applyMenuSelection();
        } else {
          applyMenuSelection();
        }
        return;
      }
    } else if (completingKey && (trigger?.kind === "mention" || trigger?.kind === "hash")) {
      // Menu dismissed or still loading — still auto-finish exact/unique matches
      if (event.key === " " || event.key === "Spacebar" || event.key === "Tab") {
        const auto = trigger.kind === "mention" ? pickAutoMention() : pickAutoHash();
        if (auto) {
          event.preventDefault();
          if (typeof auto === "string") applyHashChip(auto);
          else applyMentionChip(auto);
          return;
        }
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      document.execCommand("insertLineBreak");
      syncFromEditor();
    }
  }

  async function handlePublish() {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const defaults = await ensureStudioDefaults({});
      const assetIds: Id<"assets">[] = [];
      for (const slot of slots) {
        if (slot.assetId) {
          assetIds.push(slot.assetId);
          continue;
        }
        if (!slot.file) continue;
        const uploaded = await uploadStudioAsset({
          file: slot.file,
          folderId: defaults.rootFolderId,
          kind: slot.kind,
          name: slot.name || slot.file.name,
          reserveUpload,
          commitStagingUpload,
        });
        assetIds.push(uploaded);
      }
      if (assetIds.length === 0) {
        toast.error("Add a photo, video, or audio first");
        return;
      }
      let voiceAssetId: Id<"assets"> | undefined;
      let voiceDurationSec: number | undefined;
      if (pendingVoice) {
        voiceAssetId = await uploadStudioAsset({
          file: pendingVoice.file,
          folderId: defaults.rootFolderId,
          kind: "audio",
          name: pendingVoice.file.name || "Voice note",
          reserveUpload,
          commitStagingUpload,
        });
        voiceDurationSec = pendingVoice.durationSec;
      }
      const result = await shareAsset({
        assetIds,
        caption: caption.trim() || undefined,
        ...(voiceAssetId
          ? { voiceAssetId, ...(voiceDurationSec != null ? { voiceDurationSec } : {}) }
          : {}),
      });
      const handle = result.publicUrlPath.replace(/^\/u\//, "");
      toast.success("Post created");
      onPublished({ handle, postId: result.postId });
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not create post"));
    } finally {
      setPublishing(false);
    }
  }

  function addFiles(list: FileList | File[] | null | undefined) {
    if (!list) return;
    const files = Array.from(list);
    setSlots((prev) => {
      const room = MAX_POST_MEDIA - prev.length;
      if (room <= 0) return prev;
      const next = [...prev];
      for (const file of files) {
        if (next.length >= MAX_POST_MEDIA) break;
        const kind = fileMediaKind(file);
        if (!kind) continue;
        next.push({
          key: `${file.name}:${file.size}:${file.lastModified}:${next.length}`,
          file,
          kind,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
        });
      }
      return next;
    });
    setChoiceOpen(false);
  }

  function openChooseMedia() {
    setChoiceOpen(false);
    const remaining = MAX_POST_MEDIA - slotsRef.current.length;
    if (remaining <= 0) {
      toast.message(`You can pick up to ${MAX_POST_MEDIA} files`);
      return;
    }
    if (onRequestPickAsset) {
      onRequestPickAsset({
        pickMode: "choose",
        kinds: ["image", "video", "audio"],
        title: "Choose media",
        maxSelected: remaining,
        onConfirm: (picked) => {
          for (const item of picked ?? []) addPickedAsset(item);
        },
      });
      return;
    }
    setPickerOpen(true);
  }

  function addPickedAsset(pick: {
    _id: string;
    name: string;
    kind: string;
    signedThumbnailUrl?: string;
  }) {
    const kind = pick.kind;
    if (kind !== "image" && kind !== "video" && kind !== "audio") return;
    setSlots((prev) => {
      if (prev.length >= MAX_POST_MEDIA) return prev;
      if (prev.some((slot) => slot.assetId === pick._id)) return prev;
      return [
        ...prev,
        {
          key: pick._id,
          assetId: pick._id as Id<"assets">,
          kind,
          name: pick.name,
          previewUrl: pick.signedThumbnailUrl,
        },
      ];
    });
    setChoiceOpen(false);
  }

  function removeSlot(key: string) {
    setSlots((prev) => {
      const hit = prev.find((slot) => slot.key === key);
      if (hit?.file && hit.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      const next = prev.filter((slot) => slot.key !== key);
      setSlotIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
      return next;
    });
  }

  const visibleMenu = menuOpen && !menuDismissed;
  const resolvedMenuPos = menuPos ?? { top: 44, left: 12 };

  // Ghost suffix for the highlighted suggestion (username / tag remainder)
  const ghostSuffix = useMemo(() => {
    if (!visibleMenu || !trigger) return "";
    if (trigger.kind === "mention") {
      const person = peopleSuggestions?.[menuIndex];
      if (!person) return "";
      const q = trigger.query.toLowerCase();
      const full = person.username.toLowerCase();
      return full.startsWith(q) ? person.username.slice(q.length) : "";
    }
    const item = hashSuggestions?.[menuIndex];
    if (!item) return "";
    const q = trigger.query.toLowerCase();
    return item.tag.startsWith(q) ? item.tag.slice(q.length) : "";
  }, [
    visibleMenu,
    trigger,
    peopleSuggestions,
    hashSuggestions,
    menuIndex,
  ]);

  return (
    <div className="post-compose">
      <div className="post-compose-toolbar">
        <h2 className="post-compose-toolbar-title">Create post</h2>
        <div className="post-compose-toolbar-actions">
          <button
            type="button"
            className="post-compose-btn is-ghost"
            onClick={onCancel}
            disabled={publishing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="post-compose-btn is-primary"
            onClick={() => void handlePublish()}
            disabled={!canPublish}
          >
            {publishing ? (
              <>
                <Loader2 className="post-compose-spin" aria-hidden="true" />
                Creating…
              </>
            ) : (
              "Create"
            )}
          </button>
        </div>
      </div>

      <div className="post-compose-body">
        <div className="post-compose-mock" aria-label="Post preview">
          <div className={`post-compose-mock-slide${!current ? " is-empty" : ""}`}>
            <div className="post-compose-mock-media">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              {!current ? (
                seeding ? (
                  <div className="post-compose-preview-empty" aria-busy="true">
                    Loading…
                  </div>
                ) : (
                <button
                  type="button"
                  className="post-compose-media-empty"
                  onClick={() => setChoiceOpen((open) => !open)}
                >
                  <span className="post-compose-media-empty-title">Add to this post</span>
                  <span className="post-compose-media-empty-copy">
                    Click anywhere to upload or choose up to {MAX_POST_MEDIA} photos, videos, or audio
                  </span>
                </button>
                )
              ) : isAudio && previewUrl ? (
                <div className="post-compose-audio-stage">
                  <StudioChatAudioPlayer src={previewUrl} title={current.name} />
                </div>
              ) : isVideo && previewUrl ? (
                <MediaLoadFrame
                  className="post-compose-mock-frame"
                  kind="video"
                  src={previewUrl}
                  cacheKey={current.key}
                  ratio="fill"
                >
                  {({ onLoad, onError }) => (
                    <video
                      src={previewUrl}
                      muted
                      playsInline
                      loop
                      autoPlay
                      onLoadedData={onLoad}
                      onError={onError}
                    />
                  )}
                </MediaLoadFrame>
              ) : previewUrl ? (
                <MediaLoadFrame
                  className="post-compose-mock-frame"
                  kind="image"
                  src={previewUrl}
                  cacheKey={current.key}
                  ratio="fill"
                >
                  {({ onLoad, onError }) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt={current.name} onLoad={onLoad} onError={onError} />
                  )}
                </MediaLoadFrame>
              ) : (
                <div className="post-compose-preview-empty">{current.name}</div>
              )}
              {choiceOpen ? (
                <div className="post-compose-media-choice" role="menu">
                  <button
                    type="button"
                    onClick={() => {
                      setChoiceOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload aria-hidden="true" />
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={openChooseMedia}
                  >
                    <Folder aria-hidden="true" />
                    Choose media
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="post-compose-media-strip" aria-label="Post media">
            {slots.length > 1 ? (
              <button
                type="button"
                className="post-compose-media-nav is-prev"
                aria-label="Previous item"
                onClick={() =>
                  setSlotIndex((i) => (i - 1 + slots.length) % slots.length)
                }
              >
                <ChevronLeft aria-hidden="true" />
              </button>
            ) : null}
            <div className="post-compose-media-chips">
              {slots.map((slot, index) => (
                <button
                  key={slot.key}
                  type="button"
                  className={`post-compose-media-thumb${index === slotIndex ? " is-current" : ""}`}
                  aria-label={slot.name}
                  onClick={() => setSlotIndex(index)}
                >
                  {slot.kind === "audio" ? (
                    <Music2 aria-hidden="true" />
                  ) : slot.kind === "video" && slot.previewUrl ? (
                    <video src={slot.previewUrl} muted playsInline />
                  ) : slot.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slot.previewUrl} alt="" />
                  ) : slot.kind === "video" ? (
                    <ImageIcon aria-hidden="true" />
                  ) : (
                    <ImageIcon aria-hidden="true" />
                  )}
                  <span
                    className="post-compose-media-thumb-remove"
                    role="button"
                    aria-label={`Remove ${slot.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeSlot(slot.key);
                    }}
                  >
                    <X aria-hidden="true" />
                  </span>
                </button>
              ))}
              {remaining > 0 ? (
                <button
                  type="button"
                  className="post-compose-media-thumb is-add"
                  aria-label="Add media"
                  onClick={() => setChoiceOpen(true)}
                >
                  <Plus aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {slots.length > 1 ? (
              <button
                type="button"
                className="post-compose-media-nav is-next"
                aria-label="Next item"
                onClick={() => setSlotIndex((i) => (i + 1) % slots.length)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="post-compose-form">
          <div className="post-compose-field" ref={suggestWrapRef}>
            <div
              id={captionId}
              ref={editorRef}
              className="post-compose-caption is-empty"
              contentEditable
              role="textbox"
              aria-multiline="true"
              aria-label="Post description"
              aria-autocomplete="list"
              aria-expanded={Boolean(visibleMenu)}
              data-placeholder="Write a description…"
              suppressContentEditableWarning
              onInput={() => {
                flattenPastedHtmlInComposer(editorRef.current);
                syncFromEditor();
              }}
              onKeyUp={syncFromEditor}
              onClick={syncFromEditor}
              onKeyDown={onEditorKeyDown}
              onBeforeInput={(event) => {
                if (isRichComposerInputType(event.inputType)) event.preventDefault();
              }}
              onPaste={(event) => {
                event.preventDefault();
                const text = plainTextFromClipboard(event.clipboardData).slice(0, MAX_CAPTION);
                if (text) insertPlainTextAtSelection(text);
                flattenPastedHtmlInComposer(editorRef.current);
                syncFromEditor();
              }}
            />
            {visibleMenu && showHashSuggest ? (
              <ul
                className="post-compose-suggest"
                role="listbox"
                style={{ top: resolvedMenuPos.top, left: resolvedMenuPos.left }}
              >
                {(hashSuggestions ?? []).map((item, index) => (
                  <li key={`${item.exists ? "e" : "n"}:${item.tag}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === menuIndex}
                      className={index === menuIndex ? "is-active" : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyHashChip(item.tag)}
                    >
                      <span className={`${CHIP_CLASS} is-hash is-menu`}>
                        <span className="post-compose-inline-chip-label">#{item.displayTag}</span>
                      </span>
                      <span className="post-compose-suggest-meta">
                        {item.exists ? `${item.postCount} posts` : "Create"}
                        {index === menuIndex && ghostSuffix ? (
                          <span className="post-compose-suggest-hint"> · Tab</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {visibleMenu && showPeopleSuggest ? (
              <ul
                className="post-compose-suggest"
                role="listbox"
                style={{ top: resolvedMenuPos.top, left: resolvedMenuPos.left }}
              >
                {(peopleSuggestions ?? []).map((person, index) => (
                  <li key={person.profileId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === menuIndex}
                      className={index === menuIndex ? "is-active" : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        applyMentionChip({
                          username: person.username,
                          displayName: person.displayName,
                          avatarUrl: person.avatarUrl,
                        })
                      }
                    >
                      <span className={`${CHIP_CLASS} is-mention is-menu`}>
                        <span
                          className="post-compose-inline-chip-avatar"
                          style={
                            person.avatarUrl
                              ? undefined
                              : mentionFallbackAvatarStyle(
                                  person.displayName,
                                  person.username,
                                )
                          }
                        >
                          {person.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={person.avatarUrl} alt="" />
                          ) : null}
                        </span>
                        <span className="post-compose-inline-chip-label">
                          {index === menuIndex && ghostSuffix ? (
                            <>
                              {person.username.slice(0, trigger?.query.length ?? 0)}
                              <span className="post-compose-chip-ghost">{ghostSuffix}</span>
                            </>
                          ) : (
                            person.username
                          )}
                        </span>
                      </span>
                      <span className="post-compose-suggest-meta">
                        {person.displayName || "Profile"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="post-compose-voice">
            {recState !== "idle" ? (
              <div
                className="post-compose-voice-rec"
                role="status"
                aria-label="Recording voice note"
              >
                <span className="post-compose-voice-rec-meta">
                  <span
                    className={`post-compose-voice-rec-dot${recState === "recording" ? " is-live" : ""}`}
                    aria-hidden="true"
                  />
                  <span>
                    {recordingTimeLabel(recSeconds)}
                    {recState === "paused" ? " · paused" : ""}
                  </span>
                </span>
                <MicrophoneWaveform
                  className="post-compose-voice-rec-wave"
                  active={recState === "recording"}
                  processing={recState === "sending"}
                  height={28}
                  barWidth={3}
                  barGap={2}
                  barRadius={1}
                  barColor="gray"
                  sensitivity={1.6}
                  fadeEdges
                  fadeWidth={20}
                />
                <button
                  type="button"
                  className="studio-composer-circle-btn"
                  onClick={() =>
                    recState === "paused" ? resumeRecording() : pauseRecording()
                  }
                  disabled={recState === "sending"}
                  aria-label={
                    recState === "paused" ? "Resume recording" : "Pause recording"
                  }
                >
                  {recState === "paused" ? (
                    <Play aria-hidden="true" />
                  ) : (
                    <Pause aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="studio-composer-circle-btn is-discard"
                  onClick={() => finishRecording("cancel")}
                  disabled={recState === "sending"}
                  aria-label="Discard recording"
                >
                  <Trash2 aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="studio-composer-circle-btn"
                  onClick={() => finishRecording("send")}
                  disabled={recState === "sending"}
                  aria-label="Attach voice note"
                >
                  {recState === "sending" ? (
                    <Loader2 className="post-compose-spin" aria-hidden="true" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                </button>
              </div>
            ) : pendingVoice ? (
              <div className="post-compose-voice-preview">
                <StudioChatAudioPlayer
                  src={pendingVoice.previewUrl}
                  title="Voice note"
                  durationHint={pendingVoice.durationSec}
                  compact
                />
                <button
                  type="button"
                  className="post-compose-voice-remove"
                  aria-label="Remove voice note"
                  onClick={clearPendingVoice}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="studio-composer-circle-btn"
                onClick={() => void startRecording()}
                disabled={publishing}
                aria-label="Record a voice note"
                title="Voice note"
              >
                <Mic aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
      {pickerOpen ? (
        <StudioAssetPickerSheet
          title="Choose media"
          kinds={["image", "video", "audio"]}
          multi
          stayOpen
          maxSelected={MAX_POST_MEDIA}
          selectedIds={slots.map((slot) => slot.assetId).filter(Boolean) as string[]}
          countLabel={`${slots.length}/${MAX_POST_MEDIA}`}
          expiresUnix={expiresUnix}
          onPick={(asset) => addPickedAsset(asset)}
          onClose={() => setPickerOpen(false)}
          onDone={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
