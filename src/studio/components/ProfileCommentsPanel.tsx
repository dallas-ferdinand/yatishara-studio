"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUp,
  Bookmark,
  Check,
  ChevronLeft,
  Copy,
  Heart,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageCircle,
  Pencil,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ExplorerTypeFilter } from "@/desk/components/ExplorerTypeFilter";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatVideoTimecode } from "@/studio/lib/bunnyPlayerJs";
import { playUiSound } from "@/mos-app/sounds.js";
import { formatPostWhen } from "@/studio/lib/formatPostWhen";
import { setFeedShareDataTransfer } from "@/studio/lib/studioFeedShare";
import { profileNameInitials } from "@/studio/lib/profileAvatar";
import { StudioCnBookSheet } from "@/studio/components/StudioCnBookSheet";
import {
  StudioDmContextMenu,
  type StudioDmContextMenuItem,
} from "@/studio/components/StudioDmContextMenu";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
import { useStudioComposerResize } from "@/studio/lib/composerHeight";
import { useLongPress } from "@/desk/hooks/use-long-press";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import { MediaLoadFrame } from "./media-load-frame";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import "./media-load-frame.css";

const MAX_POST_CAPTION = 2200;

type CommentSort = "newest" | "oldest" | "liked" | "replies";

const COMMENT_SORT_FILTERS = [
  { id: "newest", label: "Newest", icon: "arrowUp" },
  { id: "oldest", label: "Oldest", icon: "clock" },
  { id: "liked", label: "Most liked", icon: "pin" },
  { id: "replies", label: "Most replies", icon: "chats" },
] as const;

type CommentRow = {
  _id: Id<"profileComments"> | Id<"academyComments">;
  body: string;
  createdAt: number;
  userId: Id<"users">;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  isOwner: boolean;
  isMine: boolean;
  parentId?: Id<"profileComments"> | Id<"academyComments">;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  imageUrl?: string;
  videoTimeSec?: number;
};

type ThreadFrame = {
  parentId: Id<"profileComments"> | Id<"academyComments"> | null;
  parentPreview: CommentRow | null;
  scrollTop: number;
};

type PendingImage = {
  file: File;
  previewUrl: string;
};

type PostAuthorInfo = {
  displayName?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  thumbnailUrl?: string;
  publishedAt: number;
  editedAt?: number;
  isOwner?: boolean;
};

type PostActionsInfo = {
  liked: boolean;
  saved: boolean;
  likeCount: number;
  saveCount: number;
  shareCount: number;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
};

export type CommentsPanelMode = "comments" | "description";

type DescriptionInfo = {
  caption?: string;
  username?: string;
  hashtags?: Array<{ tag: string; displayTag: string }>;
  mentions?: Array<{
    username: string;
    profileId: string;
    displayName?: string;
    avatarUrl?: string;
  }>;
  onOpenProfile?: (username: string) => void;
  /** Optimistic local caption after owner saves an edit. */
  onCaptionSaved?: (caption: string | undefined, editedAt: number) => void;
};

const MAX_COMMENT_IMAGE_BYTES = 12 * 1024 * 1024;

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function formatWhen(ts: number): string {
  return formatPostWhen(ts);
}

function formatPostStamp(publishedAt: number, editedAt?: number): string {
  const when = formatPostWhen(publishedAt);
  return editedAt ? `${when} · edited` : when;
}

function commentLabel(comment: Pick<CommentRow, "displayName" | "username">): string {
  return comment.displayName || (comment.username ? `@${comment.username}` : "User");
}

function postAuthorLabel(author: PostAuthorInfo): string {
  const display = author.displayName?.trim();
  if (display) return display;
  if (author.username?.trim()) return author.username.trim();
  const fromParts = [author.firstName, author.lastName].filter(Boolean).join(" ").trim();
  return fromParts || "User";
}

function clearNativeTextSelection() {
  const sel = window.getSelection?.();
  if (sel && sel.rangeCount > 0) sel.removeAllRanges();
}

const COMMENT_SWIPE_REPLY_THRESHOLD = 56;
const COMMENT_SWIPE_REPLY_MAX = 72;

