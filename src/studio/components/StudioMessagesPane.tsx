"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FolderOpen,
  ImageIcon,
  Loader2,
  Hammer,
  MessageCircle,
  Mic,
  Paperclip,
  Reply,
  SendHorizontal,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MicrophoneWaveform } from "@/components/ui/waveform";
import { useLongPress } from "@/desk/hooks/use-long-press";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { useMobileBackLayer } from "@/studio/components/MobileBackStackHost";
import {
  dmLiveOrCached,
  readDmConversations,
  readDmMessages,
  rememberDmConversations,
  rememberDmMessages,
} from "@/studio/lib/dmClientCache";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { dmLabelIcon } from "@/studio/lib/dmLabelIcons";
import {
  dmPhotoAssetName,
  dmVoiceAssetName,
} from "@/studio/lib/dmMediaNames";
import {
  clearPendingDmFeedShare,
  feedShareDragTypes,
  looksLikeFeedShareJson,
  parseFeedSharePayload,
  readFeedShareDataTransfer,
  setPendingDmFeedShare,
  usePendingDmFeedShare,
  type StudioFeedSharePayload,
} from "@/studio/lib/studioFeedShare";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
import { StudioDmAssignLabelsDialog } from "./StudioDmLabelDialogs";
import { StudioDmContextMenu,
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

const MAX_PENDING_IMAGES = 10;

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
  kind: "text" | "voice" | "image" | "post" | "comment";
  fromMe: boolean;
  audioUrl?: string;
  imageUrl?: string;
  durationSec?: number;
};

type DmFeedShare = {
  type: "post" | "comment";
  postId: Id<"profilePosts">;
  commentId?: Id<"profileComments">;
  username?: string;
  displayName?: string;
  caption?: string;
  body?: string;
  thumbnailUrl?: string;
  unavailable?: boolean;
};

type DmMessageRow = {
  _id: Id<"dmMessages">;
  body: string;
  kind: "text" | "voice" | "image" | "post" | "comment";
  audioUrl?: string;
  imageUrl?: string;
  contentType?: string;
  durationSec?: number;
  fromMe: boolean;
  receipt: DmReceipt;
  replyTo?: DmReplySnippet;
  feedShare?: DmFeedShare;
  createdAt: number;
};

function replySnippetLabel(
  snippet: Pick<DmReplySnippet, "body" | "kind">,
): string {
  if (snippet.kind === "voice") return "Voice message";
  if (snippet.kind === "post") return snippet.body.trim() || "Post";
  if (snippet.kind === "comment") {
    const body = snippet.body.trim();
    if (body.startsWith("Comment")) return body;
    return body ? `Comment · ${body}` : "Comment";
  }
  if (snippet.kind === "image") {
    const caption = snippet.body.trim();
    // Server may already prefix "Photo · …"
    if (caption.startsWith("Photo")) return caption;
    return caption ? `Photo · ${caption}` : "Photo";
  }
  return snippet.body.trim() || "Message";
}

/**
 * Optional note under a feed share card (same role as an image caption).
 * Hides legacy rows where body was filled with the post caption / comment text.
 */
function feedShareNote(
  message: Pick<DmMessageRow, "body" | "kind" | "feedShare">,
): string | null {
  const note = message.body.trim();
  if (!note || !message.feedShare) return null;
  const shared =
    message.kind === "comment"
      ? (message.feedShare.body ?? "").trim()
      : (message.feedShare.caption ?? "").trim();
  if (shared && note === shared) return null;
  return note;
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
  if (kind === "post" || kind === "comment") {
    return <MessageCircle className={className} aria-hidden="true" />;
  }
  return null;
}

