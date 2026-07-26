"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FolderOpen,
  ImageIcon,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Reply,
  SendHorizontal,
  Tags,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MicrophoneWaveform } from "@/components/ui/waveform";
import { useLongPress } from "@/desk/hooks/use-long-press";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { dmLabelIcon } from "@/studio/lib/dmLabelIcons";
import { StudioDmAssignLabelsDialog } from "./StudioDmLabelDialogs";
import {
  StudioDmContextMenu,
  type StudioDmContextMenuItem,
} from "./StudioDmContextMenu";
import { StudioChatAudioPlayer } from "./StudioChatAudioPlayer";
import { StudioDmPeerSidebar } from "./StudioDmPeerSidebar";
import { StudioDmProviderTag } from "./StudioDmProviderTag";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  StudioAssetPickerSheet,
  type StudioAssetPick,
} from "./StudioAssetPickerSheet";
import "./studio-messages.css";

const PEER_SIDEBAR_OPEN_KEY = "studio-dm-peer-sidebar-open";

const VOICE_NOTE_MAX_SECONDS = 300;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type PendingImage = {
  file: File;
  previewUrl: string;
};

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

type DmReceipt = "sent" | "delivered" | "read";

/**
 * WhatsApp-style ticks:
 * 1 gray = sent · 2 gray = delivered (peer ACK) · 2 colored = read.
 */
function DmReadReceipt({ receipt }: { receipt: DmReceipt }) {
  if (receipt === "read") {
    return (
      <CheckCheck
        className="studio-dm-ticks is-read"
        aria-label="Read"
        strokeWidth={2.5}
      />
    );
  }
  if (receipt === "delivered") {
    return (
      <CheckCheck
        className="studio-dm-ticks is-delivered"
        aria-label="Delivered"
        strokeWidth={2.5}
      />
    );
  }
  return (
    <Check className="studio-dm-ticks" aria-label="Sent" strokeWidth={2.5} />
  );
}

function DmMessageMeta({
  createdAt,
  fromMe,
  receipt,
}: {
  createdAt: number;
  fromMe: boolean;
  receipt: DmReceipt;
}) {
  return (
    <span className="studio-dm-meta">
      <time dateTime={new Date(createdAt).toISOString()}>
        {timeLabel(createdAt)}
      </time>
      {fromMe ? <DmReadReceipt receipt={receipt} /> : null}
    </span>
  );
}

type DmReplySnippet = {
  _id: Id<"dmMessages">;
  body: string;
  kind: "text" | "voice" | "image";
  fromMe: boolean;
  audioUrl?: string;
  imageUrl?: string;
  durationSec?: number;
};

type DmMessageRow = {
  _id: Id<"dmMessages">;
  body: string;
  kind: "text" | "voice" | "image";
  audioUrl?: string;
  imageUrl?: string;
  contentType?: string;
  durationSec?: number;
  fromMe: boolean;
  receipt: DmReceipt;
  replyTo?: DmReplySnippet;
  createdAt: number;
};

function replySnippetLabel(
  snippet: Pick<DmReplySnippet, "body" | "kind">,
): string {
  if (snippet.kind === "voice") return "Voice message";
  if (snippet.kind === "image") {
    const caption = snippet.body.trim();
    // Server may already prefix "Photo · …"
    if (caption.startsWith("Photo")) return caption;
    return caption ? `Photo · ${caption}` : "Photo";
  }
  return snippet.body.trim() || "Message";
}

function ReplyKindIcon({
  kind,
  className = "h-3 w-3",
}: {
  kind: DmReplySnippet["kind"];
  className?: string;
}) {
  if (kind === "voice") {
    return <Mic className={className} aria-hidden="true" />;
  }
  if (kind === "image") {
    return <ImageIcon className={className} aria-hidden="true" />;
  }
  return null;
}