function ProfileCommentBubble({
  comment,
  searching,
  locked,
  canDrag,
  postId,
  postThumbnailUrl,
  likeState,
  onToggleLike,
  onReply,
  onOpenSearchHit,
  onDelete,
  onSeekVideo,
  onOpenImage,
}: {
  comment: CommentRow;
  searching: boolean;
  locked: boolean;
  canDrag: boolean;
  postId?: Id<"profilePosts">;
  postThumbnailUrl?: string;
  likeState: { liked: boolean; likeCount: number };
  onToggleLike: (comment: CommentRow) => void;
  onReply: (comment: CommentRow) => void;
  onOpenSearchHit: (comment: CommentRow) => void;
  onDelete: (id: CommentRow["_id"]) => void;
  onSeekVideo?: (seconds: number) => void;
  onOpenImage: (url: string) => void;
}) {
  const { isMobile } = useMobileLayout();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    tracking: boolean;
    horizontal: boolean;
    dx: number;
  } | null>(null);
  const swipeEnabled = isMobile && !locked;
  const replyCount = comment.replyCount ?? 0;
  const label = commentLabel(comment);
  const initials = profileNameInitials({
    displayName: comment.displayName,
    name: comment.username,
  });

  const openMenu = useCallback((coords: { x: number; y: number }) => {
    clearNativeTextSelection();
    setMenu(coords);
  }, []);

  const { longPressHandlers, longPressFired, clearLongPressFired } = useLongPress(
    locked ? undefined : openMenu,
    { onMenuArmed: () => clearNativeTextSelection() },
  );

  const goReply = useCallback(() => {
    if (searching && comment.parentId) {
      onOpenSearchHit(comment);
      return;
    }
    onReply(comment);
  }, [comment, onOpenSearchHit, onReply, searching]);

  const menuItems: StudioDmContextMenuItem[] = [];
  if (!locked) {
    menuItems.push({
      key: "reply",
      label: searching && comment.parentId ? "Open thread" : "Reply",
      icon: <Reply aria-hidden="true" />,
      onSelect: goReply,
    });
  }
  if (comment.body) {
    menuItems.push({
      key: "copy",
      label: "Copy",
      icon: <Copy aria-hidden="true" />,
      onSelect: () => {
        void navigator.clipboard.writeText(comment.body).catch(() => {});
      },
    });
  }
  if (!locked) {
    menuItems.push({
      key: "like",
      label: likeState.liked ? "Unlike" : "Like",
      icon: (
        <Heart
          aria-hidden="true"
          fill={likeState.liked ? "currentColor" : "none"}
        />
      ),
      onSelect: () => onToggleLike(comment),
    });
  }
  if (replyCount > 0 && !locked) {
    menuItems.push({
      key: "replies",
      label: `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`,
      icon: <MessageCircle aria-hidden="true" />,
      onSelect: () => onReply(comment),
    });
  }
  if (comment.isMine && !locked) {
    menuItems.push({
      key: "delete",
      label: "Delete",
      icon: <Trash2 aria-hidden="true" />,
      danger: true,
      onSelect: () => onDelete(comment._id),
    });
  }

  const rowStyle: CSSProperties | undefined = swipeX
    ? {
        transform: `translateX(${swipeX}px)`,
        transition: swipeRef.current?.tracking ? "none" : "transform 160ms ease",
      }
    : undefined;

  return (
    <>
      <div
        className={`profile-comment-swipe-shell${comment.isMine ? " is-mine" : ""}`}
      >
        {swipeEnabled ? (
          <span
            className="profile-comment-swipe-reply"
            style={{
              opacity: Math.min(1, swipeX / COMMENT_SWIPE_REPLY_THRESHOLD),
            }}
            aria-hidden="true"
          >
            <Reply />
          </span>
        ) : null}
        <article
          className={`profile-comment-row${comment.isMine ? " is-mine" : ""}${comment.parentId ? " is-reply" : ""}`}
          style={rowStyle}
          draggable={canDrag}
          title={canDrag ? "Drag into a chat to share this comment" : undefined}
          onDragStart={
            canDrag && postId
              ? (event) => {
                  const target = event.target as HTMLElement | null;
                  if (
                    target?.closest(
                      "button, a, input, textarea, [contenteditable='true']",
                    )
                  ) {
                    event.preventDefault();
                    return;
                  }
                  setFeedShareDataTransfer(event.dataTransfer, {
                    type: "comment",
                    postId,
                    commentId: comment._id as Id<"profileComments">,
                    username: comment.username,
                    displayName: comment.displayName,
                    body: comment.body,
                    thumbnailUrl: postThumbnailUrl,
                  });
                }
              : undefined
          }
          onContextMenu={(event) => {
            event.preventDefault();
            if (locked || menuItems.length === 0) return;
            clearNativeTextSelection();
            openMenu({ x: event.clientX, y: event.clientY });
          }}
          onTouchStart={(event: ReactTouchEvent) => {
            const lp = longPressHandlers as {
              onTouchStart?: (e: ReactTouchEvent) => void;
            };
            lp.onTouchStart?.(event);
            if (!swipeEnabled) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("button, a, input, textarea")) return;
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
            const next = Math.max(0, Math.min(COMMENT_SWIPE_REPLY_MAX, dx));
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
            if (state?.horizontal && state.dx >= COMMENT_SWIPE_REPLY_THRESHOLD) {
              goReply();
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
            if (longPressFired()) clearLongPressFired();
          }}
        >
          <StudioProfileAvatar
            className="profile-comment-avatar"
            size="sm"
            src={comment.avatarUrl}
            initials={initials}
            displayName={comment.displayName}
            name={comment.username}
          />
          <div className="profile-comment-body">
            <div className="profile-comment-bubble">
              <div className="profile-comment-meta">
                <div className="profile-comment-meta-text">
                  <strong>{label}</strong>
                  <time dateTime={new Date(comment.createdAt).toISOString()}>
                    {formatWhen(comment.createdAt)}
                  </time>
                </div>
              </div>
              <div className="profile-comment-bubble-copy">
              {typeof comment.videoTimeSec === "number" &&
              Number.isFinite(comment.videoTimeSec) ? (
                <button
                  type="button"
                  className="profile-comment-video-time"
                  aria-label={`Jump to ${formatVideoTimecode(comment.videoTimeSec)} in video`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeekVideo?.(comment.videoTimeSec!);
                  }}
                  disabled={!onSeekVideo}
                >
                  {formatVideoTimecode(comment.videoTimeSec)}
                </button>
              ) : null}
              {comment.body ? <p>{comment.body}</p> : null}
              {comment.imageUrl ? (
                <button
                  type="button"
                  className="profile-comment-image-btn"
                  aria-label="View image"
                  onClick={() => onOpenImage(comment.imageUrl!)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="profile-comment-image" src={comment.imageUrl} alt="" />
                </button>
              ) : null}
              </div>
            <div className="profile-comment-bubble-actions">
                {locked ? (
                  <span
                    className={`profile-comment-like is-static${likeState.likeCount > 0 ? "" : " is-empty"}`}
                    aria-label={`${likeState.likeCount} likes`}
                  >
                    <Heart
                      aria-hidden="true"
                      fill={likeState.likeCount > 0 ? "currentColor" : "none"}
                      strokeWidth={likeState.likeCount > 0 ? 0 : 2}
                    />
                    {likeState.likeCount > 0 ? (
                      <span>{likeState.likeCount}</span>
                    ) : null}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`profile-comment-like${likeState.liked ? " is-liked" : ""}`}
                    aria-pressed={likeState.liked}
                    aria-label={likeState.liked ? "Unlike comment" : "Like comment"}
                    onClick={() => onToggleLike(comment)}
                  >
                    <Heart
                      aria-hidden="true"
                      fill={likeState.liked ? "currentColor" : "none"}
                      strokeWidth={likeState.liked ? 0 : 2}
                    />
                    {likeState.likeCount > 0 ? (
                      <span>{likeState.likeCount}</span>
                    ) : null}
                  </button>
                )}
                {!locked ? (
                  <button
                    type="button"
                    className="profile-comment-reply"
                    aria-label={
                      replyCount
                        ? `Reply, ${replyCount}`
                        : searching && comment.parentId
                          ? "Open thread"
                          : "Reply"
                    }
                    onClick={goReply}
                  >
                    <MessageCircle aria-hidden="true" strokeWidth={2} />
                    {replyCount > 0 ? <span>{replyCount}</span> : null}
                  </button>
                ) : replyCount > 0 ? (
                  <span
                    className="profile-comment-reply is-static"
                    aria-label={`${replyCount} replies`}
                  >
                    <MessageCircle aria-hidden="true" strokeWidth={2} />
                    <span>{replyCount}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </div>
      {menu && menuItems.length > 0 ? (
        <StudioDmContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          title="Comment"
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

function CommentsBody({
  postId,
  courseId,
  lessonId,
  commentCount,
  onCommentCountChange,
  showRootHeader,
  showClose,
  onClose,
  variant,
  postAuthor,
  postActions,
  onEditDescription,
  locked = false,
  getVideoTimeSec,
  onSeekVideo,
}: {
  postId?: Id<"profilePosts">;
  courseId?: Id<"academyCourses">;
  lessonId?: Id<"academyLessons">;
  commentCount: number;
  onCommentCountChange?: (count: number) => void;
  showRootHeader: boolean;
  showClose: boolean;
  onClose?: () => void;
  variant: "sheet" | "dock";
  postAuthor?: PostAuthorInfo;
  postActions?: PostActionsInfo;
  onEditDescription?: () => void;
  /** Unpaid Academy: top engaged comments only, no compose/reply. */
  locked?: boolean;
  getVideoTimeSec?: () => number | undefined;
  onSeekVideo?: (seconds: number) => void;
}) {
  const auth = useConvexAuth();
  const isCourse = Boolean(courseId);
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const [stack, setStack] = useState<ThreadFrame[]>([
    { parentId: null, parentPreview: null, scrollTop: 0 },
  ]);
  const frame = stack[stack.length - 1]!;
  const parentId = frame.parentId;
  const listRef = useRef<HTMLDivElement>(null);
  const restoreScrollRef = useRef<number | null>(null);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [commentSearch, setCommentSearch] = useState("");
  const [commentSort, setCommentSort] = useState<CommentSort>("newest");
  const deferredSearch = useDeferredValue(commentSearch.trim());
  const searching = deferredSearch.length > 0 && !locked;
  const composerResize = useStudioComposerResize({
    enabled: variant === "dock",
    boxSelector: ".profile-comments-composer-box",
  });
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [likeLocal, setLikeLocal] = useState<
    Record<string, { liked: boolean; likeCount: number }>
  >({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  const rootPostComments = useQuery(
    api.profiles.listComments,
    !isCourse && postId && parentId === null
      ? { postId, expiresUnix, limit: 50, sort: commentSort }
      : "skip",
  );
  const replyPostComments = useQuery(
    api.profiles.listCommentReplies,
    !isCourse && parentId !== null
      ? {
          parentId: parentId as Id<"profileComments">,
          expiresUnix,
          limit: 50,
          sort: commentSort,
        }
      : "skip",
  );
  const rootCourseComments = useQuery(
    api.academy.listComments,
    isCourse && courseId && parentId === null && !locked
      ? {
          courseId,
          lessonId: lessonId ?? undefined,
          expiresUnix,
          limit: 50,
          sort: commentSort,
        }
      : "skip",
  );
  const previewCourseComments = useQuery(
    api.academy.listPreviewComments,
    isCourse && courseId && parentId === null && locked
      ? {
          courseId,
          lessonId: lessonId ?? undefined,
          expiresUnix,
          limit: 3,
        }
      : "skip",
  );
  const replyCourseComments = useQuery(
    api.academy.listCommentReplies,
    isCourse && parentId !== null && !locked
      ? {
          parentId: parentId as Id<"academyComments">,
          expiresUnix,
          limit: 50,
          sort: commentSort,
        }
      : "skip",
  );
  const searchPostComments = useQuery(
    api.profiles.searchComments,
    !isCourse && postId && searching
      ? { postId, query: deferredSearch, expiresUnix, limit: 40, sort: commentSort }
      : "skip",
  );
  const searchCourseComments = useQuery(
    api.academy.searchComments,
    isCourse && courseId && searching
      ? {
          courseId,
          lessonId: lessonId ?? undefined,
          query: deferredSearch,
          expiresUnix,
          limit: 40,
          sort: commentSort,
        }
      : "skip",
  );
  const comments = searching
    ? isCourse
      ? searchCourseComments
      : searchPostComments
    : isCourse
      ? parentId === null
        ? locked
          ? previewCourseComments
          : rootCourseComments
        : replyCourseComments
      : parentId === null
        ? rootPostComments
        : replyPostComments;

  const addPostComment = useMutation(api.profiles.addComment);
  const deletePostComment = useMutation(api.profiles.deleteComment);
  const togglePostCommentLike = useMutation(api.profiles.toggleCommentLike);
  const addCourseComment = useMutation(api.academy.addComment);
  const deleteCourseComment = useMutation(api.academy.deleteComment);
  const toggleCourseCommentLike = useMutation(api.academy.toggleCommentLike);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);
  const ensureStudioDefaults = useMutation(api.users.ensureStudioDefaults);

  function clearPendingImage() {
    setPendingImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function openImagePreview(url: string) {
    setImagePreviewUrl(url);
  }

  function closeImagePreview() {
    setImagePreviewUrl(null);
  }

  useEffect(() => {
    setDraft("");
    setError("");
    clearPendingImage();
    setImagePreviewUrl(null);
    setLikeLocal({});
    setCommentSearch("");
    setStack([{ parentId: null, parentPreview: null, scrollTop: 0 }]);
  }, [postId, courseId, lessonId]);

  useEffect(() => {
    if (!searching || stack.length <= 1) return;
    setStack([{ parentId: null, parentPreview: null, scrollTop: 0 }]);
  }, [searching, stack.length]);

  useEffect(() => {
    return () => {
      setPendingImage((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (!imagePreviewUrl) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImagePreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imagePreviewUrl]);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;
    if (restoreScrollRef.current != null) {
      node.scrollTop = restoreScrollRef.current;
      restoreScrollRef.current = null;
      return;
    }
    node.scrollTop = 0;
  }, [parentId]);

  function saveCurrentScroll(): number {
    return listRef.current?.scrollTop ?? 0;
  }

  function openReplies(comment: CommentRow) {
    const scrollTop = saveCurrentScroll();
    setCommentSearch("");
    setStack((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = { ...last, scrollTop };
      next.push({
        parentId: comment._id,
        parentPreview: comment,
        scrollTop: 0,
      });
      return next;
    });
    setDraft("");
    setError("");
    clearPendingImage();
    setImagePreviewUrl(null);
  }

  function openSearchHit(comment: CommentRow) {
    if (!comment.parentId) {
      setCommentSearch("");
      return;
    }
    setCommentSearch("");
    setStack([
      { parentId: null, parentPreview: null, scrollTop: 0 },
      {
        parentId: comment.parentId,
        parentPreview: null,
        scrollTop: 0,
      },
    ]);
    setDraft("");
    setError("");
    clearPendingImage();
    setImagePreviewUrl(null);
  }

  function goBack() {
    if (stack.length <= 1) return;
    const target = stack[stack.length - 2];
    restoreScrollRef.current = target?.scrollTop ?? 0;
    setStack((prev) => prev.slice(0, -1));
    setDraft("");
    setError("");
    clearPendingImage();
    setImagePreviewUrl(null);
  }

  function pickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be attached");
      return;
    }
    if (file.size > MAX_COMMENT_IMAGE_BYTES) {
      setError("Image must be 12MB or smaller");
      return;
    }
    setError("");
    setPendingImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  async function uploadCommentImage(file: File): Promise<Id<"assets">> {
    const defaults = await ensureStudioDefaults({});
    return await uploadStudioAsset({
      file,
      folderId: defaults.rootFolderId,
      kind: "image",
      name: file.name || "comment.jpg",
      reserveUpload,
      commitStagingUpload,
    });
  }

  async function submit() {
    const body = draft.trim();
    if ((!body && !pendingImage) || busy) return;
    if (!auth.isAuthenticated) {
      window.location.href = `/?next=${encodeURIComponent("/")}`;
      return;
    }
    setBusy(true);
    setError("");
    playUiSound("send");
    try {
      let imageAssetId: Id<"assets"> | undefined;
      if (pendingImage) {
        imageAssetId = await uploadCommentImage(pendingImage.file);
      }
      const result = isCourse && courseId
        ? await addCourseComment({
            courseId,
            lessonId: lessonId ?? undefined,
            body,
            parentId: (parentId as Id<"academyComments"> | null) ?? undefined,
            imageAssetId,
            ...(lessonId && getVideoTimeSec
              ? (() => {
                  const t = getVideoTimeSec();
                  return typeof t === "number" && Number.isFinite(t)
                    ? { videoTimeSec: t }
                    : {};
                })()
              : {}),
          })
        : await addPostComment({
            postId: postId!,
            body,
            parentId: (parentId as Id<"profileComments"> | null) ?? undefined,
            imageAssetId,
          });
      setDraft("");
      clearPendingImage();
      onCommentCountChange?.(result.commentCount);
      if (parentId && frame.parentPreview) {
        setStack((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.parentPreview) {
            next[next.length - 1] = {
              ...last,
              parentPreview: {
                ...last.parentPreview,
                replyCount: (last.parentPreview.replyCount ?? 0) + 1,
              },
            };
          }
          return next;
        });
      }
    } catch (err) {
      playUiSound("error");
      setError(friendlyConvexError(err, "Could not post comment"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(
    commentId: Id<"profileComments"> | Id<"academyComments">,
  ) {
    setBusy(true);
    setError("");
    playUiSound("pop");
    try {
      const result = isCourse
        ? await deleteCourseComment({
            commentId: commentId as Id<"academyComments">,
          })
        : await deletePostComment({
            commentId: commentId as Id<"profileComments">,
          });
      onCommentCountChange?.(result.commentCount);
    } catch (err) {
      playUiSound("error");
      setError(friendlyConvexError(err, "Could not delete comment"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike(comment: CommentRow) {
    if (!auth.isAuthenticated) {
      window.location.href = `/?next=${encodeURIComponent("/")}`;
      return;
    }
    const prev = likeLocal[comment._id] ?? {
      liked: comment.likedByMe,
      likeCount: comment.likeCount,
    };
    const nextLiked = !prev.liked;
    playUiSound(nextLiked ? "like" : "unlike");
    setLikeLocal((state) => ({
      ...state,
      [comment._id]: {
        liked: nextLiked,
        likeCount: Math.max(0, prev.likeCount + (nextLiked ? 1 : -1)),
      },
    }));
    try {
      const result = isCourse
        ? await toggleCourseCommentLike({
            commentId: comment._id as Id<"academyComments">,
          })
        : await togglePostCommentLike({
            commentId: comment._id as Id<"profileComments">,
          });
      setLikeLocal((state) => ({
        ...state,
        [comment._id]: { liked: result.liked, likeCount: result.likeCount },
      }));
    } catch (err) {
      setLikeLocal((state) => ({ ...state, [comment._id]: prev }));
      playUiSound("error");
      setError(friendlyConvexError(err, "Could not like comment"));
    }
  }

  const inThread = parentId !== null;
  const showHeader = showRootHeader || inThread || Boolean(postAuthor);
  const parent = frame.parentPreview;
  const parentName = parent ? commentLabel(parent) : "";
  const parentInitials = parent
    ? profileNameInitials({
        displayName: parent.displayName,
        name: parent.username,
      })
    : "";
  const postName = postAuthor ? postAuthorLabel(postAuthor) : "";
  const postInitials = postAuthor
    ? profileNameInitials({
        displayName: postAuthor.displayName,
        name: postAuthor.username ?? [postAuthor.firstName, postAuthor.lastName].filter(Boolean).join(" "),
      })
    : "";
  const composerPlaceholder = !auth.isAuthenticated
    ? "Sign in to comment"
    : inThread
      ? `Reply to ${parentName}…`
      : "Add a comment…";

  function renderComment(
    comment: CommentRow,
    options: { isParent?: boolean } = {},
  ) {
    const isParent = Boolean(options.isParent);
    if (isParent) {
      const likeState = likeLocal[comment._id] ?? {
        liked: comment.likedByMe,
        likeCount: comment.likeCount,
      };
      return (
        <section key={`${comment._id}-parent`} className="profile-comment-parent-body">
          <div className="profile-comment-parent-content">
            {comment.body ? <p>{comment.body}</p> : null}
            {comment.imageUrl ? (
              <button
                type="button"
                className="profile-comment-image-btn"
                aria-label="View image"
                onClick={() => openImagePreview(comment.imageUrl!)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="profile-comment-image" src={comment.imageUrl} alt="" />
              </button>
            ) : null}
            <button
              type="button"
              className={`profile-comment-like${likeState.liked ? " is-liked" : ""}`}
              aria-pressed={likeState.liked}
              aria-label={likeState.liked ? "Unlike comment" : "Like comment"}
              onClick={() => void toggleLike(comment)}
            >
              <Heart
                aria-hidden="true"
                fill={likeState.liked ? "currentColor" : "none"}
                strokeWidth={likeState.liked ? 0 : 2}
              />
              {likeState.likeCount > 0 ? <span>{likeState.likeCount}</span> : null}
            </button>
          </div>
        </section>
      );
    }
    const likeState = likeLocal[comment._id] ?? {
      liked: comment.likedByMe,
      likeCount: comment.likeCount,
    };
    return (
      <ProfileCommentBubble
        key={comment._id}
        comment={comment}
        searching={searching}
        locked={locked}
        canDrag={!isCourse && Boolean(postId)}
        postId={postId}
        postThumbnailUrl={postAuthor?.thumbnailUrl}
        likeState={likeState}
        onToggleLike={(row) => void toggleLike(row)}
        onReply={openReplies}
        onOpenSearchHit={openSearchHit}
        onDelete={(id) => void remove(id)}
        onSeekVideo={onSeekVideo}
        onOpenImage={openImagePreview}
      />
    );
  }

  const repliesLoading = comments === undefined;
  const repliesEmpty = comments !== undefined && comments.length === 0;
  const listClass = [
    "profile-comments-list",
    inThread && parent ? " has-parent" : "",
    repliesLoading ? " is-loading" : "",
    repliesEmpty && !parent ? " is-empty" : "",
    repliesEmpty && parent ? " is-replies-empty" : "",
  ]
    .filter(Boolean)
    .join("");

  return (
    <>
      {showHeader ? (
        <header className={`profile-comments-head${inThread || postAuthor ? " is-thread" : ""}`}>
          {inThread ? (
            <div className="profile-comments-thread-head">
              <button
                type="button"
                className="profile-comments-back"
                onClick={goBack}
                aria-label="Back to previous comments"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              {parent ? (
                <>
                  <StudioProfileAvatar
                    className="profile-comments-thread-avatar"
                    size="sm"
                    src={parent.avatarUrl}
                    initials={parentInitials}
                    displayName={parent.displayName}
                    name={parent.username}
                  />
                  <div className="profile-comments-thread-preview">
                    <strong>{parentName}</strong>
                    <time dateTime={new Date(parent.createdAt).toISOString()}>
                      {formatWhen(parent.createdAt)}
                    </time>
                  </div>
                </>
              ) : (
                <div className="profile-comments-thread-preview">
                  <strong>Replies</strong>
                </div>
              )}
            </div>
          ) : postAuthor ? (
            <div
              className="profile-comments-thread-head"
              draggable={!isCourse && Boolean(postId)}
              title={
                !isCourse && postId
                  ? "Drag into a chat to share this post"
                  : undefined
              }
              onDragStart={
                !isCourse && postId
                  ? (event) => {
                      setFeedShareDataTransfer(event.dataTransfer, {
                        type: "post",
                        postId,
                        username: postAuthor.username,
                        displayName: postAuthor.displayName,
                        thumbnailUrl: postAuthor.thumbnailUrl,
                      });
                    }
                  : undefined
              }
            >
              <StudioProfileAvatar
                className="profile-comments-thread-avatar"
                size="sm"
                src={postAuthor.avatarUrl}
                initials={postInitials}
                displayName={postAuthor.displayName}
                firstName={postAuthor.firstName}
                lastName={postAuthor.lastName}
                name={postAuthor.username}
              />
              <div className="profile-comments-thread-preview">
                <strong>{postName}</strong>
                <time dateTime={new Date(postAuthor.publishedAt).toISOString()}>
                  {formatPostStamp(postAuthor.publishedAt, postAuthor.editedAt)}
                </time>
              </div>
            </div>
          ) : (
            <div>
              <strong>Comments</strong>
              <span>{commentCount}</span>
            </div>
          )}
          {!inThread && postActions ? (
            <div className="profile-comments-post-actions">
              <button
                type="button"
                className={`profile-comments-post-action${postActions.liked ? " is-liked" : ""}`}
                data-studio-sfx="like"
                aria-pressed={postActions.liked}
                aria-label={postActions.liked ? "Unlike" : "Like"}
                onClick={postActions.onLike}
              >
                <Heart aria-hidden="true" fill="currentColor" strokeWidth={0} />
                <span>{formatCount(postActions.likeCount)}</span>
              </button>
              <button
                type="button"
                className={`profile-comments-post-action${postActions.saved ? " is-saved" : ""}`}
                data-studio-sfx="save"
                aria-pressed={postActions.saved}
                aria-label={postActions.saved ? "Unsave" : "Save"}
                onClick={postActions.onSave}
              >
                <Bookmark aria-hidden="true" fill="currentColor" strokeWidth={0} />
                <span>{formatCount(postActions.saveCount)}</span>
              </button>
              {postAuthor?.isOwner && onEditDescription ? (
                <button
                  type="button"
                  className="profile-comments-close"
                  onClick={onEditDescription}
                  aria-label="Edit description"
                >
                  <Pencil aria-hidden="true" strokeWidth={2.25} />
                </button>
              ) : null}
            </div>
          ) : null}
          {showClose ? (
            <button type="button" className="profile-comments-close" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </header>
      ) : null}

      {!locked ? (
        <div className="profile-comments-search">
          <PanelSearchBar
            value={commentSearch}
            onChange={setCommentSearch}
            placeholder="Search comments"
            aria-label="Search comments and replies"
            end={
              <ExplorerTypeFilter
                value={commentSort}
                defaultId="newest"
                options={[...COMMENT_SORT_FILTERS]}
                onChange={(next: string) => {
                  if (
                    next === "newest" ||
                    next === "oldest" ||
                    next === "liked" ||
                    next === "replies"
                  ) {
                    setCommentSort(next);
                  }
                }}
                ariaLabel="Sort comments"
              />
            }
          />
        </div>
      ) : null}

      <div className={`profile-comments-locked-shell${locked ? " is-locked" : ""}`}>
        <div ref={listRef} className={listClass}>
          {!searching && inThread && parent ? renderComment(parent, { isParent: true }) : null}
          {repliesLoading ? (
            <div className="profile-comments-empty">
              <Loader2 className="profile-comments-empty-spin" aria-hidden="true" />
            </div>
          ) : repliesEmpty ? (
            <div className="profile-comments-empty">
              <MessageCircle className="profile-comments-empty-icon" aria-hidden="true" />
              <p>
                {searching
                  ? "No matching comments"
                  : inThread
                    ? "No replies yet"
                    : locked
                      ? "No comments yet"
                      : "No comments yet"}
              </p>
              <span>
                {searching
                  ? "Try another name or phrase"
                  : inThread
                    ? "Be the first to reply"
                    : locked
                      ? "Unlock the course to join the discussion"
                      : "Be the first to say something"}
              </span>
            </div>
          ) : (
            comments.map((comment) => renderComment(comment))
          )}
        </div>

        {locked ? (
          <div className="studio-academy-lock-overlay" aria-hidden="true">
            <span className="studio-academy-lock-badge">
              <Lock aria-hidden="true" />
            </span>
          </div>
        ) : (
          <form
            className={`profile-comments-composer${variant === "sheet" ? " is-sheet-composer" : ""}`}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            pickImage(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        {error ? <p className="profile-comments-error">{error}</p> : null}
        {pendingImage ? (
          <div className="profile-comments-attach-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage.previewUrl} alt="" />
            <button
              type="button"
              className="profile-comments-attach-remove"
              aria-label="Remove image"
              disabled={busy}
              onClick={clearPendingImage}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div
          ref={composerResize.boxRef}
          className="profile-comments-composer-box studio-composer-resize-box"
        >
          {variant === "dock" ? (
            <button
              type="button"
              className="studio-composer-resize-handle"
              aria-label="Resize composer"
              title="Drag to resize"
              onPointerDown={composerResize.begin}
              onPointerMove={composerResize.move}
              onPointerUp={composerResize.end}
              onPointerCancel={composerResize.end}
            />
          ) : null}
          <div className="profile-comments-inputline">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={composerPlaceholder}
              maxLength={500}
              disabled={busy}
              rows={variant === "dock" ? 2 : 1}
            />
          </div>
          <div className="profile-comments-composer-toolbar studio-composer-toolbar">
            <button
              type="button"
              className={`studio-composer-circle-btn${pendingImage ? " is-on" : ""}`}
              aria-label={pendingImage ? "Replace image" : "Attach image"}
              disabled={busy || !auth.isAuthenticated}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon aria-hidden="true" />
            </button>
            <button
              type="submit"
              className="studio-composer-circle-btn studio-composer-send-btn"
              disabled={busy || (!draft.trim() && !pendingImage)}
              aria-label="Send comment"
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
          </form>
        )}
      </div>

      {imagePreviewUrl ? (
        <div
          className="profile-comments-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            className="profile-comments-lightbox-dismiss"
            aria-label="Close image preview"
            onClick={closeImagePreview}
          />
          <div className="profile-comments-lightbox-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreviewUrl} alt="" className="profile-comments-lightbox-image" />
          </div>
          <button
            type="button"
            className="profile-comments-lightbox-close"
            aria-label="Close"
            onClick={closeImagePreview}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function parseCaptionParts(caption: string | undefined): Array<{
  type: "text" | "hash" | "mention";
  value: string;
}> {
  const trimmed = caption?.trim() ?? "";
  const parts: Array<{ type: "text" | "hash" | "mention"; value: string }> = [];
  if (!trimmed) return parts;
  const re = /([#@][a-zA-Z0-9._]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    if (match.index > last) {
      const collapsed = trimmed.slice(last, match.index).replace(/\s+/g, " ");
      if (collapsed.length > 0) {
        parts.push({ type: "text", value: collapsed });
      }
    }
    const token = match[1] ?? "";
    if (token.startsWith("#") && /^#[a-zA-Z0-9_]{2,32}$/.test(token)) {
      parts.push({ type: "hash", value: token.slice(1) });
    } else if (token.startsWith("@") && /^@[a-zA-Z][a-zA-Z0-9._]{2,29}$/.test(token)) {
      parts.push({ type: "mention", value: token.slice(1).toLowerCase() });
    } else {
      parts.push({ type: "text", value: token });
    }
    last = match.index + token.length;
  }
  if (last < trimmed.length) {
    const collapsed = trimmed.slice(last).replace(/\s+/g, " ");
    if (collapsed.length > 0) {
      parts.push({ type: "text", value: collapsed });
    }
  }
  return parts;
}

function DescriptionHashChip({ tag }: { tag: string }) {
  return (
    <span className="post-compose-inline-chip is-hash profile-description-chip">
      <span className="post-compose-inline-chip-label">#{tag}</span>
    </span>
  );
}

function DescriptionMentionChip({
  username,
  avatarUrl,
  displayName,
  onOpen,
}: {
  username: string;
  avatarUrl?: string;
  displayName?: string;
  onOpen?: (username: string) => void;
}) {
  const initial = (displayName || username).slice(0, 1).toUpperCase();
  const inner = (
    <>
      <span className="post-compose-inline-chip-avatar">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" />
        ) : (
          <span className="post-compose-inline-chip-initial">{initial}</span>
        )}
      </span>
      <span className="post-compose-inline-chip-label">{username}</span>
    </>
  );
  if (onOpen) {
    return (
      <button
        type="button"
        className="post-compose-inline-chip is-mention profile-description-chip"
        onClick={() => onOpen(username)}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className="post-compose-inline-chip is-mention profile-description-chip">
      {inner}
    </span>
  );
}

function DescriptionBody({
  postId,
  description,
  postAuthor,
  variant,
  onClose,
  startEditing = false,
  onStartEditingConsumed,
}: {
  postId: Id<"profilePosts">;
  description: DescriptionInfo;
  postAuthor?: PostAuthorInfo;
  variant: "sheet" | "dock";
  onClose: () => void;
  startEditing?: boolean;
  onStartEditingConsumed?: () => void;
}) {
  const updateCaption = useMutation(api.profiles.updatePostCaption);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description.caption ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [localEditedAt, setLocalEditedAt] = useState<number | undefined>(
    postAuthor?.editedAt,
  );
  const [localCaption, setLocalCaption] = useState(description.caption);

  useEffect(() => {
    if (!editing) {
      setDraft(description.caption ?? "");
      setLocalCaption(description.caption);
    }
  }, [description.caption, editing]);

  useEffect(() => {
    setLocalEditedAt(postAuthor?.editedAt);
  }, [postAuthor?.editedAt]);

  const canEdit = Boolean(postAuthor?.isOwner);

  useEffect(() => {
    if (!startEditing || !canEdit) return;
    setDraft(localCaption ?? description.caption ?? "");
    setEditError("");
    setEditing(true);
    onStartEditingConsumed?.();
    // Intentionally only when parent requests edit open — not on caption churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startEditing gate
  }, [startEditing, canEdit]);

  const caption = localCaption;
  const parts = parseCaptionParts(caption);
  const mentionByUser = new Map(
    (description.mentions ?? []).map((m) => [m.username.toLowerCase(), m] as const),
  );
  const authorUsername = (postAuthor?.username || description.username || "")
    .replace(/^@/, "")
    .toLowerCase();
  if (authorUsername && postAuthor?.avatarUrl && !mentionByUser.get(authorUsername)?.avatarUrl) {
    const existing = mentionByUser.get(authorUsername);
    mentionByUser.set(authorUsername, {
      username: existing?.username || authorUsername,
      profileId: existing?.profileId || "",
      displayName: existing?.displayName || postAuthor.displayName,
      avatarUrl: postAuthor.avatarUrl,
    });
  }
  const shownHashes = new Set(
    parts.filter((p) => p.type === "hash").map((p) => p.value.toLowerCase()),
  );
  const leftoverTags = (description.hashtags ?? []).filter(
    (t) => !shownHashes.has(t.tag.toLowerCase()),
  );
  const empty = !editing && parts.length === 0 && leftoverTags.length === 0;
  const postName = postAuthor ? postAuthorLabel(postAuthor) : "Description";
  const postInitials = postAuthor
    ? profileNameInitials({
        displayName: postAuthor.displayName,
        firstName: postAuthor.firstName,
        lastName: postAuthor.lastName,
        name: postAuthor.username,
      })
    : "?";

  async function saveEdit() {
    if (saving) return;
    setSaving(true);
    setEditError("");
    try {
      const result = await updateCaption({
        postId,
        caption: draft.slice(0, MAX_POST_CAPTION),
      });
      setLocalCaption(result.caption);
      setLocalEditedAt(result.editedAt);
      setEditing(false);
      description.onCaptionSaved?.(result.caption, result.editedAt);
    } catch (error) {
      setEditError(friendlyConvexError(error, "Could not save description."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="profile-comments-head is-thread is-description">
        <div
          className="profile-comments-thread-head"
          draggable
          title="Drag into a chat to share this post"
          onDragStart={(event) => {
            setFeedShareDataTransfer(event.dataTransfer, {
              type: "post",
              postId,
              username: postAuthor?.username ?? description.username,
              displayName: postAuthor?.displayName,
              caption: caption,
              thumbnailUrl: postAuthor?.thumbnailUrl,
            });
          }}
        >
          {postAuthor ? (
            <>
              <StudioProfileAvatar
                className="profile-comments-thread-avatar"
                size="sm"
                src={postAuthor.avatarUrl}
                initials={postInitials}
                displayName={postAuthor.displayName}
                firstName={postAuthor.firstName}
                lastName={postAuthor.lastName}
                name={postAuthor.username}
              />
              <div className="profile-comments-thread-preview">
                <strong>{postName}</strong>
                <time dateTime={new Date(postAuthor.publishedAt).toISOString()}>
                  {formatPostStamp(postAuthor.publishedAt, localEditedAt)}
                </time>
              </div>
            </>
          ) : (
            <div className="profile-comments-thread-preview">
              <strong>Description</strong>
            </div>
          )}
        </div>
        <div className="profile-comments-post-actions">
          {canEdit && !editing ? (
            <button
              type="button"
              className="profile-comments-close"
              onClick={() => {
                setDraft(caption ?? "");
                setEditError("");
                setEditing(true);
              }}
              aria-label="Edit description"
            >
              <Pencil aria-hidden="true" strokeWidth={2.25} />
            </button>
          ) : null}
          <button
            type="button"
            className="profile-comments-close"
            onClick={onClose}
            aria-label="Close description"
          >
            <X aria-hidden="true" strokeWidth={2.25} />
          </button>
        </div>
      </header>

      <div
        className={`profile-comments-list profile-description-body${empty ? " is-empty" : ""}`}
      >
        {editing ? (
          <div className="profile-description-edit">
            <textarea
              className="profile-description-edit-input"
              value={draft}
              maxLength={MAX_POST_CAPTION}
              rows={6}
              placeholder="Write a description…"
              disabled={saving}
              onChange={(event) => setDraft(event.target.value.slice(0, MAX_POST_CAPTION))}
            />
            <div className="profile-description-edit-bar">
              <span className="profile-description-edit-count">
                {draft.length}/{MAX_POST_CAPTION}
              </span>
              <div className="profile-description-edit-actions">
                <button
                  type="button"
                  className="profile-description-edit-btn"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setEditError("");
                    setDraft(caption ?? "");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="profile-description-edit-btn is-primary"
                  disabled={saving}
                  onClick={() => void saveEdit()}
                >
                  {saving ? (
                    <Loader2 className="profile-post-rail-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Save
                </button>
              </div>
            </div>
            {editError ? <p className="profile-description-edit-error">{editError}</p> : null}
          </div>
        ) : empty ? (
          <div className="profile-comments-empty">
            <p>No description</p>
            {canEdit ? (
              <button
                type="button"
                className="profile-description-empty-edit"
                onClick={() => {
                  setDraft("");
                  setEditError("");
                  setEditing(true);
                }}
              >
                Add one
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="profile-description-content"
            draggable
            title="Drag into a chat to share this post"
            onDragStart={(event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest("button, a, input, textarea")) {
                event.preventDefault();
                return;
              }
              setFeedShareDataTransfer(event.dataTransfer, {
                type: "post",
                postId,
                username: postAuthor?.username ?? description.username,
                displayName: postAuthor?.displayName,
                caption: caption,
                thumbnailUrl: postAuthor?.thumbnailUrl,
              });
            }}
          >
            {parts.length > 0 ? (
              <p className="profile-description-text">
                {parts.map((part, index) => {
                  if (part.type === "hash") {
                    return <DescriptionHashChip key={`h-${index}`} tag={part.value} />;
                  }
                  if (part.type === "mention") {
                    const meta = mentionByUser.get(part.value);
                    return (
                      <DescriptionMentionChip
                        key={`m-${index}`}
                        username={part.value}
                        avatarUrl={meta?.avatarUrl}
                        displayName={meta?.displayName}
                        onOpen={
                          meta && description.onOpenProfile
                            ? description.onOpenProfile
                            : undefined
                        }
                      />
                    );
                  }
                  const prev = parts[index - 1];
                  const next = parts[index + 1];
                  const betweenChips =
                    /^\s+$/.test(part.value) &&
                    prev != null &&
                    next != null &&
                    prev.type !== "text" &&
                    next.type !== "text";
                  if (betweenChips) {
                    return <span key={`g-${index}`}>{"\u2009"}</span>;
                  }
                  return <span key={`t-${index}`}>{part.value}</span>;
                })}
              </p>
            ) : null}
            {leftoverTags.length > 0 ? (
              <div className="profile-description-tags">
                {leftoverTags.map((tag) => (
                  <DescriptionHashChip
                    key={tag.tag}
                    tag={tag.displayTag || tag.tag}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {variant === "sheet" ? <div className="profile-description-sheet-spacer" /> : null}
    </>
  );
}

/**
 * Desktop: real right column beside the post (feed shrinks to make room).
 * Mobile: glass bottom sheet when `open`.
 * `mode="description"` swaps the column/sheet into the full post description.
 * Pass `courseId` (Academy) instead of `postId` for course discussion — same
 * composer features (text, image, replies, likes); feed drag-share stays post-only.
 * `chrome="sidebar"` uses CN book-sidebar border/head (Academy / secondary rails).
 */
export function ProfileCommentsPanel({
  postId,
  courseId,
  lessonId,
  open,
  onClose,
  commentCount,
  onCommentCountChange,
  postAuthor,
  postActions,
  mode = "comments",
  onModeChange,
  description,
  chrome = "feed",
  sidebarTitle,
  sidebarAvatarUrl,
  locked = false,
  getVideoTimeSec,
  onSeekVideo,
}: {
  postId?: Id<"profilePosts">;
  courseId?: Id<"academyCourses">;
  lessonId?: Id<"academyLessons">;
  open: boolean;
  onClose: () => void;
  commentCount: number;
  onCommentCountChange?: (count: number) => void;
  postAuthor?: PostAuthorInfo;
  postActions?: PostActionsInfo;
  mode?: CommentsPanelMode;
  onModeChange?: (mode: CommentsPanelMode) => void;
  description?: DescriptionInfo;
  chrome?: "feed" | "sidebar";
  /** Sidebar chrome title (e.g. lesson name). */
  sidebarTitle?: string;
  /** Circle thumb in sidebar head (lesson/course banner). */
  sidebarAvatarUrl?: string;
  /** Unpaid Academy: preview comments + lock overlay. */
  locked?: boolean;
  getVideoTimeSec?: () => number | undefined;
  onSeekVideo?: (seconds: number) => void;
}) {
  const { isMobile } = useMobileLayout();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [sheetAlive, setSheetAlive] = useState(open);
  const [startEditingDescription, setStartEditingDescription] = useState(false);
  const showingDescription = Boolean(postId) && mode === "description";
  const useSidebarChrome = chrome === "sidebar" && !isMobile;

  useEffect(() => {
    if (open) setSheetAlive(true);
  }, [open]);

  useEffect(() => {
    // Mount under the studio shell so the bottom nav (z-index 60) stays above the sheet.
    setPortalRoot(
      (document.querySelector(".studio-polish") as HTMLElement | null) ?? document.body,
    );
  }, []);

  useEffect(() => {
    if (!open || !isMobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showingDescription) onModeChange?.("comments");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onModeChange, isMobile, showingDescription]);

  useEffect(() => {
    if (mode !== "description") setStartEditingDescription(false);
  }, [mode]);

  function backToComments() {
    setStartEditingDescription(false);
    onModeChange?.("comments");
  }

  function dismissSheet() {
    if (showingDescription) {
      setStartEditingDescription(false);
      onModeChange?.("comments");
      return;
    }
    onClose();
  }

  function openDescriptionEditor() {
    setStartEditingDescription(true);
    onModeChange?.("description");
  }

  const descriptionPanel =
    showingDescription && description && postId ? (
      <DescriptionBody
        postId={postId}
        description={description}
        postAuthor={postAuthor}
        variant={isMobile ? "sheet" : "dock"}
        onClose={backToComments}
        startEditing={startEditingDescription}
        onStartEditingConsumed={() => setStartEditingDescription(false)}
      />
    ) : null;

  const commentsBody = (
    <CommentsBody
      postId={postId}
      courseId={courseId}
      lessonId={lessonId}
      commentCount={commentCount}
      onCommentCountChange={onCommentCountChange}
      showRootHeader={isMobile && !courseId}
      showClose={false}
      onClose={onClose}
      variant={isMobile ? "sheet" : "dock"}
      postAuthor={useSidebarChrome ? undefined : postAuthor}
      postActions={postId ? postActions : undefined}
      onEditDescription={
        postId && postAuthor?.isOwner && description
          ? openDescriptionEditor
          : undefined
      }
      locked={locked}
      getVideoTimeSec={getVideoTimeSec}
      onSeekVideo={onSeekVideo}
    />
  );

  if (!isMobile) {
    if (useSidebarChrome) {
      const headLabel = sidebarTitle?.trim() || "Comments";
      const headInitials = headLabel
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
      return (
        <aside className={`studio-cn-book-sidebar${locked ? " is-comments-locked" : ""}`} aria-label="Comments">
          <div className="studio-cn-book-sidebar-head cursor-panel-head cursor-sidebar-head shrink-0 studio-academy-comments-head">
            <span className="studio-academy-comments-avatar" aria-hidden="true">
              {sidebarAvatarUrl ? (
                <MediaLoadFrame
                  kind="image"
                  src={sidebarAvatarUrl}
                  cacheKey={`academy-comments-avatar:${sidebarAvatarUrl}`}
                  ratio="fill"
                  className="studio-academy-comments-avatar-frame"
                  loaderSize="sm"
                  loaderRing
                >
                  {({ onLoad, onError }) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sidebarAvatarUrl}
                      alt=""
                      decoding="async"
                      onLoad={onLoad}
                      onError={onError}
                    />
                  )}
                </MediaLoadFrame>
              ) : (
                <span>{headInitials || "A"}</span>
              )}
            </span>
            <strong className="studio-academy-comments-head-title">
              {headLabel}
            </strong>
            <span
              className="studio-academy-comments-meta"
              aria-label={`${formatCount(commentCount)} comments`}
            >
              <MessageCircle aria-hidden="true" strokeWidth={2} />
              <span>{formatCount(commentCount)}</span>
            </span>
          </div>
          <div className="studio-cn-book-sidebar-body is-comments-fill">
            {descriptionPanel ?? commentsBody}
          </div>
        </aside>
      );
    }
    return (
      <aside
        className="profile-comments-dock"
        aria-label={showingDescription ? "Description" : "Comments"}
      >
        {descriptionPanel ?? commentsBody}
      </aside>
    );
  }

  if ((!open && !sheetAlive) || !portalRoot) return null;

  return createPortal(
    <StudioCnBookSheet
      open={open}
      onClose={dismissSheet}
      onExited={() => setSheetAlive(false)}
      ariaLabel={showingDescription ? "Description" : "Comments"}
      className={courseId ? "is-academy-comments" : "is-profile-comments"}
      backLayerId={courseId ? "academy-comments-sheet" : "profile-comments-sheet"}
    >
      <div className="profile-comments-sheet-fill">
        {descriptionPanel ?? commentsBody}
      </div>
    </StudioCnBookSheet>,
    portalRoot,
  );
}