function DmFeedShareCard({
  share,
  onOpen,
  compact = false,
}: {
  share: DmFeedShare | StudioFeedSharePayload;
  onOpen?: (postId: Id<"profilePosts">) => void;
  /** Smaller tile for the composer attach strip. */
  compact?: boolean;
}) {
  const unavailable = "unavailable" in share ? Boolean(share.unavailable) : false;
  const author =
    share.displayName?.trim() ||
    (share.username ? `@${share.username}` : "Post");
  const isComment = share.type === "comment";
  const caption = share.caption?.trim() || "";
  const commentBody =
    ("body" in share ? share.body?.trim() : undefined) || caption || "Comment";

  if (isComment) {
    return (
      <button
        type="button"
        className={`studio-dm-feed-share is-comment${compact ? " is-compact" : ""}${unavailable ? " is-unavailable" : ""}`}
        disabled={unavailable || !onOpen}
        onClick={(event) => {
          event.stopPropagation();
          if (!unavailable) onOpen?.(share.postId as Id<"profilePosts">);
        }}
      >
        {share.thumbnailUrl ? (
          <span className="studio-dm-feed-share-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={share.thumbnailUrl} alt="" />
          </span>
        ) : (
          <span className="studio-dm-feed-share-thumb is-empty" aria-hidden="true">
            <MessageCircle className="h-4 w-4" />
          </span>
        )}
        <span className="studio-dm-feed-share-copy">
          <strong>
            {unavailable ? "Unavailable" : `Comment · ${author}`}
          </strong>
          <span>
            {unavailable ? "This post is no longer available" : commentBody}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`studio-dm-feed-share is-post${compact ? " is-compact" : ""}${unavailable ? " is-unavailable" : ""}`}
      disabled={unavailable || !onOpen}
      onClick={(event) => {
        event.stopPropagation();
        if (!unavailable) onOpen?.(share.postId as Id<"profilePosts">);
      }}
    >
      <span className="studio-dm-feed-share-media">
        {share.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={share.thumbnailUrl} alt="" />
        ) : (
          <span className="studio-dm-feed-share-media-empty" aria-hidden="true">
            <ImageIcon className="h-6 w-6" />
          </span>
        )}
        <span className="studio-dm-feed-share-media-scrim" aria-hidden="true" />
        <span className="studio-dm-feed-share-media-meta">
          <strong>{unavailable ? "Unavailable" : author}</strong>
          <span>
            {unavailable
              ? "This post is no longer available"
              : caption || "Post"}
          </span>
        </span>
      </span>
    </button>
  );
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