function DmReplyQuote({
  snippet,
  peerLabel,
  onJump,
}: {
  snippet: DmReplySnippet;
  peerLabel: string;
  onJump?: () => void;
}) {
  const hasVoice = snippet.kind === "voice" && Boolean(snippet.audioUrl);
  const hasImage = snippet.kind === "image" && Boolean(snippet.imageUrl);

  return (
    <div className={`studio-dm-reply-quote${hasVoice ? " is-voice" : ""}${hasImage ? " is-image" : ""}`}>
      <button
        type="button"
        className="studio-dm-reply-quote-head"
        onClick={(event) => {
          event.stopPropagation();
          onJump?.();
        }}
      >
        <strong>{snippet.fromMe ? "You" : peerLabel}</strong>
        {!hasVoice ? (
          <span className="studio-dm-reply-snippet">
            <ReplyKindIcon kind={snippet.kind} />
            {replySnippetLabel(snippet)}
          </span>
        ) : null}
      </button>
      {hasVoice ? (
        <div
          className="studio-dm-reply-voice"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <StudioChatAudioPlayer
            src={snippet.audioUrl!}
            title="Voice message"
            durationHint={snippet.durationSec}
          />
        </div>
      ) : null}
      {hasImage ? (
        <button
          type="button"
          className="studio-dm-reply-image"
          onClick={(event) => {
            event.stopPropagation();
            onJump?.();
          }}
          aria-label="View original photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={snippet.imageUrl} alt="" />
        </button>
      ) : null}
    </div>
  );
}

const SWIPE_REPLY_THRESHOLD = 56;
const SWIPE_REPLY_MAX = 72;

