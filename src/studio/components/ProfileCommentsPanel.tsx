"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUp,
  Bookmark,
  ChevronLeft,
  Forward,
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { profileNameInitials } from "@/studio/lib/profileAvatar";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import { useMobileLayout } from "@/hooks/use-mobile-layout";

type CommentRow = {
  _id: Id<"profileComments">;
  body: string;
  createdAt: number;
  userId: Id<"users">;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  isOwner: boolean;
  isMine: boolean;
  parentId?: Id<"profileComments">;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  imageUrl?: string;
};

type ThreadFrame = {
  parentId: Id<"profileComments"> | null;
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
  publishedAt: number;
};

type PostActionsInfo = {
  liked: boolean;
  saved: boolean;
  likeCount: number;
  saveCount: number;
  shareCount: number;
  likeBusy?: boolean;
  saveBusy?: boolean;
  shareBusy?: boolean;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
};

const MAX_COMMENT_IMAGE_BYTES = 12 * 1024 * 1024;

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function formatWhen(ts: number): string {
  const delta = Date.now() - ts;
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
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

function CommentsBody({
  postId,
  commentCount,
  onCommentCountChange,
  showRootHeader,
  showClose,
  onClose,
  variant,
  postAuthor,
  postActions,
}: {
  postId: Id<"profilePosts">;
  commentCount: number;
  onCommentCountChange?: (count: number) => void;
  showRootHeader: boolean;
  showClose: boolean;
  onClose?: () => void;
  variant: "sheet" | "dock";
  postAuthor?: PostAuthorInfo;
  postActions?: PostActionsInfo;
}) {
  const auth = useConvexAuth();
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const [stack, setStack] = useState<ThreadFrame[]>([
    { parentId: null, parentPreview: null, scrollTop: 0 },
  ]);
  const frame = stack[stack.length - 1]!;
  const parentId = frame.parentId;
  const listRef = useRef<HTMLDivElement>(null);
  const restoreScrollRef = useRef<number | null>(null);

  const rootComments = useQuery(
    api.profiles.listComments,
    parentId === null ? { postId, expiresUnix, limit: 50 } : "skip",
  );
  const replyComments = useQuery(
    api.profiles.listCommentReplies,
    parentId !== null ? { parentId, expiresUnix, limit: 50 } : "skip",
  );
  const comments = parentId === null ? rootComments : replyComments;

  const addComment = useMutation(api.profiles.addComment);
  const deleteComment = useMutation(api.profiles.deleteComment);
  const toggleCommentLike = useMutation(api.profiles.toggleCommentLike);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);
  const ensureStudioDefaults = useMutation(api.users.ensureStudioDefaults);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [likeLocal, setLikeLocal] = useState<
    Record<string, { liked: boolean; likeCount: number }>
  >({});
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    setStack([{ parentId: null, parentPreview: null, scrollTop: 0 }]);
  }, [postId]);

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
    try {
      let imageAssetId: Id<"assets"> | undefined;
      if (pendingImage) {
        imageAssetId = await uploadCommentImage(pendingImage.file);
      }
      const result = await addComment({
        postId,
        body,
        parentId: parentId ?? undefined,
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
      setError(friendlyConvexError(err, "Could not post comment"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: Id<"profileComments">) {
    setBusy(true);
    setError("");
    try {
      const result = await deleteComment({ commentId });
      onCommentCountChange?.(result.commentCount);
    } catch (err) {
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
    setLikeLocal((state) => ({
      ...state,
      [comment._id]: {
        liked: nextLiked,
        likeCount: Math.max(0, prev.likeCount + (nextLiked ? 1 : -1)),
      },
    }));
    try {
      const result = await toggleCommentLike({ commentId: comment._id });
      setLikeLocal((state) => ({
        ...state,
        [comment._id]: { liked: result.liked, likeCount: result.likeCount },
      }));
    } catch (err) {
      setLikeLocal((state) => ({ ...state, [comment._id]: prev }));
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
          </div>
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
        </section>
      );
    }
    const label = commentLabel(comment);
    const initials = profileNameInitials({
      displayName: comment.displayName,
      name: comment.username,
    });
    const likeState = likeLocal[comment._id] ?? {
      liked: comment.likedByMe,
      likeCount: comment.likeCount,
    };
    const replyCount = comment.replyCount ?? 0;
    return (
      <article key={comment._id} className="profile-comment-row">
        <StudioProfileAvatar
          className="profile-comment-avatar"
          size="sm"
          src={comment.avatarUrl}
          initials={initials}
          displayName={comment.displayName}
          name={comment.username}
        />
        <div className="profile-comment-body">
          <div className="profile-comment-meta">
            <div className="profile-comment-meta-text">
              <div className="profile-comment-meta-top">
                <strong>{label}</strong>
                {comment.isOwner ? <span className="profile-comment-creator-tag">Creator</span> : null}
              </div>
              <time dateTime={new Date(comment.createdAt).toISOString()}>
                {formatWhen(comment.createdAt)}
              </time>
            </div>
            {comment.isMine ? (
              <button
                type="button"
                className="profile-comment-delete"
                aria-label="Delete comment"
                disabled={busy}
                onClick={() => void remove(comment._id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
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
          <div className="profile-comment-actions">
            <div className="profile-comment-actions-left">
              <button
                type="button"
                className="profile-comment-action"
                aria-label="Reply"
                onClick={() => openReplies(comment)}
              >
                Reply
              </button>
              {replyCount > 0 ? (
                <button
                  type="button"
                  className="profile-comment-view-replies"
                  onClick={() => openReplies(comment)}
                >
                  View {replyCount} {replyCount === 1 ? "reply" : "replies"}
                </button>
              ) : null}
            </div>
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
        </div>
      </article>
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
                    size="md"
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
            <div className="profile-comments-thread-head">
              <StudioProfileAvatar
                className="profile-comments-thread-avatar"
                size="md"
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
                  {formatWhen(postAuthor.publishedAt)}
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
                aria-pressed={postActions.liked}
                aria-label={postActions.liked ? "Unlike" : "Like"}
                disabled={postActions.likeBusy}
                onClick={postActions.onLike}
              >
                {postActions.likeBusy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Heart aria-hidden="true" fill="currentColor" strokeWidth={0} />
                )}
                <span>{formatCount(postActions.likeCount)}</span>
              </button>
              <button
                type="button"
                className={`profile-comments-post-action${postActions.saved ? " is-saved" : ""}`}
                aria-pressed={postActions.saved}
                aria-label={postActions.saved ? "Unsave" : "Save"}
                disabled={postActions.saveBusy}
                onClick={postActions.onSave}
              >
                {postActions.saveBusy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Bookmark aria-hidden="true" fill="currentColor" strokeWidth={0} />
                )}
                <span>{formatCount(postActions.saveCount)}</span>
              </button>
              <button
                type="button"
                className="profile-comments-post-action"
                aria-label="Share"
                disabled={postActions.shareBusy}
                onClick={postActions.onShare}
              >
                {postActions.shareBusy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Forward aria-hidden="true" strokeWidth={2.25} />
                )}
                <span>{formatCount(postActions.shareCount)}</span>
              </button>
            </div>
          ) : null}
          {showClose ? (
            <button type="button" className="profile-comments-close" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </header>
      ) : null}

      <div ref={listRef} className={listClass}>
        {inThread && parent ? renderComment(parent, { isParent: true }) : null}
        {repliesLoading ? (
          <div className="profile-comments-empty">
            <Loader2 className="profile-comments-empty-spin" aria-hidden="true" />
          </div>
        ) : repliesEmpty ? (
          <div className="profile-comments-empty">
            <MessageCircle className="profile-comments-empty-icon" aria-hidden="true" />
            <p>{inThread ? "No replies yet" : "No comments yet"}</p>
            <span>{inThread ? "Be the first to reply" : "Be the first to say something"}</span>
          </div>
        ) : (
          comments.map((comment) => renderComment(comment))
        )}
      </div>

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
        {variant === "sheet" ? (
          <div className="profile-comments-composer-box">
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
                rows={1}
              />
            </div>
            <div className="profile-comments-composer-toolbar">
              <button
                type="button"
                className={`profile-comments-circle-btn${pendingImage ? " is-on" : ""}`}
                aria-label={pendingImage ? "Replace image" : "Attach image"}
                disabled={busy || !auth.isAuthenticated}
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon aria-hidden="true" />
              </button>
              <button
                type="submit"
                className="profile-comments-circle-btn is-send"
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
        ) : (
          <div className="profile-comments-input-row">
            <button
              type="button"
              className={`profile-comments-attach-btn${pendingImage ? " is-on" : ""}`}
              aria-label={pendingImage ? "Replace image" : "Attach image"}
              disabled={busy || !auth.isAuthenticated}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={composerPlaceholder}
              maxLength={500}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || (!draft.trim() && !pendingImage)}
              aria-label="Send comment"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </form>

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

/**
 * Desktop: real right column beside the post (feed shrinks to make room).
 * Mobile: glass bottom sheet when `open`.
 */
export function ProfileCommentsPanel({
  postId,
  open,
  onClose,
  commentCount,
  onCommentCountChange,
  postAuthor,
  postActions,
}: {
  postId: Id<"profilePosts">;
  open: boolean;
  onClose: () => void;
  commentCount: number;
  onCommentCountChange?: (count: number) => void;
  postAuthor?: PostAuthorInfo;
  postActions?: PostActionsInfo;
}) {
  const { isMobile } = useMobileLayout();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Mount under the studio shell so the bottom nav (z-index 60) stays above the sheet.
    setPortalRoot(
      (document.querySelector(".studio-polish") as HTMLElement | null) ?? document.body,
    );
  }, []);

  useEffect(() => {
    if (!open || !isMobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, isMobile]);

  if (!isMobile) {
    return (
      <aside className="profile-comments-dock" aria-label="Comments">
        <CommentsBody
          postId={postId}
          commentCount={commentCount}
          onCommentCountChange={onCommentCountChange}
          showRootHeader={false}
          showClose={false}
          variant="dock"
          postAuthor={postAuthor}
          postActions={postActions}
        />
      </aside>
    );
  }

  if (!open || !portalRoot) return null;

  return createPortal(
    <div className="profile-comments-sheet" role="dialog" aria-modal="true" aria-label="Comments">
      <button
        type="button"
        className="profile-comments-dismiss"
        aria-label="Close comments"
        onClick={onClose}
      />
      <aside className="profile-comments-panel is-sheet">
        <CommentsBody
          postId={postId}
          commentCount={commentCount}
          onCommentCountChange={onCommentCountChange}
          showRootHeader
          showClose
          onClose={onClose}
          variant="sheet"
          postAuthor={postAuthor}
          postActions={postActions}
        />
      </aside>
    </div>,
    portalRoot,
  );
}