const DmMessageBubble = memo(function DmMessageBubble({
  message,
  peerLabel,
  onReply,
  onOpenImage,
  onOpenFeedPost,
}: {
  message: DmMessageRow;
  peerLabel: string;
  onReply: (message: DmMessageRow) => void;
  onOpenImage: (url: string) => void;
  onOpenFeedPost?: (postId: Id<"profilePosts">) => void;
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
    message.kind === "post" || message.kind === "comment" ? "is-feed-share" : "",
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
            ) : message.kind === "post" || message.kind === "comment" ? (
              <div className="studio-dm-bubble-body">
                {message.feedShare ? (
                  <DmFeedShareCard
                    share={message.feedShare}
                    onOpen={onOpenFeedPost}
                  />
                ) : (
                  <p className="studio-dm-voice-missing">Post unavailable</p>
                )}
                {feedShareNote(message) ? (
                  <p>{feedShareNote(message)}</p>
                ) : null}
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                />
              </div>
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
});

/** Upload a blob into the user's protected Messages folder (billable Bunny asset). */
async function uploadDmMediaAsset(args: {
  blob: Blob;
  name: string;
  kind: "image" | "audio";
  mimeType: string;
  ensureMessagesFolder: () => Promise<Id<"folders">>;
  reserveUpload: Parameters<typeof uploadStudioAsset>[0]["reserveUpload"];
  commitStagingUpload: Parameters<typeof uploadStudioAsset>[0]["commitStagingUpload"];
}): Promise<Id<"assets">> {
  const folderId = await args.ensureMessagesFolder();
  const file =
    args.blob instanceof File
      ? args.blob
      : new File([args.blob], args.name, { type: args.mimeType });
  return await uploadStudioAsset({
    file,
    folderId,
    kind: args.kind,
    name: args.name,
    reserveUpload: args.reserveUpload,
    commitStagingUpload: args.commitStagingUpload,
  });
}

export type DmConversationId = Id<"dmConversations">;

type StudioMessagesPaneProps = {
  conversationId: DmConversationId | null;
  onSelectConversation: (conversationId: DmConversationId | null) => void;
  onOpenProfile?: (username: string) => void;
  /** Open a shared feed post from a DM share card. */
  onOpenFeedPost?: (postId: Id<"profilePosts">) => void;
  /** Jump to Offers → Jobs for deliver/manage. */
  onOpenOffersJobs?: () => void;
  /** When true (mobile), empty pane shows the chat list instead of the select prompt. */
  showChatListWhenEmpty?: boolean;
  /**
   * Chat fills the left rail (e.g. Creative Network Messages). Shows back,
   * never opens a Messages tab, and skips the peer-details split.
   */
  embeddedInRail?: boolean;
  /**
   * Desktop: open the left Files rail in pick mode (owner-scoped root).
   * When omitted (mobile), the sheet picker is used instead.
   */
  onRequestPickAsset?: (request: {
    kinds?: ReadonlyArray<"image" | "video" | "audio" | "document">;
    title?: string;
    maxSelected?: number;
    onConfirm?: (assets: StudioAssetPick[]) => void;
    onPick?: (asset: StudioAssetPick) => void;
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
  onOpenFeedPost,
  onOpenOffersJobs,
  showChatListWhenEmpty = false,
  embeddedInRail = false,
  onRequestPickAsset,
}: StudioMessagesPaneProps) {
  const { isMobile } = useMobileLayout();
  const showBack = showChatListWhenEmpty || embeddedInRail;
  const [expiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  );
  const [peerSidebarOpen, setPeerSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    if (embeddedInRail) return false;
    const stored = window.localStorage.getItem(PEER_SIDEBAR_OPEN_KEY);
    if (stored === null) return true;
    return stored === "1";
  });

  useEffect(() => {
    if (embeddedInRail) {
      setPeerSidebarOpen(false);
      return;
    }
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PEER_SIDEBAR_OPEN_KEY,
      peerSidebarOpen ? "1" : "0",
    );
  }, [embeddedInRail, peerSidebarOpen]);
  const conversationsLive = useQuery(api.dms.listMyConversations, { expiresUnix });
  const messagesLive = useQuery(
    api.dms.listMessages,
    conversationId ? { conversationId, expiresUnix } : "skip",
  );

  useEffect(() => {
    rememberDmConversations(conversationsLive);
  }, [conversationsLive]);
  useEffect(() => {
    if (conversationId) rememberDmMessages(conversationId, messagesLive);
  }, [conversationId, messagesLive]);

  const conversationsCached = readDmConversations<typeof conversationsLive>();
  const messagesCached = conversationId
    ? readDmMessages<typeof messagesLive>(conversationId)
    : null;
  const { data: conversations } = dmLiveOrCached(
    conversationsLive,
    conversationsCached ?? null,
  );
  const { data: messages, pending: messagesPending } = dmLiveOrCached(
    messagesLive,
    messagesCached ?? null,
  );

  const send = useMutation(api.dms.sendMessage);
  const setTyping = useMutation(api.dms.setTyping);
  const markRead = useMutation(api.dms.markRead);
  const ackDelivered = useMutation(api.dms.ackDelivered);
  const ensureMessagesFolder = useMutation(api.folders.ensureMessagesFolderForMe);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);
  const sendVoiceMessage = useMutation(api.dms.sendVoiceMessage);
  const sendImageMessage = useMutation(api.dms.sendImageMessage);
  const sendFeedShare = useMutation(api.dms.sendFeedShare);

  const [draft, setDraft] = useState("");
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const lastTypingPingRef = useRef(0);
  const typingActiveRef = useRef(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DmReplySnippet | null>(null);
  const replyToRef = useRef<DmReplySnippet | null>(null);
  replyToRef.current = replyTo;
  const pendingFeedShareStore = usePendingDmFeedShare();
  const pendingFeedShare =
    conversationId &&
    pendingFeedShareStore?.conversationId === conversationId
      ? pendingFeedShareStore.payload
      : null;
  const peerLabelRef = useRef("Chat");
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
  const [mobilePickSelected, setMobilePickSelected] = useState<
    StudioAssetPick[]
  >([]);
  const [filesPickerExpiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60,
  );

  useMobileBackLayer("dm-lightbox", Boolean(lightboxUrl), () => {
    setLightboxUrl(null);
  });
  useMobileBackLayer("dm-attach-menu", Boolean(attachMenu), () => {
    setAttachMenu(null);
  });
  useMobileBackLayer("dm-list-context", Boolean(listContext), () => {
    setListContext(null);
  });
  useMobileBackLayer("dm-assign-label", Boolean(assignPeer), () => {
    setAssignPeer(null);
  });
  useMobileBackLayer(
    "dm-peer-sheet",
    isMobile && !embeddedInRail && peerSidebarOpen && Boolean(conversationId),
    () => {
      setPeerSidebarOpen(false);
    },
  );

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, []);

  const removePendingImageAt = useCallback((index: number) => {
    setPendingImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
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
          const assetId = await uploadDmMediaAsset({
            blob,
            name: dmVoiceAssetName({
              peerLabel: peerLabelRef.current,
              durationSec,
              mimeType: blob.type || "audio/webm",
            }),
            kind: "audio",
            mimeType: blob.type || "audio/webm",
            ensureMessagesFolder: () => ensureMessagesFolder({}),
            reserveUpload,
            commitStagingUpload,
          });
          const replyId = replyToRef.current?._id;
          await sendVoiceMessage({
            conversationId: conversationId!,
            assetId,
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
    commitStagingUpload,
    ensureMessagesFolder,
    finishRecording,
    recState,
    reserveUpload,
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

  const peerTyping = Boolean(
    activeRow?.peerTypingAt &&
      presenceNow - activeRow.peerTypingAt < 4000,
  );

  useEffect(() => {
    if (!activeRow?.peerTypingAt) return;
    const id = window.setInterval(() => setPresenceNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeRow?.peerTypingAt]);

  const pingTyping = useCallback(
    (active: boolean) => {
      if (!conversationId) return;
      if (active) {
        const now = Date.now();
        if (now - lastTypingPingRef.current < 2000) return;
        lastTypingPingRef.current = now;
        typingActiveRef.current = true;
        void setTyping({ conversationId, typing: true });
        return;
      }
      if (!typingActiveRef.current && lastTypingPingRef.current === 0) return;
      typingActiveRef.current = false;
      lastTypingPingRef.current = 0;
      void setTyping({ conversationId, typing: false });
    },
    [conversationId, setTyping],
  );

  useEffect(() => {
    return () => {
      if (!conversationId || !typingActiveRef.current) return;
      typingActiveRef.current = false;
      lastTypingPingRef.current = 0;
      void setTyping({ conversationId, typing: false });
    };
  }, [conversationId, setTyping]);

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
    clearPendingImages();
    setLightboxUrl(null);
    setReplyTo(null);
    if (conversationId) inputRef.current?.focus();
  }, [clearPendingImages, conversationId]);

  useEffect(() => {
    if (!pendingFeedShare) return;
    clearPendingImages();
    // Strip accidental JSON paste from older drag MIME.
    setDraft((prev) => (looksLikeFeedShareJson(prev) ? "" : prev));
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [clearPendingImages, pendingFeedShare]);

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

  function appendImageFiles(files: File[]) {
    if (files.length === 0) return;
    clearPendingDmFeedShare();
    const accepted: PendingImage[] = [];
    let error = "";
    for (const file of files) {
      const type = (file.type || "").toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(type)) {
        error = "Only JPEG, PNG, WebP, or GIF images are allowed";
        continue;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        error = "Images must be 10 MB or smaller";
        continue;
      }
      accepted.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (accepted.length === 0) {
      if (error) setSendError(error);
      return;
    }
    setSendError(error);
    setPendingImages((prev) => {
      const room = Math.max(0, MAX_PENDING_IMAGES - prev.length);
      if (room <= 0) {
        setSendError(`You can attach up to ${MAX_PENDING_IMAGES} photos`);
        for (const item of accepted) URL.revokeObjectURL(item.previewUrl);
        return prev;
      }
      const next = accepted.slice(0, room);
      for (const item of accepted.slice(room)) {
        URL.revokeObjectURL(item.previewUrl);
      }
      if (accepted.length > room) {
        setSendError(`You can attach up to ${MAX_PENDING_IMAGES} photos`);
      }
      return [...prev, ...next];
    });
  }

  function pickImageFile(file: File | undefined) {
    if (!file) return;
    appendImageFiles([file]);
  }

  async function pickStudioFileAssets(assets: StudioAssetPick[]) {
    if (assets.length === 0 || !conversationId) return;
    setFilesPickBusy(true);
    setSendError("");
    try {
      let sent = 0;
      for (const asset of assets) {
        const mime = (asset.mimeType || "").toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.has(mime)) {
          setSendError("Only JPEG, PNG, WebP, or GIF images are allowed");
          continue;
        }
        await sendImageMessage({
          conversationId,
          assetId: asset._id,
          caption:
            sent === 0 && draft.trim() ? draft.trim() : undefined,
          replyToMessageId: sent === 0 ? replyTo?._id : undefined,
        });
        sent += 1;
      }
      if (sent > 0) {
        setDraft("");
        pingTyping(false);
        setReplyTo(null);
        setFilesPickerOpen(false);
      }
    } catch (error) {
      setSendError(friendlyConvexError(error, "Could not load that file"));
    } finally {
      setFilesPickBusy(false);
    }
  }

  async function handleSend() {
    if (!conversationId || sendBusy || recState !== "idle") return;
    const body = draft.trim();
    if (pendingImages.length === 0 && !pendingFeedShare && !body) return;

    setSendBusy(true);
    setSendError("");
    try {
      if (pendingFeedShare) {
        await sendFeedShare({
          conversationId,
          postId: pendingFeedShare.postId as Id<"profilePosts">,
          commentId: pendingFeedShare.commentId
            ? (pendingFeedShare.commentId as Id<"profileComments">)
            : undefined,
          note: body || undefined,
        });
        clearPendingDmFeedShare();
      } else if (pendingImages.length > 0) {
        for (let i = 0; i < pendingImages.length; i += 1) {
          const pending = pendingImages[i]!;
          const assetId = await uploadDmMediaAsset({
            blob: pending.file,
            name: dmPhotoAssetName({
              peerLabel: peerLabelRef.current,
              fileName: pending.file.name,
              mimeType: pending.file.type || "image/jpeg",
            }),
            kind: "image",
            mimeType: pending.file.type || "image/jpeg",
            ensureMessagesFolder: () => ensureMessagesFolder({}),
            reserveUpload,
            commitStagingUpload,
          });
          await sendImageMessage({
            conversationId,
            assetId,
            caption: i === 0 ? body || undefined : undefined,
            replyToMessageId: i === 0 ? replyTo?._id : undefined,
          });
        }
        clearPendingImages();
      } else {
        await send({
          conversationId,
          body,
          replyToMessageId: replyTo?._id,
        });
      }
      setDraft("");
      pingTyping(false);
      setReplyTo(null);
      inputRef.current?.focus();
    } catch (error) {
      setSendError(friendlyConvexError(error, "Could not send message"));
    } finally {
      setSendBusy(false);
    }
  }

  const canSend = Boolean(
    pendingImages.length > 0 || pendingFeedShare || draft.trim(),
  );

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
            {conversations == null || conversations.length === 0 ? (
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
    activeRow?.peer.username ||
    "Chat";
  peerLabelRef.current = peerLabel;

  let lastDay = "";

  const chatColumn = (
    <div className="studio-dm-chat-column">
      <header className="studio-dm-chat-head">
        {showBack ? (
          <button
            type="button"
            className="studio-composer-circle-btn studio-dm-back"
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
          <span className="studio-dm-chat-peer-avatar-wrap">
            <StudioProfileAvatar
              size="sm"
              src={activeRow?.peer.avatarUrl}
              displayName={activeRow?.peer.displayName}
              name={activeRow?.peer.username}
              alt=""
            />
            {peerTyping ? (
              <span
                className="studio-dm-typing-dot"
                aria-label="Typing"
                title="Typing…"
              >
                <i />
                <i />
                <i />
              </span>
            ) : activeRow?.peerOnline ? (
              <span className="studio-dm-online-dot" aria-label="Online" />
            ) : null}
          </span>
          <span className="studio-dm-chat-peer-copy">
            <strong>
              <span className="studio-dm-name-text">{peerLabel}</span>
              <StudioDmProviderTag tag={activeRow?.peer.sellerTag} />
            </strong>
          </span>
        </button>
        {!embeddedInRail ? (
          <div className="cursor-panel-head-tools studio-dm-chat-head-tools">
            <button
              type="button"
              className={`studio-composer-circle-btn studio-dm-peer-toggle${peerSidebarOpen ? " is-on" : ""}`}
              aria-label={peerSidebarOpen ? "Close Action" : "Action"}
              aria-pressed={peerSidebarOpen}
              title={peerSidebarOpen ? "Close Action" : "Action"}
              onClick={() => setPeerSidebarOpen((open) => !open)}
            >
              <Hammer size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </header>

      <div
        className={`studio-dm-scroll${messagesPending && !messages?.length ? " is-pending" : ""}`}
        ref={scrollRef}
      >
        {messages == null || messages.length === 0 ? (
          messagesPending && messages == null ? (
            <div className="studio-dm-scroll-pending" aria-hidden="true" />
          ) : (
            <div className="studio-dm-empty-state">
              <MessageCircle aria-hidden="true" />
              <strong>Say hi</strong>
              <p>This is the start of your chat with {peerLabel}.</p>
            </div>
          )
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
                    onOpenFeedPost={onOpenFeedPost}
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

      {pendingFeedShare && recState === "idle" ? (
        <div className="studio-dm-attach-preview is-feed-share">
          <DmFeedShareCard
            share={pendingFeedShare}
            compact
            onOpen={onOpenFeedPost}
          />
          <button
            type="button"
            className="studio-dm-attach-clear"
            onClick={() => clearPendingDmFeedShare()}
            aria-label="Remove shared post"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {pendingImages.length > 0 && recState === "idle" ? (
        <div className="studio-dm-attach-preview is-multi">
          <div className="studio-dm-attach-thumbs">
            {pendingImages.map((pending, index) => (
              <div key={`${pending.file.name}-${index}`} className="studio-dm-attach-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pending.previewUrl} alt="" />
                <button
                  type="button"
                  className="studio-dm-attach-clear is-overlay"
                  onClick={() => removePendingImageAt(index)}
                  aria-label={`Remove ${pending.file.name}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <span className="studio-dm-attach-name">
            {pendingImages.length === 1
              ? pendingImages[0]!.file.name
              : `${pendingImages.length} photos`}
          </span>
          <button
            type="button"
            className="studio-dm-attach-clear"
            onClick={clearPendingImages}
            aria-label="Remove all attachments"
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
          multiple
          className="studio-dm-file-input"
          onChange={(event) => {
            appendImageFiles(Array.from(event.target.files ?? []));
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
              placeholder={
                pendingFeedShare
                  ? "Add a note…"
                  : pendingImages.length > 0
                    ? "Add a caption…"
                    : "Message…"
              }
              aria-label={`Message ${peerLabel}`}
              onChange={(event) => {
                const next = looksLikeFeedShareJson(event.target.value)
                  ? ""
                  : event.target.value;
                setDraft(next);
                pingTyping(next.trim().length > 0);
              }}
              onBlur={() => pingTyping(false)}
              onPaste={(event) => {
                const text = event.clipboardData.getData("text/plain");
                if (looksLikeFeedShareJson(text)) {
                  event.preventDefault();
                  const payload = parseFeedSharePayload(text.trim());
                  if (payload && conversationId) {
                    clearPendingImages();
                    setPendingDmFeedShare({ conversationId, payload });
                  }
                  return;
                }
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
              onDrop={(event) => {
                const payload = readFeedShareDataTransfer(event.dataTransfer);
                if (!payload || !conversationId) return;
                event.preventDefault();
                clearPendingImages();
                setPendingDmFeedShare({ conversationId, payload });
              }}
              onDragOver={(event) => {
                if (!feedShareDragTypes(Array.from(event.dataTransfer.types))) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            {canSend ? (
              <button
                type="button"
                className="studio-dm-send"
                onClick={() => void handleSend()}
                disabled={sendBusy}
                aria-label={
                  pendingImages.length > 1
                    ? "Send photos"
                    : pendingImages.length === 1
                      ? "Send photo"
                      : "Send message"
                }
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
                    title: "Pick photos to send",
                    maxSelected: MAX_PENDING_IMAGES,
                    onConfirm: (assets) => {
                      void pickStudioFileAssets(assets);
                    },
                  });
                  return;
                }
                setMobilePickSelected([]);
                setFilesPickerOpen(true);
              },
            },
          ]}
        />
      ) : null}

      {filesPickerOpen ? (
        <StudioAssetPickerSheet
          title="Choose photos to send"
          kinds={["image"]}
          multi
          stayOpen
          maxSelected={MAX_PENDING_IMAGES}
          countLabel={`${mobilePickSelected.length}/${MAX_PENDING_IMAGES}`}
          doneLabel="Confirm"
          expiresUnix={filesPickerExpiresUnix}
          selectedIds={mobilePickSelected.map((item) => item._id)}
          onPick={(asset) => {
            setMobilePickSelected((prev) => {
              const exists = prev.some((item) => item._id === asset._id);
              if (exists) return prev.filter((item) => item._id !== asset._id);
              if (prev.length >= MAX_PENDING_IMAGES) return prev;
              return [...prev, asset];
            });
          }}
          onDone={() => {
            if (filesPickBusy) return;
            const picked = mobilePickSelected;
            setMobilePickSelected([]);
            setFilesPickerOpen(false);
            if (picked.length > 0) void pickStudioFileAssets(picked);
          }}
          onClose={() => {
            if (filesPickBusy) return;
            setMobilePickSelected([]);
            setFilesPickerOpen(false);
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
    !embeddedInRail && activeRow && peerSidebarOpen ? (
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

  if (embeddedInRail || isMobile || !peerSidebarOpen || !activeRow) {
    return (
      <div
        className={`studio-dm-pane${embeddedInRail ? " is-rail-embedded" : ""}`}
      >
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
  onFeedShareDrop,
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
    peerTypingAt?: number;
    unread: boolean;
  };
  active: boolean;
  onSelect: () => void;
  onContextMenu?: (coords: { x: number; y: number }) => void;
  onFeedShareDrop?: (
    conversationId: DmConversationId,
    payload: StudioFeedSharePayload,
  ) => void;
}) {
  const label = row.peer.displayName?.trim() || `@${row.peer.username}`;
  const preview = row.lastMessagePreview || "Tap to start chatting";
  const peerLabels = row.labels ?? [];
  const { longPressHandlers, longPressFired, clearLongPressFired } =
    useLongPress(onContextMenu);
  const [dropActive, setDropActive] = useState(false);
  const selectHandledRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const pointerMovedRef = useRef(false);

  return (
    <button
      type="button"
      className={`studio-dm-row${active ? " is-active" : ""}${row.unread ? " is-unread" : ""}${row.peerOnline ? " is-peer-online" : ""}${dropActive ? " is-feed-drop" : ""}`}
      {...longPressHandlers}
      onPointerDown={(event) => {
        if (event.button != null && event.button !== 0) return;
        selectHandledRef.current = false;
        pointerMovedRef.current = false;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (pointerMovedRef.current) return;
        const dx = Math.abs(event.clientX - pointerStartRef.current.x);
        const dy = Math.abs(event.clientY - pointerStartRef.current.y);
        if (Math.max(dx, dy) > 14) pointerMovedRef.current = true;
      }}
      onPointerUp={(event) => {
        if (event.button != null && event.button !== 0) return;
        if (pointerMovedRef.current || longPressFired()) return;
        selectHandledRef.current = true;
        onSelect();
      }}
      onClick={() => {
        if (longPressFired()) {
          clearLongPressFired();
          selectHandledRef.current = false;
          return;
        }
        if (selectHandledRef.current) {
          selectHandledRef.current = false;
          return;
        }
        onSelect();
      }}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onDragEnter={(event) => {
        if (!onFeedShareDrop) return;
        if (!feedShareDragTypes(Array.from(event.dataTransfer.types))) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!onFeedShareDrop) return;
        if (!feedShareDragTypes(Array.from(event.dataTransfer.types))) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        if (!onFeedShareDrop) return;
        event.preventDefault();
        setDropActive(false);
        const payload = readFeedShareDataTransfer(event.dataTransfer);
        if (!payload) return;
        onFeedShareDrop(row.conversationId, payload);
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
