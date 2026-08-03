"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Clapperboard,
  File as FileIcon,
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Hammer,
  MessageCircle,
  Mic,
  Copy,
  Music,
  Paperclip,
  Pencil,
  Reply,
  SendHorizontal,
  Share2,
  Tags,
  Trash2,
  Upload,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MicrophoneWaveform } from "@/components/ui/waveform";
import { useLongPress } from "@/desk/hooks/use-long-press";
import {
  EXPLORER_DND_TYPE,
  peekActiveExplorerDrag,
  readExplorerDragData,
} from "@/desk/lib/explorer-dnd.js";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { useMobileBackLayer } from "@/studio/components/MobileBackStackHost";
import {
  bindDmCacheOwner,
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
import { ShareConfirmMenu } from "./StudioSharePeoplePanel";
import "./studio-messages.css";
import "./studio-share-people.css";

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
  /** Local upload (device / paste). */
  file?: File;
  /** Already-owned Studio Files asset. */
  assetId?: Id<"assets">;
  name: string;
  previewUrl: string;
};

function revokePendingPreview(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

type StudioShareDelivery = "access" | "file";
type StudioSharePermission = "view" | "edit";

function entryToDmSharePayload(entry: {
  studioId?: string | null;
  studioKind?: string | null;
  type?: string | null;
  systemKind?: string | null;
}) {
  if (!entry?.studioId) return null;
  if (entry.studioKind === "folder" || entry.type === "dir") {
    if (entry.systemKind) return null;
    return {
      itemKind: "folder" as const,
      itemId: String(entry.studioId),
      delivery: "access" as StudioShareDelivery,
    };
  }
  if (entry.studioKind === "asset") {
    return {
      itemKind: "asset" as const,
      itemId: String(entry.studioId),
      delivery: "file" as StudioShareDelivery,
    };
  }
  if (entry.studioKind === "document") {
    return {
      itemKind: "document" as const,
      itemId: String(entry.studioId),
      delivery: "access" as StudioShareDelivery,
    };
  }
  if (entry.studioKind === "element") {
    return {
      itemKind: "element" as const,
      itemId: String(entry.studioId),
      delivery: "access" as StudioShareDelivery,
    };
  }
  if (entry.studioKind === "videoEdit") {
    return {
      itemKind: "videoEdit" as const,
      itemId: String(entry.studioId),
      delivery: "access" as StudioShareDelivery,
    };
  }
  return null;
}

function explorerDragHasStudioEntry(types: ReadonlyArray<string>) {
  return types.includes(EXPLORER_DND_TYPE);
}

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
  edited,
}: {
  createdAt: number;
  fromMe: boolean;
  receipt: DmReceipt;
  edited?: boolean;
}) {
  return (
    <span className="studio-dm-meta">
      {edited ? <span className="studio-dm-edited">edited</span> : null}
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
  kind: "text" | "voice" | "image" | "post" | "comment" | "studio_share";
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

type DmStudioShare = {
  items: Array<{
    itemKind: "asset" | "document" | "element" | "videoEdit" | "folder";
    itemId: string;
    name: string;
    thumbnailUrl?: string;
    unavailable?: boolean;
    assetKind?: "image" | "video" | "audio" | "document";
  }>;
};

type DmMessageRow = {
  _id: Id<"dmMessages">;
  body: string;
  kind: "text" | "voice" | "image" | "post" | "comment" | "studio_share";
  audioUrl?: string;
  imageUrl?: string;
  contentType?: string;
  durationSec?: number;
  fromMe: boolean;
  receipt: DmReceipt;
  replyTo?: DmReplySnippet;
  feedShare?: DmFeedShare;
  studioShare?: DmStudioShare;
  createdAt: number;
  editedAt?: number;
  deleted?: boolean;
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
  if (snippet.kind === "studio_share") {
    return snippet.body.trim() || "Shared files";
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

function copyableDmText(message: DmMessageRow): string | null {
  if (message.deleted) return null;
  if (message.kind === "voice") return null;
  if (message.kind === "post" || message.kind === "comment") {
    return feedShareNote(message);
  }
  const body = message.body.trim();
  return body || null;
}

async function copyDmText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Ignore clipboard failures (permissions / insecure context).
  }
}

function clearNativeTextSelection() {
  const sel = window.getSelection?.();
  if (sel && sel.rangeCount > 0) sel.removeAllRanges();
}


function autosizeDmEditTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  const minPx = 160;
  const maxPx = Math.min(window.innerHeight * 0.6, 448);
  el.style.height = `${Math.min(Math.max(el.scrollHeight, minPx), maxPx)}px`;
}


type DmMessageActionHandlers = {
  onReply: (message: DmMessageRow) => void;
  onStartEdit: (message: DmMessageRow) => void;
  onDeleteForMe: (message: DmMessageRow) => void;
  onDeleteForEveryone: (message: DmMessageRow) => void;
  editingMessageId: Id<"dmMessages"> | null;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  editBusy: boolean;
};

function buildDmBubbleMenuItems(
  message: DmMessageRow,
  handlers: Pick<
    DmMessageActionHandlers,
    "onReply" | "onStartEdit" | "onDeleteForMe" | "onDeleteForEveryone"
  >,
): StudioDmContextMenuItem[] {
  if (message.deleted) {
    return [
      {
        key: "reply",
        label: "Reply",
        icon: <Reply aria-hidden="true" />,
        onSelect: () => handlers.onReply(message),
      },
      {
        key: "delete-me",
        label: "Delete for me",
        icon: <Trash2 aria-hidden="true" />,
        danger: true,
        onSelect: () => handlers.onDeleteForMe(message),
      },
    ];
  }
  const items: StudioDmContextMenuItem[] = [
    {
      key: "reply",
      label: "Reply",
      icon: <Reply aria-hidden="true" />,
      onSelect: () => handlers.onReply(message),
    },
  ];
  const copyText = copyableDmText(message);
  if (copyText) {
    items.push({
      key: "copy",
      label: "Copy",
      icon: <Copy aria-hidden="true" />,
      onSelect: () => {
        void copyDmText(copyText);
      },
    });
  }
  const canEdit =
    message.fromMe &&
    (message.kind === "text" || message.kind === "image");
  if (canEdit) {
    items.push({
      key: "edit",
      label: "Edit",
      icon: <Pencil aria-hidden="true" />,
      onSelect: () => handlers.onStartEdit(message),
    });
  }
  items.push({
    key: "delete-me",
    label: "Delete for me",
    icon: <Trash2 aria-hidden="true" />,
    danger: true,
    onSelect: () => handlers.onDeleteForMe(message),
  });
  if (message.fromMe) {
    items.push({
      key: "delete-everyone",
      label: "Delete for everyone",
      icon: <Trash2 aria-hidden="true" />,
      danger: true,
      onSelect: () => handlers.onDeleteForEveryone(message),
    });
  }
  return items;
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

function DmStudioShareItemIcon({
  item,
}: {
  item: DmStudioShare["items"][number];
}) {
  if (item.itemKind === "folder") {
    return <FolderOpen className="h-4 w-4" aria-hidden="true" />;
  }
  if (item.itemKind === "document") {
    return <FileText className="h-4 w-4" aria-hidden="true" />;
  }
  if (item.itemKind === "element") {
    return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  }
  if (item.itemKind === "videoEdit") {
    return <Clapperboard className="h-4 w-4" aria-hidden="true" />;
  }
  if (item.assetKind === "video") {
    return <Video className="h-4 w-4" aria-hidden="true" />;
  }
  if (item.assetKind === "audio") {
    return <Music className="h-4 w-4" aria-hidden="true" />;
  }
  if (item.assetKind === "image") {
    return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  }
  return <FileIcon className="h-4 w-4" aria-hidden="true" />;
}

function studioShareKindLabel(item: DmStudioShare["items"][number]): string {
  if (item.itemKind === "folder") return "Folder";
  if (item.itemKind === "document") return "Script";
  if (item.itemKind === "element") return "Element";
  if (item.itemKind === "videoEdit") return "Edit";
  if (item.assetKind === "video") return "Video";
  if (item.assetKind === "audio") return "Audio";
  if (item.assetKind === "image") return "Image";
  if (item.assetKind === "document") return "File";
  return "File";
}

function DmStudioShareThumb({
  item,
}: {
  item: DmStudioShare["items"][number];
}) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(item.thumbnailUrl) && !broken && !item.unavailable;
  return (
    <span className="studio-dm-studio-share-thumb">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : (
        <DmStudioShareItemIcon item={item} />
      )}
    </span>
  );
}