function DmMessageBubble({
  message,
  peerLabel,
  onReply,
  onOpenImage,
}: {
  message: DmMessageRow;
  peerLabel: string;
  onReply: (message: DmMessageRow) => void;
  onOpenImage: (url: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    tracking: boolean;
    horizontal: boolean;
    dx: number;
  } | null>(null);

  const openMenu = useCallback((coords: { x: number; y: number }) => {
    setMenu(coords);
  }, []);

  const { longPressHandlers, longPressFired, clearLongPressFired } =
    useLongPress(openMenu);

  const jumpToReply = useCallback(() => {
    if (!message.replyTo) return;
    const el = document.getElementById(`dm-msg-${message.replyTo._id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [message.replyTo]);

  const menuItems: StudioDmContextMenuItem[] = [
    {
      key: "reply",
      label: "Reply",
      icon: <Reply aria-hidden="true" />,
      onSelect: () => onReply(message),
    },
  ];

  const bubbleClass = [
    "studio-dm-bubble",
    message.kind === "voice" ? "is-voice" : "",
    message.kind === "image" ? "is-image" : "",
    message.replyTo ? "has-reply" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const rowStyle: CSSProperties | undefined = swipeX
    ? {
        transform: `translateX(${swipeX}px)`,
        transition: swipeRef.current?.tracking ? "none" : "transform 160ms ease",
      }
    : undefined;

  return (
    <>
      <div
        id={`dm-msg-${message._id}`}
        className={`studio-dm-swipe-shell${message.fromMe ? " is-mine" : ""}`}
      >
        <span
          className="studio-dm-swipe-reply"
          style={{ opacity: Math.min(1, swipeX / SWIPE_REPLY_THRESHOLD) }}
          aria-hidden="true"
        >
          <Reply />
        </span>
        <div
          className={`studio-dm-bubble-row${message.fromMe ? " is-mine" : ""}`}
          style={rowStyle}
          onContextMenu={(event) => {
            event.preventDefault();
            openMenu({ x: event.clientX, y: event.clientY });
          }}
          onTouchStart={(event: ReactTouchEvent) => {
            const lp = longPressHandlers as {
              onTouchStart?: (e: ReactTouchEvent) => void;
            };
            lp.onTouchStart?.(event);
            const touch = event.touches[0];
            if (!touch) return;
            swipeRef.current = {
              startX: touch.clientX,
              startY: touch.clientY,
              tracking: true,
              horizontal: false,
              dx: 0,
            };
            setSwipeX(0);
          }}
          onTouchMove={(event: ReactTouchEvent) => {
            const lp = longPressHandlers as {
              onTouchMove?: (e: ReactTouchEvent) => void;
            };
            lp.onTouchMove?.(event);
            const state = swipeRef.current;
            const touch = event.touches[0];
            if (!state?.tracking || !touch) return;
            const dx = touch.clientX - state.startX;
            const dy = touch.clientY - state.startY;
            if (!state.horizontal) {
              if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
              if (Math.abs(dx) <= Math.abs(dy)) {
                swipeRef.current = null;
                setSwipeX(0);
                return;
              }
              state.horizontal = true;
            }
            const next = Math.max(0, Math.min(SWIPE_REPLY_MAX, dx));
            state.dx = next;
            setSwipeX(next);
          }}
          onTouchEnd={() => {
            const lp = longPressHandlers as {
              onTouchEnd?: () => void;
            };
            lp.onTouchEnd?.();
            const state = swipeRef.current;
            swipeRef.current = null;
            if (state?.horizontal && state.dx >= SWIPE_REPLY_THRESHOLD) {
              onReply(message);
            }
            setSwipeX(0);
          }}
          onTouchCancel={() => {
            const lp = longPressHandlers as {
              onTouchCancel?: () => void;
            };
            lp.onTouchCancel?.();
            swipeRef.current = null;
            setSwipeX(0);
          }}
          onClick={() => {
            if (longPressFired()) {
              clearLongPressFired();
            }
          }}
        >
          <div className={bubbleClass}>
            {message.replyTo ? (
              <DmReplyQuote
                snippet={message.replyTo}
                peerLabel={peerLabel}
                onJump={jumpToReply}
              />
            ) : null}
            {message.kind === "voice" ? (
              <div className="studio-dm-bubble-body">
                {message.audioUrl ? (
                  <StudioChatAudioPlayer
                    src={message.audioUrl}
                    title="Voice message"
                    durationHint={message.durationSec}
                  />
                ) : (
                  <p className="studio-dm-voice-missing">
                    Voice message unavailable
                  </p>
                )}
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                />
              </div>
            ) : message.kind === "image" ? (
              <>
                {message.imageUrl ? (
                  <button
                    type="button"
                    className="studio-dm-image-btn"
                    onClick={() => onOpenImage(message.imageUrl!)}
                    aria-label="View image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={message.imageUrl}
                      alt={message.body || "Photo"}
                      className="studio-dm-image"
                    />
                  </button>
                ) : (
                  <p className="studio-dm-voice-missing">Photo unavailable</p>
                )}
                {message.body ? <p>{message.body}</p> : null}
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                />
              </>
            ) : (
              <div className="studio-dm-bubble-body">
                <p>{message.body}</p>
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {menu ? (
        <StudioDmContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

async function uploadDmBlob(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
): Promise<Id<"_storage">> {
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: blob,
  });
  if (!result.ok) throw new Error("Upload failed");
  const json = (await result.json()) as { storageId: Id<"_storage"> };
  if (!json.storageId) throw new Error("Upload failed");
  return json.storageId;
}

export type DmConversationId = Id<"dmConversations">;

type StudioMessagesPaneProps = {
  conversationId: DmConversationId | null;
  onSelectConversation: (conversationId: DmConversationId | null) => void;
  onOpenProfile?: (username: string) => void;
  /** Jump to Offers → Jobs for deliver/manage. */
  onOpenOffersJobs?: () => void;
  /** When true (mobile), empty pane shows the chat list instead of the select prompt. */
  showChatListWhenEmpty?: boolean;
  /**
   * Desktop: open the left Files rail in pick mode (owner-scoped root).
   * When omitted (mobile), the sheet picker is used instead.
   */
  onRequestPickAsset?: (request: {
    kinds?: ReadonlyArray<"image" | "video" | "audio" | "document">;
    title?: string;
    onPick: (asset: StudioAssetPick) => void;
    onCancel?: () => void;
  }) => void;
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
  onOpenOffersJobs,
  showChatListWhenEmpty = false,
  onRequestPickAsset,
}: StudioMessagesPaneProps) {
  const { isMobile } = useMobileLayout();
  const [expiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  );
  const [peerSidebarOpen, setPeerSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(PEER_SIDEBAR_OPEN_KEY);
    if (stored === null) return true;
    return stored === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PEER_SIDEBAR_OPEN_KEY,
      peerSidebarOpen ? "1" : "0",
    );
  }, [peerSidebarOpen]);
  const conversations = useQuery(api.dms.listMyConversations, { expiresUnix });
  const messages = useQuery(
    api.dms.listMessages,
    conversationId ? { conversationId } : "skip",
  );
  const send = useMutation(api.dms.sendMessage);
  const markRead = useMutation(api.dms.markRead);
  const ackDelivered = useMutation(api.dms.ackDelivered);
  const prepareAttachmentUpload = useMutation(api.dms.prepareAttachmentUpload);
  const sendVoiceMessage = useMutation(api.dms.sendVoiceMessage);
  const sendImageMessage = useMutation(api.dms.sendImageMessage);

  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DmReplySnippet | null>(null);
  const replyToRef = useRef<DmReplySnippet | null>(null);
  replyToRef.current = replyTo;
  const [assignPeer, setAssignPeer] = useState<{
    userId: Id<"users">;
    label: string;
    avatarUrl?: string | null;
  } | null>(null);
  const [listContext, setListContext] = useState<{
    x: number;
    y: number;
    userId: Id<"users">;
    label: string;
    avatarUrl?: string | null;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachBtnRef = useRef<HTMLButtonElement | null>(null);
  const [attachMenu, setAttachMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [filesPickerOpen, setFilesPickerOpen] = useState(false);
  const [filesPickBusy, setFilesPickBusy] = useState(false);
  const [filesPickerExpiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60,
  );
  const convex = useConvex();

  const clearPendingImage = useCallback(() => {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  function openAttachMenu() {
    const btn = attachBtnRef.current;
    if (!btn) {
      setAttachMenu({ x: 16, y: window.innerHeight - 120 });
      return;
    }
    const rect = btn.getBoundingClientRect();
    // Menu opens upward from the paperclip so it clears the composer.
    setAttachMenu({ x: rect.left, y: Math.max(8, rect.top - 8) });
  }

  /** Voice-note recorder (WhatsApp-style: mic replaces send while draft is empty). */
  const [recState, setRecState] = useState<"idle" | "recording" | "sending">(
    "idle",
  );
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartedAtRef = useRef(0);
  const recIntentRef = useRef<"send" | "cancel">("cancel");

  const teardownRecorder = useCallback(() => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    recStreamRef.current?.getTracks().forEach((track) => track.stop());
    recStreamRef.current = null;
    recorderRef.current = null;
  }, []);

  const finishRecording = useCallback(
    (intent: "send" | "cancel") => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      recIntentRef.current = intent;
      setRecState(intent === "send" ? "sending" : "idle");
      recorder.stop();
    },
    [],
  );

  const startRecording = useCallback(async () => {
    if (!conversationId || recState !== "idle") return;
    setSendError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setSendError("Microphone access was blocked");
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
    recStartedAtRef.current = Date.now();
    setRecSeconds(0);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const durationSec = Math.min(
        VOICE_NOTE_MAX_SECONDS,
        (Date.now() - recStartedAtRef.current) / 1000,
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
          setSendError("Voice note too short — hold on a bit longer");
        }
        return;
      }

      void (async () => {
        try {
          const uploadUrl = await prepareAttachmentUpload({
            conversationId: conversationId!,
          });
          const storageId = await uploadDmBlob(
            uploadUrl,
            blob,
            blob.type || "audio/webm",
          );
          const replyId = replyToRef.current?._id;
          await sendVoiceMessage({
            conversationId: conversationId!,
            storageId,
            durationSec,
            replyToMessageId: replyId,
          });
          setReplyTo(null);
        } catch (error) {
          setSendError(friendlyConvexError(error, "Could not send voice note"));
        } finally {
          setRecState("idle");
        }
      })();
    };

    recorder.start(250);
    setRecState("recording");
    recTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - recStartedAtRef.current) / 1000;
      setRecSeconds(elapsed);
      if (elapsed >= VOICE_NOTE_MAX_SECONDS) finishRecording("send");
    }, 250);
  }, [
    conversationId,
    finishRecording,
    prepareAttachmentUpload,
    recState,
    sendVoiceMessage,
    teardownRecorder,
  ]);

  // Discard any in-flight recording when leaving the chat or unmounting.
  useEffect(() => {
    return () => {
      recIntentRef.current = "cancel";
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      teardownRecorder();
    };
  }, [conversationId, teardownRecorder]);

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

  // Device delivery ACK — when inbound messages arrive over the Convex WS.
  useEffect(() => {
    if (!conversationId || !messages?.length) return;
    let maxInbound = 0;
    for (const message of messages) {
      if (!message.fromMe && message.createdAt > maxInbound) {
        maxInbound = message.createdAt;
      }
    }
    if (maxInbound <= 0) return;
    void ackDelivered({ conversationId, upToCreatedAt: maxInbound });
  }, [ackDelivered, conversationId, lastMessageId, messages]);

  useEffect(() => {
    setDraft("");
    setSendError("");
    clearPendingImage();
    setLightboxUrl(null);
    setReplyTo(null);
    if (conversationId) inputRef.current?.focus();
  }, [clearPendingImage, conversationId]);

  const armReply = useCallback((message: DmMessageRow) => {
    setReplyTo({
      _id: message._id,
      body: message.body,
      kind: message.kind,
      fromMe: message.fromMe,
      audioUrl: message.audioUrl,
      imageUrl: message.imageUrl,
      durationSec: message.durationSec,
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  function pickImageFile(file: File | undefined) {
    if (!file) return;
    const type = (file.type || "").toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(type)) {
      setSendError("Only JPEG, PNG, WebP, or GIF images are allowed");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setSendError("Images must be 10 MB or smaller");
      return;
    }
    setSendError("");
    clearPendingImage();
    setPendingImage({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  async function pickStudioFileAsset(asset: StudioAssetPick) {
    setFilesPickBusy(true);
    setSendError("");
    try {
      const mime = (asset.mimeType || "").toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(mime)) {
        setSendError("Only JPEG, PNG, WebP, or GIF images are allowed");
        return;
      }
      const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 30;
      const url = await convex.query(api.assets.signedReadUrl, {
        assetId: asset._id,
        expiresUnix,
      });
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not load that file");
      const blob = await response.blob();
      if (blob.size > IMAGE_MAX_BYTES) {
        setSendError("Images must be 10 MB or smaller");
        return;
      }
      const type = blob.type || mime || "image/jpeg";
      if (!ALLOWED_IMAGE_TYPES.has(type.toLowerCase())) {
        setSendError("Only JPEG, PNG, WebP, or GIF images are allowed");
        return;
      }
      const file = new File([blob], asset.name || "photo.jpg", { type });
      pickImageFile(file);
      setFilesPickerOpen(false);
    } catch (error) {
      setSendError(friendlyConvexError(error, "Could not load that file"));
    } finally {
      setFilesPickBusy(false);
    }
  }

  async function handleSend() {
    if (!conversationId || sendBusy || recState !== "idle") return;
    const body = draft.trim();
    if (!pendingImage && !body) return;

    setSendBusy(true);
    setSendError("");
    try {
      if (pendingImage) {
        const uploadUrl = await prepareAttachmentUpload({ conversationId });
        const storageId = await uploadDmBlob(
          uploadUrl,
          pendingImage.file,
          pendingImage.file.type || "image/jpeg",
        );
        await sendImageMessage({
          conversationId,
          storageId,
          caption: body || undefined,
          replyToMessageId: replyTo?._id,
        });
        clearPendingImage();
      } else {
        await send({
          conversationId,
          body,
          replyToMessageId: replyTo?._id,
        });
      }
      setDraft("");
      setReplyTo(null);
      inputRef.current?.focus();
    } catch (error) {
      setSendError(friendlyConvexError(error, "Could not send message"));
    } finally {
      setSendBusy(false);
    }
  }

  const canSend = Boolean(pendingImage || draft.trim());

  if (!conversationId) {
    if (showChatListWhenEmpty) {
      const listMenuItems: StudioDmContextMenuItem[] = listContext
        ? [
            {
              key: "labels",
              label: "Labels",
              icon: <Tags aria-hidden="true" />,
              onSelect: () => {
                setAssignPeer({
                  userId: listContext.userId,
                  label: listContext.label,
                  avatarUrl: listContext.avatarUrl,
                });
              },
            },
          ]
        : [];
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
                      onContextMenu={(coords) =>
                        setListContext({
                          ...coords,
                          userId: row.peer.userId,
                          label:
                            row.peer.displayName?.trim() ||
                            `@${row.peer.username}`,
                          avatarUrl: row.peer.avatarUrl,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <StudioDmAssignLabelsDialog
            open={Boolean(assignPeer)}
            variant="modal"
            peerUserId={assignPeer?.userId ?? null}
            peerLabel={assignPeer?.label ?? ""}
            peerAvatarUrl={assignPeer?.avatarUrl}
            onClose={() => setAssignPeer(null)}
          />
          {listContext ? (
            <StudioDmContextMenu
              x={listContext.x}
              y={listContext.y}
              items={listMenuItems}
              onClose={() => setListContext(null)}
            />
          ) : null}
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

  const chatColumn = (
    <div className="studio-dm-chat-column">
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
            <strong>
              <span className="studio-dm-name-text">{peerLabel}</span>
              <StudioDmProviderTag tag={activeRow?.peer.sellerTag} />
            </strong>
            {activeRow ? (
              <span
                className={
                  activeRow.peerOnline
                    ? "studio-dm-peer-status is-online"
                    : undefined
                }
              >
                {activeRow.peerOnline
                  ? "Online"
                  : `@${activeRow.peer.username}`}
              </span>
            ) : null}
          </span>
        </button>
        <div className="cursor-panel-head-tools studio-dm-chat-head-tools">
          <button
            type="button"
            className={`studio-composer-circle-btn studio-dm-peer-toggle${peerSidebarOpen ? " is-on" : ""}`}
            aria-label={
              peerSidebarOpen ? "Close chat details" : "Open chat details"
            }
            aria-pressed={peerSidebarOpen}
            title={peerSidebarOpen ? "Close chat details" : "Chat details"}
            onClick={() => setPeerSidebarOpen((open) => !open)}
          >
            <Wrench size={14} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
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
                  <DmMessageBubble
                    message={message}
                    peerLabel={peerLabel}
                    onReply={armReply}
                    onOpenImage={setLightboxUrl}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sendError ? <p className="studio-dm-error">{sendError}</p> : null}

      {replyTo && recState === "idle" ? (
        <div
          className={`studio-dm-reply-preview${replyTo.kind === "voice" && replyTo.audioUrl ? " is-voice" : ""}${replyTo.kind === "image" && replyTo.imageUrl ? " is-image" : ""}`}
        >
          {replyTo.kind === "image" && replyTo.imageUrl ? (
            <div className="studio-dm-reply-preview-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={replyTo.imageUrl} alt="" />
            </div>
          ) : (
            <span className="studio-dm-reply-preview-icon" aria-hidden="true">
              {replyTo.kind === "voice" || replyTo.kind === "image" ? (
                <ReplyKindIcon kind={replyTo.kind} className="h-3.5 w-3.5" />
              ) : (
                <Reply className="h-3.5 w-3.5" />
              )}
            </span>
          )}
          <span className="studio-dm-reply-preview-copy">
            <strong>
              Replying to {replyTo.fromMe ? "yourself" : peerLabel}
            </strong>
            {replyTo.kind === "voice" && replyTo.audioUrl ? (
              <div className="studio-dm-reply-voice">
                <StudioChatAudioPlayer
                  src={replyTo.audioUrl}
                  title="Voice message"
                  durationHint={replyTo.durationSec}
                />
              </div>
            ) : (
              <span className="studio-dm-reply-snippet">
                <ReplyKindIcon kind={replyTo.kind} />
                {replySnippetLabel(replyTo)}
              </span>
            )}
          </span>
          <button
            type="button"
            className="studio-dm-attach-clear"
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {pendingImage && recState === "idle" ? (
        <div className="studio-dm-attach-preview">
          <div className="studio-dm-attach-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage.previewUrl} alt="" />
            <span className="studio-dm-attach-badge" aria-hidden="true">
              <ImageIcon className="h-3 w-3" />
            </span>
          </div>
          <span className="studio-dm-attach-name">{pendingImage.file.name}</span>
          <button
            type="button"
            className="studio-dm-attach-clear"
            onClick={clearPendingImage}
            aria-label="Remove attachment"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <footer className="studio-dm-composer">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="studio-dm-file-input"
          onChange={(event) => {
            pickImageFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {recState !== "idle" ? (
          <div
            className="studio-dm-recording"
            role="status"
            aria-label="Recording voice note"
          >
            <button
              type="button"
              className="studio-dm-rec-cancel"
              onClick={() => finishRecording("cancel")}
              disabled={recState === "sending"}
              aria-label="Discard recording"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="studio-dm-rec-meta">
              <span
                className={`studio-dm-rec-dot${recState === "recording" ? " is-live" : ""}`}
                aria-hidden="true"
              />
              <span className="studio-dm-rec-time">
                {recordingTimeLabel(recSeconds)}
              </span>
            </span>
            <MicrophoneWaveform
              className="studio-dm-rec-wave"
              active={recState === "recording"}
              processing={recState === "sending"}
              height={32}
              barWidth={3}
              barGap={2}
              barRadius={999}
              barColor="gray"
              sensitivity={1.6}
              fadeEdges
              fadeWidth={20}
            />
            <button
              type="button"
              className="studio-dm-send"
              onClick={() => finishRecording("send")}
              disabled={recState === "sending"}
              aria-label="Send voice note"
            >
              {recState === "sending" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        ) : (
          <>
            <button
              ref={attachBtnRef}
              type="button"
              className="studio-dm-attach"
              onClick={openAttachMenu}
              disabled={sendBusy || filesPickBusy}
              aria-label="Attach a photo"
              aria-haspopup="menu"
              aria-expanded={attachMenu != null}
            >
              {filesPickBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              placeholder={pendingImage ? "Add a caption…" : "Message…"}
              aria-label={`Message ${peerLabel}`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              onPaste={(event) => {
                const items = event.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                  if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                      event.preventDefault();
                      pickImageFile(file);
                      return;
                    }
                  }
                }
              }}
            />
            {canSend ? (
              <button
                type="button"
                className="studio-dm-send"
                onClick={() => void handleSend()}
                disabled={sendBusy}
                aria-label={pendingImage ? "Send photo" : "Send message"}
              >
                {sendBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            ) : (
              <button
                type="button"
                className="studio-dm-send is-mic"
                onClick={() => void startRecording()}
                aria-label="Record a voice note"
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </footer>

      {attachMenu ? (
        <StudioDmContextMenu
          x={attachMenu.x}
          y={attachMenu.y}
          onClose={() => setAttachMenu(null)}
          items={[
            {
              key: "upload",
              label: "Upload photo",
              icon: <Upload className="h-3.5 w-3.5" aria-hidden="true" />,
              onSelect: () => fileInputRef.current?.click(),
            },
            {
              key: "studio-files",
              label: "Choose from Studio Files",
              icon: <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />,
              onSelect: () => {
                // Desktop: open the left Files rail in pick mode (owner root only).
                // Mobile: keep the sheet picker.
                if (onRequestPickAsset && !isMobile) {
                  onRequestPickAsset({
                    kinds: ["image"],
                    title: "Pick a photo to send",
                    onPick: (asset) => {
                      void pickStudioFileAsset(asset);
                    },
                  });
                  return;
                }
                setFilesPickerOpen(true);
              },
            },
          ]}
        />
      ) : null}

      {filesPickerOpen ? (
        <StudioAssetPickerSheet
          title="Choose a photo to send"
          kinds={["image"]}
          expiresUnix={filesPickerExpiresUnix}
          onPick={(asset) => {
            void pickStudioFileAsset(asset);
          }}
          onClose={() => {
            if (!filesPickBusy) setFilesPickerOpen(false);
          }}
        />
      ) : null}

      {lightboxUrl ? (
        <div
          className="studio-dm-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="studio-dm-lightbox-close"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );

  const peerSidebar =
    activeRow && peerSidebarOpen ? (
      <StudioDmPeerSidebar
        peerUserId={activeRow.peer.userId}
        peerUsername={activeRow.peer.username}
        open={peerSidebarOpen}
        onClose={() => setPeerSidebarOpen(false)}
        onOpenProfile={onOpenProfile}
        onOpenOffersJobs={onOpenOffersJobs}
        variant={isMobile ? "sheet" : "docked"}
      />
    ) : null;

  if (isMobile || !peerSidebarOpen || !activeRow) {
    return (
      <div className="studio-dm-pane">
        {chatColumn}
        {peerSidebar}
      </div>
    );
  }

  return (
    <div className="studio-dm-pane is-split">
      <PanelGroup
        direction="horizontal"
        autoSaveId="studio-dm-peer-h"
        className="studio-dm-peer-panels h-full min-h-0 min-w-0 overflow-hidden"
      >
        <Panel
          id="studio-dm-chat"
          order={1}
          defaultSize={72}
          minSize={45}
          className="min-h-0 min-w-0"
        >
          {chatColumn}
        </Panel>
        <PanelResizeHandle className="cursor-resize" />
        <Panel
          id="studio-dm-peer"
          order={2}
          defaultSize={28}
          minSize={20}
          maxSize={40}
          className="min-h-0 min-w-0"
        >
          {peerSidebar}
        </Panel>
      </PanelGroup>
    </div>
  );
}

export function StudioDmConversationRow({
  row,
  active,
  onSelect,
  onContextMenu,
}: {
  row: {
    conversationId: DmConversationId;
    peer: {
      userId?: Id<"users">;
      username: string;
      displayName?: string;
      avatarUrl?: string;
      sellerTag?: "freelancer" | "business";
    };
    labels?: Array<{ labelId: Id<"dmLabels">; name: string; icon: string }>;
    lastMessagePreview?: string;
    lastMessageAt: number;
    lastMessageFromMe: boolean;
    lastMessageReceipt: DmReceipt;
    peerOnline?: boolean;
    unread: boolean;
  };
  active: boolean;
  onSelect: () => void;
  onContextMenu?: (coords: { x: number; y: number }) => void;
}) {
  const label = row.peer.displayName?.trim() || `@${row.peer.username}`;
  const preview = row.lastMessagePreview || "Tap to start chatting";
  const peerLabels = row.labels ?? [];
  const { longPressHandlers, longPressFired, clearLongPressFired } =
    useLongPress(onContextMenu);

  return (
    <button
      type="button"
      className={`studio-dm-row${active ? " is-active" : ""}${row.unread ? " is-unread" : ""}${row.peerOnline ? " is-peer-online" : ""}`}
      {...longPressHandlers}
      onClick={() => {
        if (longPressFired()) {
          clearLongPressFired();
          return;
        }
        onSelect();
      }}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <span className="studio-dm-row-main">
        <span className="studio-dm-row-avatar-wrap">
          <StudioProfileAvatar
            size="sm"
            src={row.peer.avatarUrl}
            displayName={row.peer.displayName}
            name={row.peer.username}
            alt=""
          />
          {row.peerOnline ? (
            <span className="studio-dm-online-dot" aria-label="Online" />
          ) : null}
        </span>
        <span className="studio-dm-row-copy">
          <span className="studio-dm-row-top">
            <strong>
              <span className="studio-dm-name-text">{label}</span>
              <StudioDmProviderTag tag={row.peer.sellerTag} />
            </strong>
            <time className={row.unread ? "is-unread" : undefined}>
              {conversationTimeLabel(row.lastMessageAt)}
            </time>
          </span>
          <span className="studio-dm-row-bottom">
            <span className="studio-dm-row-preview">
              {row.lastMessageFromMe ? (
                <DmReadReceipt receipt={row.lastMessageReceipt} />
              ) : null}
              {preview}
            </span>
            {row.unread ? (
              <span className="studio-dm-unread-dot" aria-label="Unread" />
            ) : null}
          </span>
        </span>
      </span>
      {peerLabels.length > 0 ? (
        <span className="studio-dm-row-labels" aria-label="Labels">
          {peerLabels.slice(0, 6).map((item) => {
            const Icon = dmLabelIcon(item.icon);
            return (
              <span
                key={item.labelId}
                className="studio-dm-row-label"
                title={item.name}
              >
                <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                {item.name}
              </span>
            );
          })}
        </span>
      ) : null}
    </button>
  );
}