function DmStudioShareCard({
  share,
  onOpenItem,
}: {
  share: DmStudioShare;
  onOpenItem?: (item: DmStudioShare["items"][number]) => void;
}) {
  return (
    <div className="studio-dm-studio-share" role="group" aria-label="Shared Studio files">
      {share.items.map((item) => {
        const unavailable = Boolean(item.unavailable);
        return (
          <button
            key={`${item.itemKind}:${item.itemId}`}
            type="button"
            className={`studio-dm-studio-share-item${unavailable ? " is-unavailable" : ""}`}
            disabled={unavailable || !onOpenItem}
            onClick={(event) => {
              event.stopPropagation();
              if (!unavailable) onOpenItem?.(item);
            }}
          >
            <DmStudioShareThumb item={item} />
            <span className="studio-dm-studio-share-copy">
              <strong>{unavailable ? "Unavailable" : item.name}</strong>
              <span>
                {unavailable ? "No longer shared" : studioShareKindLabel(item)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
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
            compact
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


type DmLightboxItem = {
  url: string;
  caption?: string;
  fromMe: boolean;
  createdAt: number;
};

type DmLightboxState = {
  items: DmLightboxItem[];
  index: number;
};

const DM_LB_ZOOM_MIN = 0.25;
const DM_LB_ZOOM_MAX = 5;
const DM_LB_ZOOM_STEP = 0.1;
const DM_LB_ZOOM_FIT = 1;

function clampDmLightboxZoom(value: number): number {
  const stepped = Math.round(value * 100) / 100;
  return Math.min(DM_LB_ZOOM_MAX, Math.max(DM_LB_ZOOM_MIN, stepped));
}

/** WhatsApp-style photo viewer — clipped to the Messages chat pane only. */
function DmPhotoLightbox({
  state,
  peerLabel,
  peerAvatarUrl,
  peerUsername,
  meLabel,
  meAvatarUrl,
  meUsername,
  onClose,
  onIndex,
}: {
  state: DmLightboxState;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  peerUsername?: string;
  meLabel: string;
  meAvatarUrl?: string | null;
  meUsername?: string;
  onClose: () => void;
  onIndex: (index: number) => void;
}) {
  const { items, index } = state;
  const active = items[Math.min(Math.max(index, 0), items.length - 1)];
  const hasMany = items.length > 1;
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const thumbStripRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(DM_LB_ZOOM_FIT);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const applyPan = useCallback((next: { x: number; y: number }) => {
    panRef.current = next;
    setPan(next);
  }, []);

  const bumpZoom = useCallback((delta: number) => {
    setZoom((current) => clampDmLightboxZoom(current + delta));
  }, []);

  useEffect(() => {
    setZoom(DM_LB_ZOOM_FIT);
    panRef.current = { x: 0, y: 0 };
    setPan({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [index, active?.url]);

  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const thumb = strip.querySelector<HTMLElement>(`[data-lb-thumb="${index}"]`);
    thumb?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      bumpZoom(direction * DM_LB_ZOOM_STEP);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [bumpZoom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        bumpZoom(DM_LB_ZOOM_STEP);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        bumpZoom(-DM_LB_ZOOM_STEP);
        return;
      }
      if (event.key === "0") {
        setZoom(DM_LB_ZOOM_FIT);
        panRef.current = { x: 0, y: 0 };
        setPan({ x: 0, y: 0 });
        return;
      }
      if (!hasMany || zoom !== DM_LB_ZOOM_FIT) return;
      if (event.key === "ArrowLeft") {
        onIndex(Math.max(0, index - 1));
      } else if (event.key === "ArrowRight") {
        onIndex(Math.min(items.length - 1, index + 1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bumpZoom, hasMany, index, items.length, onClose, onIndex, zoom]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y,
        moved: false,
      };
      setDragging(true);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && dx * dx + dy * dy < 9) return;
      drag.moved = true;
      applyPan({
        x: drag.originX + dx,
        y: drag.originY + dy,
      });
    },
    [applyPan],
  );

  const endPointerDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    },
    [],
  );

  if (!active?.url) return null;

  const senderLabel = active.fromMe ? meLabel : peerLabel;
  const senderAvatarUrl = active.fromMe ? meAvatarUrl : peerAvatarUrl;
  const senderUsername = active.fromMe ? meUsername : peerUsername;
  const when = new Date(active.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      className="studio-dm-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onTouchStart={(event) => {
        if (zoom !== DM_LB_ZOOM_FIT || dragging) return;
        const t = event.changedTouches[0];
        if (!t) return;
        swipeRef.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(event) => {
        const start = swipeRef.current;
        swipeRef.current = null;
        const t = event.changedTouches[0];
        if (
          !start ||
          !t ||
          !hasMany ||
          zoom !== DM_LB_ZOOM_FIT ||
          dragging
        ) {
          return;
        }
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx > 0) onIndex(Math.max(0, index - 1));
        else onIndex(Math.min(items.length - 1, index + 1));
      }}
    >
      <header className="studio-dm-lightbox-head">
        <div className="studio-dm-lightbox-meta">
          <StudioProfileAvatar
            size="sm"
            src={senderAvatarUrl}
            displayName={senderLabel}
            name={senderUsername}
            alt=""
          />
          <div className="studio-dm-lightbox-meta-copy">
            <strong>
              <span className="studio-dm-lightbox-meta-name">{senderLabel}</span>
              {active.fromMe ? (
                <span className="studio-dm-lightbox-meta-you"> (you)</span>
              ) : null}
            </strong>
            <span>{when}</span>
          </div>
        </div>
        <div className="studio-dm-lightbox-tools">
          <button
            type="button"
            className="studio-dm-lightbox-tool"
            onClick={() => bumpZoom(-DM_LB_ZOOM_STEP)}
            disabled={zoom <= DM_LB_ZOOM_MIN}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut size={13} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <span className="studio-dm-lightbox-zoom-label" aria-live="polite">
            {zoomPct}%
          </span>
          <button
            type="button"
            className="studio-dm-lightbox-tool"
            onClick={() => bumpZoom(DM_LB_ZOOM_STEP)}
            disabled={zoom >= DM_LB_ZOOM_MAX}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn size={13} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="studio-dm-lightbox-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={13} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className={`studio-dm-lightbox-stage${dragging ? " is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
      >
        {hasMany ? (
          <button
            type="button"
            className="studio-dm-lightbox-nav is-prev"
            aria-label="Previous photo"
            disabled={index <= 0 || zoom !== DM_LB_ZOOM_FIT}
            onClick={() => onIndex(Math.max(0, index - 1))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        ) : null}
        <div className="studio-dm-lightbox-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="studio-dm-lightbox-image"
            src={active.url}
            alt={active.caption || "Photo"}
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          />
        </div>
        {hasMany ? (
          <button
            type="button"
            className="studio-dm-lightbox-nav is-next"
            aria-label="Next photo"
            disabled={index >= items.length - 1 || zoom !== DM_LB_ZOOM_FIT}
            onClick={() => onIndex(Math.min(items.length - 1, index + 1))}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <footer className="studio-dm-lightbox-foot">
        {active.caption ? (
          <p className="studio-dm-lightbox-caption">{active.caption}</p>
        ) : null}
        {hasMany ? (
          <div
            ref={thumbStripRef}
            className="studio-dm-lightbox-thumbs"
            role="tablist"
            aria-label="Photos in this album"
          >
            {items.map((item, i) => (
              <button
                key={`${item.url}-${i}`}
                type="button"
                role="tab"
                data-lb-thumb={i}
                aria-selected={i === index}
                aria-label={`Photo ${i + 1}`}
                className={`studio-dm-lightbox-thumb${i === index ? " is-active" : ""}`}
                onClick={() => onIndex(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" draggable={false} />
              </button>
            ))}
          </div>
        ) : null}
      </footer>
    </div>
  );
}

const SWIPE_REPLY_THRESHOLD = 56;
const SWIPE_REPLY_MAX = 72;

type AlbumOrient = "portrait" | "landscape" | "square";

function classifyAlbumOrient(width: number, height: number): AlbumOrient {
  if (!(width > 0 && height > 0)) return "square";
  const ratio = width / height;
  if (ratio < 0.85) return "portrait";
  if (ratio > 1.2) return "landscape";
  return "square";
}

/** Pick grid structure from count + measured orientations. */
function albumLayoutClass(
  count: number,
  orients: Array<AlbumOrient | undefined>,
): string {
  const n = count >= 4 ? 4 : count;
  const known = orients.filter((o): o is AlbumOrient => Boolean(o));
  const ready = known.length >= Math.min(n, orients.length) && known.length > 0;
  const portraits = known.filter((o) => o === "portrait").length;
  const landscapes = known.filter((o) => o === "landscape").length;
  const countClass = n === 2 ? "is-2" : n === 3 ? "is-3" : "is-4";

  if (!ready) return `${countClass} is-orient-pending`;

  if (n === 2) {
    const a = known[0]!;
    const b = known[1] ?? a;
    if (a === "portrait" && b === "portrait") {
      return "is-2 is-orient-tall";
    }
    if (a === "landscape" && b === "landscape") {
      return "is-2 is-orient-wide";
    }
    // One tall + one wide: side-by-side with medium cells
    return "is-2 is-orient-mixed";
  }

  if (n === 3) {
    // Three portraits → equal columns, full height
    if (portraits >= 2 && landscapes === 0) {
      return "is-3 is-orient-tall";
    }
    // Mostly wide → hero + row, landscape cells
    if (landscapes >= 2) {
      return "is-3 is-orient-wide";
    }
    return "is-3 is-orient-mixed";
  }

  // 4+
  if (portraits >= 3 && landscapes === 0) {
    return "is-4 is-orient-tall";
  }
  if (landscapes >= 3) {
    return "is-4 is-orient-wide";
  }
  return "is-4 is-orient-mixed";
}

/** WhatsApp-style multi-image album (consecutive image messages). */
const DmImageAlbum = memo(function DmImageAlbum({
  messages,
  peerLabel,
  onOpenGallery,
  actions,
}: {
  messages: DmMessageRow[];
  peerLabel: string;
  onOpenGallery: (items: DmLightboxItem[], index: number) => void;
  actions: DmMessageActionHandlers;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [orients, setOrients] = useState<
    Record<string, AlbumOrient | undefined>
  >({});
  const head = messages[0]!;
  const tail = messages[messages.length - 1]!;
  const caption =
    messages.map((m) => m.body.trim()).find((body) => body.length > 0) ?? "";
  const visible = messages.slice(0, 4);
  const layoutClass = albumLayoutClass(
    messages.length,
    visible.map((m) => orients[m._id]),
  );

  useEffect(() => {
    let cancelled = false;
    const urls = visible
      .map((m) => ({ id: m._id, url: m.imageUrl }))
      .filter(
        (row): row is { id: Id<"dmMessages">; url: string } =>
          typeof row.url === "string" && row.url.length > 0,
      );

    for (const row of urls) {
      if (orients[row.id]) continue;
      const img = new Image();
      img.decoding = "async";
      const settle = () => {
        if (cancelled) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!(w > 0 && h > 0)) return;
        const orient = classifyAlbumOrient(w, h);
        setOrients((prev) =>
          prev[row.id] === orient ? prev : { ...prev, [row.id]: orient },
        );
      };
      img.addEventListener("load", settle);
      img.src = row.url;
      if (img.complete) settle();
    }

    return () => {
      cancelled = true;
    };
    // Only re-probe when album membership / urls change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((m) => `${m._id}:${m.imageUrl}`).join("|")]);

  const isEditing = actions.editingMessageId === head._id;
  const openMenu = useCallback(
    (coords: { x: number; y: number }) => {
      if (actions.editingMessageId === head._id) return;
      clearNativeTextSelection();
      setMenu(coords);
    },
    [actions.editingMessageId, head._id],
  );
  const { longPressHandlers, longPressFired, clearLongPressFired } =
    useLongPress(isEditing ? undefined : openMenu, {
      onMenuArmed: () => clearNativeTextSelection(),
    });

  const albumEditTarget: DmMessageRow = {
    ...head,
    body: caption || head.body,
  };
  const menuItems = buildDmBubbleMenuItems(albumEditTarget, {
    ...actions,
    onStartEdit: () => actions.onStartEdit(albumEditTarget),
  });

  return (
    <>
      <div
        id={`dm-msg-${head._id}`}
        className={`studio-dm-swipe-shell${head.fromMe ? " is-mine" : ""}`}
      >
        <div
          className={`studio-dm-bubble-row${head.fromMe ? " is-mine" : ""}`}
          onContextMenu={(event) => {
            event.preventDefault();
            if (isEditing) return;
            clearNativeTextSelection();
            openMenu({ x: event.clientX, y: event.clientY });
          }}
          onTouchStart={(event: ReactTouchEvent) => {
            const lp = longPressHandlers as {
              onTouchStart?: (e: ReactTouchEvent) => void;
            };
            lp.onTouchStart?.(event);
          }}
          onTouchMove={(event: ReactTouchEvent) => {
            const lp = longPressHandlers as {
              onTouchMove?: (e: ReactTouchEvent) => void;
            };
            lp.onTouchMove?.(event);
          }}
          onTouchEnd={() => {
            const lp = longPressHandlers as { onTouchEnd?: () => void };
            lp.onTouchEnd?.();
          }}
          onTouchCancel={() => {
            const lp = longPressHandlers as { onTouchCancel?: () => void };
            lp.onTouchCancel?.();
          }}
          onClick={() => {
            if (longPressFired()) clearLongPressFired();
          }}
        >
          <div
            className={`studio-dm-bubble is-image is-album${
              layoutClass.includes("is-orient-tall")
                ? " is-album-tall"
                : layoutClass.includes("is-orient-wide")
                  ? " is-album-wide"
                  : ""
            }`}
          >
            {head.replyTo ? (
              <DmReplyQuote
                snippet={head.replyTo}
                peerLabel={peerLabel}
              />
            ) : null}
            <div
              className={`studio-dm-album ${layoutClass}`}
              role="group"
              aria-label={`${messages.length} photos`}
            >
              {visible.map((message, index) => {
                // For 5+: overlay +N on the 4th tile (N = length - 3)
                const plus =
                  index === 3 && messages.length > 4
                    ? messages.length - 4
                    : 0;
                return (
                  <button
                    key={message._id}
                    type="button"
                    className="studio-dm-album-cell"
                    id={index === 0 ? undefined : `dm-msg-${message._id}`}
                    onClick={() => {
                      const items = messages
                        .filter((row) => Boolean(row.imageUrl))
                        .map((row) => ({
                          url: row.imageUrl!,
                          caption: row.body.trim() || undefined,
                          fromMe: row.fromMe,
                          createdAt: row.createdAt,
                        }));
                      const at = items.findIndex((item) => item.url === message.imageUrl);
                      if (items.length) onOpenGallery(items, Math.max(0, at));
                    }}
                    aria-label={
                      plus > 0
                        ? `View photo, ${plus} more`
                        : "View photo"
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={message.imageUrl} alt="" />
                    {plus > 0 ? (
                      <span className="studio-dm-album-more" aria-hidden="true">
                        +{plus}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {isEditing ? (
              <div
                className="studio-dm-edit"
                onContextMenu={(event) => event.preventDefault()}
                onTouchStart={(event) => event.stopPropagation()}
              >
                <textarea
                  className="studio-dm-edit-input"
                  value={actions.editDraft}
                  ref={(el) => autosizeDmEditTextarea(el)}
                  onChange={(event) => {
                    actions.onEditDraftChange(event.target.value);
                    autosizeDmEditTextarea(event.currentTarget);
                  }}
                  rows={8}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      actions.onCancelEdit();
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      actions.onSaveEdit();
                    }
                  }}
                />
                <div className="studio-dm-edit-actions">
                  <button
                    type="button"
                    className="studio-dm-edit-cancel"
                    onClick={actions.onCancelEdit}
                    disabled={actions.editBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="studio-dm-edit-save"
                    onClick={actions.onSaveEdit}
                    disabled={actions.editBusy}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : caption ? (
              <p>{caption}</p>
            ) : null}
            <DmMessageMeta
              createdAt={tail.createdAt}
              fromMe={tail.fromMe}
              receipt={tail.receipt}
              edited={Boolean(tail.editedAt || head.editedAt)}
            />
          </div>
        </div>
      </div>
      {menu && !isEditing ? (
        <StudioDmContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          title="Message"
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
});

const DmMessageBubble = memo(function DmMessageBubble({
  message,
  peerLabel,
  onOpenGallery,
  onOpenFeedPost,
  onOpenStudioShareItem,
  actions,
}: {
  message: DmMessageRow;
  peerLabel: string;
  onOpenGallery: (items: DmLightboxItem[], index: number) => void;
  onOpenFeedPost?: (postId: Id<"profilePosts">) => void;
  onOpenStudioShareItem?: (item: DmStudioShare["items"][number]) => void;
  actions: DmMessageActionHandlers;
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

  const isEditing = actions.editingMessageId === message._id;
  const openMenu = useCallback(
    (coords: { x: number; y: number }) => {
      if (actions.editingMessageId === message._id) return;
      clearNativeTextSelection();
      setMenu(coords);
    },
    [actions.editingMessageId, message._id],
  );

  const { longPressHandlers, longPressFired, clearLongPressFired } =
    useLongPress(isEditing ? undefined : openMenu, {
      onMenuArmed: () => clearNativeTextSelection(),
    });

  const jumpToReply = useCallback(() => {
    if (!message.replyTo) return;
    const el = document.getElementById(`dm-msg-${message.replyTo._id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [message.replyTo]);

  const menuItems = buildDmBubbleMenuItems(message, actions);
  const onReply = actions.onReply;

  const bubbleClass = [
    "studio-dm-bubble",
    message.deleted ? "is-deleted" : "",
    message.kind === "voice" ? "is-voice" : "",
    message.kind === "image" ? "is-image" : "",
    message.kind === "post" || message.kind === "comment" ? "is-feed-share" : "",
    message.kind === "studio_share" ? "is-studio-share" : "",
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
            if (isEditing) return;
            clearNativeTextSelection();
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
            {message.replyTo && !message.deleted ? (
              <DmReplyQuote
                snippet={message.replyTo}
                peerLabel={peerLabel}
                onJump={jumpToReply}
              />
            ) : null}
            {message.deleted ? (
              <div className="studio-dm-bubble-body">
                <p className="studio-dm-tombstone">This message was deleted</p>
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                />
              </div>
            ) : message.kind === "voice" ? (
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
                  edited={Boolean(message.editedAt)}
                />
              </div>
            ) : message.kind === "image" ? (
              <>
                {message.imageUrl ? (
                  <button
                    type="button"
                    className="studio-dm-image-btn"
                    onClick={() =>
                      onOpenGallery(
                        [
                          {
                            url: message.imageUrl!,
                            caption: message.body.trim() || undefined,
                            fromMe: message.fromMe,
                            createdAt: message.createdAt,
                          },
                        ],
                        0,
                      )
                    }
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
                {isEditing ? (
                  <div
                    className="studio-dm-edit"
                    onContextMenu={(event) => event.preventDefault()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <textarea
                      className="studio-dm-edit-input"
                      value={actions.editDraft}
                      ref={(el) => autosizeDmEditTextarea(el)}
                      onChange={(event) => {
                        actions.onEditDraftChange(event.target.value);
                        autosizeDmEditTextarea(event.currentTarget);
                      }}
                      rows={8}
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          actions.onCancelEdit();
                        }
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          actions.onSaveEdit();
                        }
                      }}
                    />
                    <div className="studio-dm-edit-actions">
                      <button
                        type="button"
                        className="studio-dm-edit-cancel"
                        onClick={actions.onCancelEdit}
                        disabled={actions.editBusy}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="studio-dm-edit-save"
                        onClick={actions.onSaveEdit}
                        disabled={actions.editBusy}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : message.body ? (
                  <p>{message.body}</p>
                ) : null}
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                  edited={Boolean(message.editedAt)}
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
                  edited={Boolean(message.editedAt)}
                />
              </div>
            ) : message.kind === "studio_share" ? (
              <div className="studio-dm-bubble-body">
                {message.studioShare ? (
                  <DmStudioShareCard
                    share={message.studioShare}
                    onOpenItem={onOpenStudioShareItem}
                  />
                ) : (
                  <p className="studio-dm-voice-missing">Shared files unavailable</p>
                )}
                {message.body.trim() ? <p>{message.body.trim()}</p> : null}
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                  edited={Boolean(message.editedAt)}
                />
              </div>
            ) : (
              <div className="studio-dm-bubble-body">
                {isEditing ? (
                  <div
                    className="studio-dm-edit"
                    onContextMenu={(event) => event.preventDefault()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <textarea
                      className="studio-dm-edit-input"
                      value={actions.editDraft}
                      ref={(el) => autosizeDmEditTextarea(el)}
                      onChange={(event) => {
                        actions.onEditDraftChange(event.target.value);
                        autosizeDmEditTextarea(event.currentTarget);
                      }}
                      rows={8}
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          actions.onCancelEdit();
                        }
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          actions.onSaveEdit();
                        }
                      }}
                    />
                    <div className="studio-dm-edit-actions">
                      <button
                        type="button"
                        className="studio-dm-edit-cancel"
                        onClick={actions.onCancelEdit}
                        disabled={actions.editBusy}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="studio-dm-edit-save"
                        onClick={actions.onSaveEdit}
                        disabled={actions.editBusy}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>{message.body}</p>
                )}
                <DmMessageMeta
                  createdAt={message.createdAt}
                  fromMe={message.fromMe}
                  receipt={message.receipt}
                  edited={Boolean(message.editedAt)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {menu && !isEditing ? (
        <StudioDmContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          title="Message"
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
    pickAnyStudio?: boolean;
    pickMode?: "choose" | "share";
    title?: string;
    maxSelected?: number;
    onConfirm?: (
      assets: Array<
        StudioAssetPick & {
          itemKind?: string;
          itemId?: string;
          studioKind?: string;
        }
      >,
      opts?: {
        delivery?: "access" | "file";
        permission?: "view" | "edit";
      },
    ) => void;
    onPick?: (asset: StudioAssetPick) => void;
    onCancel?: () => void;
  }) => void;
  /** Open a shared Studio file from a DM studio_share card. */
  onOpenStudioShareItem?: (item: {
    itemKind: string;
    itemId: string;
    name: string;
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

/** Consecutive same-sender images within this gap may form one WhatsApp-style album. */
const DM_ALBUM_GAP_MS = 120_000;
/** WA-style: 1–2 stay separate media bubbles; collage only at 3+. */
const DM_ALBUM_MIN_COUNT = 3;

type DmTimelineItem =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: DmMessageRow }
  | { type: "album"; key: string; messages: DmMessageRow[] };

function buildDmTimeline(messages: DmMessageRow[]): DmTimelineItem[] {
  const items: DmTimelineItem[] = [];
  let lastDay = "";
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i]!;
    const day = dayLabel(msg.createdAt);
    if (day !== lastDay) {
      items.push({ type: "day", key: `day-${msg._id}`, label: day });
      lastDay = day;
    }
    if (msg.kind === "image" && msg.imageUrl) {
      const album = [msg];
      let j = i + 1;
      while (j < messages.length) {
        const next = messages[j]!;
        if (dayLabel(next.createdAt) !== day) break;
        if (next.kind !== "image" || !next.imageUrl) break;
        if (next.fromMe !== msg.fromMe) break;
        const prevAt = album[album.length - 1]!.createdAt;
        if (next.createdAt - prevAt > DM_ALBUM_GAP_MS) break;
        album.push(next);
        j += 1;
      }
      if (album.length >= DM_ALBUM_MIN_COUNT) {
        items.push({ type: "album", key: `album-${msg._id}`, messages: album });
        i = j;
        continue;
      }
    }
    items.push({ type: "message", key: msg._id, message: msg });
    i += 1;
  }
  return items;
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
  onOpenStudioShareItem,
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
  const me = useQuery(api.users.current, {});
  const cacheReady = Boolean(me?.userId);
  useLayoutEffect(() => {
    bindDmCacheOwner(me?.userId ?? null);
  }, [me?.userId]);
  const myProfile = useQuery(
    api.profiles.getMine,
    cacheReady ? { expiresUnix } : "skip",
  );
  const conversationsLive = useQuery(api.dms.listMyConversations, { expiresUnix });
  const messagesLive = useQuery(
    api.dms.listMessages,
    conversationId ? { conversationId, expiresUnix } : "skip",
  );

  useEffect(() => {
    if (!cacheReady) return;
    rememberDmConversations(conversationsLive);
  }, [cacheReady, conversationsLive]);
  useEffect(() => {
    if (!cacheReady || !conversationId) return;
    rememberDmMessages(conversationId, messagesLive);
  }, [cacheReady, conversationId, messagesLive]);

  const conversationsCached = cacheReady
    ? readDmConversations<typeof conversationsLive>()
    : null;
  const messagesCached =
    cacheReady && conversationId
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
  const shareStudioItems = useMutation(api.studioShares.shareItems);
  const editMessage = useMutation(api.dms.editMessage);
  const deleteMessageForMe = useMutation(api.dms.deleteMessageForMe);
  const deleteMessageForEveryone = useMutation(api.dms.deleteMessageForEveryone);

  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<Id<"dmMessages"> | null>(
    null,
  );
  const [editDraft, setEditDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const lastTypingPingRef = useRef(0);
  const typingActiveRef = useRef(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [lightbox, setLightbox] = useState<DmLightboxState | null>(null);
  const openGallery = useCallback((items: DmLightboxItem[], index: number) => {
    if (!items.length) return;
    setLightbox({
      items,
      index: Math.min(Math.max(index, 0), items.length - 1),
    });
  }, []);
  const [replyTo, setReplyTo] = useState<DmReplySnippet | null>(null);
  const replyToRef = useRef<DmReplySnippet | null>(null);
  replyToRef.current = replyTo;

  useEffect(() => {
    setEditingMessageId(null);
    setEditDraft("");
    setEditBusy(false);
  }, [conversationId]);
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
  const [filesPickMode, setFilesPickMode] = useState<"choose" | "share">("choose");
  const [filesPickBusy, setFilesPickBusy] = useState(false);
  const [mobilePickSelected, setMobilePickSelected] = useState<
    StudioAssetPick[]
  >([]);
  const [shareTypeOpen, setShareTypeOpen] = useState(false);
  const [shareTypeDelivery, setShareTypeDelivery] =
    useState<StudioShareDelivery>("access");
  const [shareTypePermission, setShareTypePermission] =
    useState<StudioSharePermission>("view");
  const [pendingSharePicks, setPendingSharePicks] = useState<
    Array<
      StudioAssetPick & {
        itemKind?: string;
        itemId?: string;
        studioKind?: string;
      }
    >
  >([]);
  const [studioDropActive, setStudioDropActive] = useState(false);
  const [filesPickerExpiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60,
  );

  useMobileBackLayer("dm-lightbox", Boolean(lightbox), () => {
    setLightbox(null);
  });
  useMobileBackLayer("dm-attach-menu", Boolean(attachMenu), () => {
    setAttachMenu(null);
  });
  useMobileBackLayer("dm-share-type", shareTypeOpen, () => {
    if (filesPickBusy) return;
    setShareTypeOpen(false);
    setPendingSharePicks([]);
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
      for (const item of prev) revokePendingPreview(item.previewUrl);
      return [];
    });
  }, []);

  const removePendingImageAt = useCallback((index: number) => {
    setPendingImages((prev) => {
      const target = prev[index];
      if (target) revokePendingPreview(target.previewUrl);
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
    if (messagesPending || !conversationId || !activeRow?.unread) return;
    void markRead({ conversationId });
  }, [activeRow?.unread, conversationId, lastMessageId, markRead, messagesPending]);

  // Device delivery ACK — when inbound messages arrive over the Convex WS.
  // Skip while painting from session cache (wrong-account leftovers).
  useEffect(() => {
    if (messagesPending || !conversationId || !messages?.length) return;
    let maxInbound = 0;
    for (const message of messages) {
      if (!message.fromMe && message.createdAt > maxInbound) {
        maxInbound = message.createdAt;
      }
    }
    if (maxInbound <= 0) return;
    void ackDelivered({ conversationId, upToCreatedAt: maxInbound });
  }, [ackDelivered, conversationId, lastMessageId, messages, messagesPending]);

  useEffect(() => {
    setDraft("");
    setSendError("");
    clearPendingImages();
    setLightbox(null);
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
  const onStartEdit = useCallback((message: DmMessageRow) => {
    setEditingMessageId(message._id);
    setEditDraft(message.body);
  }, []);

  const onCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditDraft("");
    setEditBusy(false);
  }, []);

  const onSaveEdit = useCallback(async () => {
    if (!editingMessageId) return;
    setEditBusy(true);
    setSendError("");
    try {
      await editMessage({ messageId: editingMessageId, body: editDraft });
      setEditingMessageId(null);
      setEditDraft("");
    } catch (error) {
      setSendError(friendlyConvexError(error, "Could not edit message"));
    } finally {
      setEditBusy(false);
    }
  }, [editDraft, editMessage, editingMessageId]);

  const onDeleteForMe = useCallback(
    async (message: DmMessageRow) => {
      setSendError("");
      try {
        await deleteMessageForMe({ messageId: message._id });
        if (editingMessageId === message._id) onCancelEdit();
      } catch (error) {
        setSendError(friendlyConvexError(error, "Could not delete message"));
      }
    },
    [deleteMessageForMe, editingMessageId, onCancelEdit],
  );

  const onDeleteForEveryone = useCallback(
    async (message: DmMessageRow) => {
      setSendError("");
      try {
        await deleteMessageForEveryone({ messageId: message._id });
        if (editingMessageId === message._id) onCancelEdit();
      } catch (error) {
        setSendError(
          friendlyConvexError(error, "Could not delete message for everyone"),
        );
      }
    },
    [deleteMessageForEveryone, editingMessageId, onCancelEdit],
  );

  const messageActions: DmMessageActionHandlers = useMemo(
    () => ({
      onReply: armReply,
      onStartEdit,
      onDeleteForMe: (message) => {
        void onDeleteForMe(message);
      },
      onDeleteForEveryone: (message) => {
        void onDeleteForEveryone(message);
      },
      editingMessageId,
      editDraft,
      onEditDraftChange: setEditDraft,
      onSaveEdit: () => {
        void onSaveEdit();
      },
      onCancelEdit,
      editBusy,
    }),
    [
      armReply,
      editBusy,
      editDraft,
      editingMessageId,
      onCancelEdit,
      onDeleteForEveryone,
      onDeleteForMe,
      onSaveEdit,
      onStartEdit,
    ],
  );


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
        name: file.name,
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
        for (const item of accepted) revokePendingPreview(item.previewUrl);
        return prev;
      }
      const next = accepted.slice(0, room);
      for (const item of accepted.slice(room)) {
        revokePendingPreview(item.previewUrl);
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

  function stageStudioFileAssets(assets: StudioAssetPick[]) {
    if (assets.length === 0) return;
    clearPendingDmFeedShare();
    const accepted: PendingImage[] = [];
    let error = "";
    for (const asset of assets) {
      const mime = (asset.mimeType || "").toLowerCase();
      if (mime && !ALLOWED_IMAGE_TYPES.has(mime)) {
        error = "Only JPEG, PNG, WebP, or GIF images are allowed";
        continue;
      }
      accepted.push({
        assetId: asset._id as Id<"assets">,
        name: asset.name,
        previewUrl: (asset.signedThumbnailUrl || "").trim(),
      });
    }
    if (accepted.length === 0) {
      if (error) setSendError(error);
      return;
    }
    setSendError(error);
    setPendingImages((prev) => {
      const seen = new Set(
        prev.map((item) => item.assetId).filter((id): id is Id<"assets"> => Boolean(id)),
      );
      const room = Math.max(0, MAX_PENDING_IMAGES - prev.length);
      if (room <= 0) {
        setSendError(`You can attach up to ${MAX_PENDING_IMAGES} photos`);
        return prev;
      }
      const staged: PendingImage[] = [];
      for (const item of accepted) {
        if (staged.length >= room) break;
        if (item.assetId && seen.has(item.assetId)) continue;
        staged.push(item);
        if (item.assetId) seen.add(item.assetId);
      }
      if (accepted.length > staged.length) {
        setSendError(`You can attach up to ${MAX_PENDING_IMAGES} photos`);
      }
      return staged.length ? [...prev, ...staged] : prev;
    });
    setFilesPickerOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function sendStudioPicks(
    picked: Array<
      StudioAssetPick & {
        itemKind?: string;
        itemId?: string;
        studioKind?: string;
      }
    >,
    opts?: {
      delivery?: StudioShareDelivery;
      permission?: StudioSharePermission;
    },
  ) {
    if (!conversationId || !activeRow?.peer.userId || picked.length === 0) return;
    const items = picked
      .map((item) => {
        if (item.itemKind && item.itemId) {
          return {
            itemKind: item.itemKind as
              | "asset"
              | "document"
              | "element"
              | "videoEdit"
              | "folder",
            itemId: item.itemId,
          };
        }
        return {
          itemKind: "asset" as const,
          itemId: String(item._id),
        };
      })
      .filter((item) => item.itemId);
    if (!items.length) return;
    const fileOnly = items.every((item) => item.itemKind === "asset");
    const delivery =
      opts?.delivery === "file" && fileOnly
        ? "file"
        : opts?.delivery === "file"
          ? "access"
          : (opts?.delivery ?? "access");
    const permission =
      delivery === "file" ? "view" : (opts?.permission ?? "view");
    setFilesPickBusy(true);
    setSendError("");
    try {
      await shareStudioItems({
        peerUserIds: [activeRow.peer.userId],
        items,
        conversationId,
        delivery,
        permission,
      });
      setFilesPickerOpen(false);
      setMobilePickSelected([]);
      setShareTypeOpen(false);
      setPendingSharePicks([]);
      const n = items.length;
      toast.success(
        delivery === "file"
          ? n === 1
            ? "Sent as file to Messages"
            : `Sent ${n} files`
          : n === 1
            ? "Shared — they’ll see it in Shared with me"
            : `Shared ${n} items`,
      );
    } catch (error) {
      setSendError(friendlyConvexError(error, "Could not share files"));
    } finally {
      setFilesPickBusy(false);
    }
  }

  function openMobileStudioPick(mode: "choose" | "share") {
    setFilesPickMode(mode);
    setMobilePickSelected([]);
    setFilesPickerOpen(true);
  }

  function beginShareTypeForPicks(
    picked: Array<
      StudioAssetPick & {
        itemKind?: string;
        itemId?: string;
        studioKind?: string;
      }
    >,
  ) {
    if (!picked.length) return;
    const fileOnly = picked.every(
      (item) => (item.itemKind ?? "asset") === "asset",
    );
    setPendingSharePicks(picked);
    setShareTypeDelivery(fileOnly ? "access" : "access");
    setShareTypePermission("view");
    setShareTypeOpen(true);
  }

  async function shareDroppedStudioEntry(entry: Record<string, unknown>) {
    if (!conversationId || !activeRow?.peer.userId || filesPickBusy) return;
    const mapped = entryToDmSharePayload(entry as {
      studioId?: string | null;
      studioKind?: string | null;
      type?: string | null;
      systemKind?: string | null;
    });
    if (!mapped) {
      setSendError("That item can’t be shared here");
      return;
    }
    await sendStudioPicks(
      [
        {
          _id: mapped.itemId,
          name: String(entry.name ?? "item"),
          kind: String(entry.kind ?? entry.studioKind ?? "file"),
          mimeType: String(entry.mimeType ?? ""),
          itemKind: mapped.itemKind,
          itemId: mapped.itemId,
          studioKind: mapped.itemKind,
        },
      ],
      { delivery: mapped.delivery, permission: "view" },
    );
  }

  function onStudioChatDragOver(event: ReactDragEvent) {
    const types = Array.from(event.dataTransfer.types);
    const feed = feedShareDragTypes(types);
    const studio = explorerDragHasStudioEntry(types) || Boolean(peekActiveExplorerDrag());
    if (!feed && !studio) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (studio) setStudioDropActive(true);
  }

  function onStudioChatDragLeave(event: ReactDragEvent) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setStudioDropActive(false);
  }

  async function onStudioChatDrop(event: ReactDragEvent) {
    setStudioDropActive(false);
    const feedPayload = readFeedShareDataTransfer(event.dataTransfer);
    if (feedPayload && conversationId) {
      event.preventDefault();
      clearPendingImages();
      setPendingDmFeedShare({ conversationId, payload: feedPayload });
      return;
    }
    const entry =
      readExplorerDragData(event.dataTransfer) ?? peekActiveExplorerDrag();
    if (!entry) return;
    event.preventDefault();
    await shareDroppedStudioEntry(entry as Record<string, unknown>);
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
          let assetId = pending.assetId;
          if (!assetId) {
            if (!pending.file) {
              throw new Error("Attachment is missing");
            }
            assetId = await uploadDmMediaAsset({
              blob: pending.file,
              name: dmPhotoAssetName({
                peerLabel: peerLabelRef.current,
                fileName: pending.name || pending.file.name,
                mimeType: pending.file.type || "image/jpeg",
              }),
              kind: "image",
              mimeType: pending.file.type || "image/jpeg",
              ensureMessagesFolder: () => ensureMessagesFolder({}),
              reserveUpload,
              commitStagingUpload,
            });
          }
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
              title="Chat"
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
  const meLabel =
    myProfile?.displayName?.trim() ||
    myProfile?.username ||
    "You";

  const chatColumn = (
    <div
      className={`studio-dm-chat-column${studioDropActive ? " is-studio-drop" : ""}`}
      onDragEnter={onStudioChatDragOver}
      onDragOver={onStudioChatDragOver}
      onDragLeave={onStudioChatDragLeave}
      onDrop={(event) => {
        void onStudioChatDrop(event);
      }}
    >
      <header className="studio-dm-chat-head">
        {showBack ? (
          <button
            type="button"
            className="studio-composer-circle-btn studio-dm-back"
            onClick={() => onSelectConversation(null)}
            aria-label="Back to chats"
          >
            <ArrowLeft size={13} strokeWidth={2.25} aria-hidden="true" />
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
              <Hammer size={13} strokeWidth={2.25} aria-hidden="true" />
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
            {buildDmTimeline(messages).map((item) => {
              if (item.type === "day") {
                return (
                  <div key={item.key} className="studio-dm-message-block">
                    <div className="studio-dm-day" role="separator">
                      <span>{item.label}</span>
                    </div>
                  </div>
                );
              }
              if (item.type === "album") {
                return (
                  <div key={item.key} className="studio-dm-message-block">
                    <DmImageAlbum
                      messages={item.messages}
                      peerLabel={peerLabel}
                      onOpenGallery={openGallery}
                      actions={messageActions}
                    />
                  </div>
                );
              }
              return (
                <div key={item.key} className="studio-dm-message-block">
                  <DmMessageBubble
                    message={item.message}
                    peerLabel={peerLabel}
                    onOpenGallery={openGallery}
                    onOpenFeedPost={onOpenFeedPost}
                    onOpenStudioShareItem={onOpenStudioShareItem}
                    actions={messageActions}
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
              <div
                key={`${pending.assetId ?? pending.name}-${index}`}
                className="studio-dm-attach-thumb"
              >
                {pending.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pending.previewUrl} alt="" />
                ) : (
                  <span className="studio-dm-attach-thumb-fallback" aria-hidden="true">
                    <ImageIcon />
                  </span>
                )}
                <button
                  type="button"
                  className="studio-dm-attach-clear is-overlay"
                  onClick={() => removePendingImageAt(index)}
                  aria-label={`Remove ${pending.name}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <span className="studio-dm-attach-name">
            {pendingImages.length === 1
              ? pendingImages[0]!.name
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
                void onStudioChatDrop(event);
              }}
              onDragOver={onStudioChatDragOver}
              onDragLeave={onStudioChatDragLeave}
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
              label: "Upload photos",
              icon: <Upload className="h-3.5 w-3.5" aria-hidden="true" />,
              onSelect: () => fileInputRef.current?.click(),
            },
            {
              key: "choose-studio-files",
              label: "Choose from Studio Files",
              icon: <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />,
              onSelect: () => {
                if (onRequestPickAsset && !isMobile) {
                  onRequestPickAsset({
                    pickMode: "choose",
                    kinds: ["image", "video", "audio", "document"],
                    pickAnyStudio: false,
                    title: "Choose Studio files",
                    maxSelected: MAX_PENDING_IMAGES,
                    onConfirm: (picked) => {
                      void sendStudioPicks(picked, { delivery: "file" });
                    },
                  });
                  return;
                }
                openMobileStudioPick("choose");
              },
            },
            {
              key: "share-studio-files",
              label: "Share from Studio Files",
              icon: <Share2 className="h-3.5 w-3.5" aria-hidden="true" />,
              onSelect: () => {
                if (onRequestPickAsset && !isMobile) {
                  onRequestPickAsset({
                    pickMode: "share",
                    pickAnyStudio: true,
                    title: "Share Studio files",
                    maxSelected: MAX_PENDING_IMAGES,
                    onConfirm: (picked, opts) => {
                      void sendStudioPicks(picked, opts);
                    },
                  });
                  return;
                }
                openMobileStudioPick("share");
              },
            },
          ]}
        />
      ) : null}

      {filesPickerOpen ? (
        <StudioAssetPickerSheet
          title={
            filesPickMode === "share"
              ? "Share Studio files"
              : "Choose Studio files"
          }
          pickAnyStudio={filesPickMode === "share"}
          allowFolderPick={filesPickMode === "share"}
          kinds={
            filesPickMode === "choose"
              ? ["image", "video", "audio", "document"]
              : ["image"]
          }
          multi
          stayOpen
          maxSelected={MAX_PENDING_IMAGES}
          countLabel={`${mobilePickSelected.length}/${MAX_PENDING_IMAGES}`}
          doneLabel={filesPickMode === "share" ? "Share" : "Send"}
          expiresUnix={filesPickerExpiresUnix}
          selectedIds={mobilePickSelected.map((item) => String(item._id))}
          onPick={(asset) => {
            setMobilePickSelected((prev) => {
              const exists = prev.some((item) => String(item._id) === String(asset._id));
              if (exists) return prev.filter((item) => String(item._id) !== String(asset._id));
              if (prev.length >= MAX_PENDING_IMAGES) return prev;
              return [...prev, asset];
            });
          }}
          onDone={() => {
            if (filesPickBusy) return;
            const picked = mobilePickSelected.map((asset) => ({
              ...asset,
              itemKind: asset.itemKind ?? ("asset" as const),
              itemId: String(asset.itemId ?? asset._id),
              studioKind: asset.studioKind ?? asset.itemKind ?? "asset",
            }));
            setMobilePickSelected([]);
            setFilesPickerOpen(false);
            if (!picked.length) return;
            if (filesPickMode === "share") {
              beginShareTypeForPicks(picked);
              return;
            }
            void sendStudioPicks(picked, { delivery: "file" });
          }}
          onClose={() => {
            if (filesPickBusy) return;
            setMobilePickSelected([]);
            setFilesPickerOpen(false);
          }}
        />
      ) : null}

      {shareTypeOpen
        ? createPortal(
            <>
              <button
                type="button"
                className="studio-share-confirm-backdrop"
                aria-label="Dismiss"
                onClick={() => {
                  if (filesPickBusy) return;
                  setShareTypeOpen(false);
                  setPendingSharePicks([]);
                }}
              />
              <ShareConfirmMenu
                delivery={shareTypeDelivery}
                setDelivery={setShareTypeDelivery}
                permission={shareTypePermission}
                setPermission={setShareTypePermission}
                allowFileDelivery={pendingSharePicks.every(
                  (item) => (item.itemKind ?? "asset") === "asset",
                )}
                busy={filesPickBusy}
                onConfirm={() => {
                  const picked = pendingSharePicks;
                  void sendStudioPicks(picked, {
                    delivery: shareTypeDelivery,
                    permission: shareTypePermission,
                  });
                }}
                onDismiss={() => {
                  if (filesPickBusy) return;
                  setShareTypeOpen(false);
                  setPendingSharePicks([]);
                }}
                asSheet
              />
            </>,
            document.querySelector(".studio-polish") ?? document.body,
          )
        : null}

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
        className={`studio-dm-pane${embeddedInRail ? " is-rail-embedded" : ""}${lightbox ? " is-lightbox-open" : ""}`}
      >
        {chatColumn}
        {peerSidebar}
        {lightbox ? (
          <DmPhotoLightbox
            state={lightbox}
            peerLabel={peerLabel}
            peerAvatarUrl={activeRow?.peer.avatarUrl}
            peerUsername={activeRow?.peer.username}
            meLabel={meLabel}
            meAvatarUrl={myProfile?.avatarUrl}
            meUsername={myProfile?.username}
            onClose={() => setLightbox(null)}
            onIndex={(index) =>
              setLightbox((prev) => (prev ? { ...prev, index } : prev))
            }
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={`studio-dm-pane is-split${lightbox ? " is-lightbox-open" : ""}`}>
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
        {lightbox ? (
          <DmPhotoLightbox
            state={lightbox}
            peerLabel={peerLabel}
            peerAvatarUrl={activeRow?.peer.avatarUrl}
            peerUsername={activeRow?.peer.username}
            meLabel={meLabel}
            meAvatarUrl={myProfile?.avatarUrl}
            meUsername={myProfile?.username}
            onClose={() => setLightbox(null)}
            onIndex={(index) =>
              setLightbox((prev) => (prev ? { ...prev, index } : prev))
            }
          />
        ) : null}
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
