"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Bookmark, Forward, Heart, Loader2, MessageCircle, Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { profileAvatarStyle, profileNameInitials } from "@/studio/lib/profileAvatar";
import { ProfileCommentsPanel } from "./ProfileCommentsPanel";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { MediaLoadFrame } from "./media-load-frame";
import "./profile-post-viewer.css";

type FeedPost = {
  _id: Id<"profilePosts">;
  assetId: Id<"assets">;
  kind: "image" | "video";
  name: string;
  caption?: string;
  likeCount: number;
  viewCount: number;
  commentCount?: number;
  saveCount?: number;
  shareCount?: number;
  publishedAt: number;
  thumbnailUrl?: string;
  mediaUrl?: string;
  likedByViewer: boolean;
  savedByViewer?: boolean;
  username: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  fromFollowing: boolean;
  score: number;
};

type AuthorPost = {
  _id: Id<"profilePosts">;
  assetId: Id<"assets">;
  kind: "image" | "video";
  name: string;
  caption?: string;
  likeCount: number;
  viewCount: number;
  commentCount?: number;
  saveCount?: number;
  shareCount?: number;
  publishedAt: number;
  thumbnailUrl?: string;
  mediaUrl?: string;
  likedByViewer: boolean;
  savedByViewer?: boolean;
};

type SlidePost = (AuthorPost | FeedPost) & {
  username?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  savedByViewer?: boolean;
  saveCount?: number;
  shareCount?: number;
};

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function viewedKey(postId: string) {
  return `pp-viewed:${postId}`;
}

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const VIDEO_CHROME_HIDE_MS = 2600;

function FeedMedia({
  post,
  active,
  preload = false,
}: {
  post: SlidePost;
  active: boolean;
  /** Neighbor slides (above/below/left/right) — fetch & buffer early. */
  preload?: boolean;
}) {
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const media = useQuery(api.profiles.getPublicPostMedia, {
    postId: post._id,
    expiresUnix,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const chromeVisibleRef = useRef(false);
  const postIdRef = useRef(post._id);
  const loadedSrcRef = useRef<string | null>(null);
  const resumeAtRef = useRef(0);
  const wasPlayingRef = useRef(false);
  // Lock the first full media URL so Convex re-signs / thumb→full swaps don't
  // rewrite <img src> after the bitmap is already on screen.
  const lockedSrcRef = useRef<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  if (postIdRef.current !== post._id) {
    postIdRef.current = post._id;
    lockedSrcRef.current = null;
    loadedSrcRef.current = null;
    resumeAtRef.current = 0;
    wasPlayingRef.current = false;
  }
  const mediaUrl = media?.mediaUrl ?? post.mediaUrl;
  const thumbUrl = media?.thumbnailUrl ?? post.thumbnailUrl;
  if (mediaUrl) {
    lockedSrcRef.current = mediaUrl;
  } else if (!lockedSrcRef.current && thumbUrl) {
    lockedSrcRef.current = thumbUrl;
  }
  const displaySrc = lockedSrcRef.current;
  const isVideo = post.kind === "video" && Boolean(displaySrc);
  const playSrc = mediaUrl || displaySrc;
  const shouldWarm = active || preload;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      chromeVisibleRef.current = false;
      setChromeVisible(false);
      hideTimerRef.current = null;
    }, VIDEO_CHROME_HIDE_MS);
  }, [clearHideTimer]);

  const showChrome = useCallback(() => {
    setChromeVisible(true);
    chromeVisibleRef.current = true;
    const video = videoRef.current;
    if (video && !video.paused && !seeking) scheduleHide();
    else clearHideTimer();
  }, [clearHideTimer, scheduleHide, seeking]);

  const hideChrome = useCallback(() => {
    clearHideTimer();
    chromeVisibleRef.current = false;
    setChromeVisible(false);
  }, [clearHideTimer]);

  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  useEffect(() => {
    hideChrome();
    setSeeking(false);
    setCurrent(0);
    setSeekValue(0);
    setDuration(0);
    setPlaying(false);
    resumeAtRef.current = 0;
    wasPlayingRef.current = false;
  }, [post._id, hideChrome]);

  useEffect(() => {
    if (!active) {
      hideChrome();
      setSeeking(false);
    }
  }, [active, hideChrome]);

  // Decode neighbor/active images early.
  useEffect(() => {
    if (!shouldWarm || post.kind === "video" || !displaySrc) return;
    if (typeof Image === "undefined") return;
    const img = new window.Image();
    img.decoding = "async";
    img.src = displaySrc;
  }, [shouldWarm, post.kind, displaySrc]);

  // Kick video network fetch once per src — never reload on tab switches.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || post.kind !== "video" || !playSrc || !shouldWarm) return;
    if (loadedSrcRef.current === playSrc) return;
    loadedSrcRef.current = playSrc;
    try {
      video.load();
    } catch {
      /* ignore */
    }
  }, [playSrc, post.kind, shouldWarm]);

  // Pause when leaving the slide/tab; resume from the same position when returning.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || post.kind !== "video") return;
    if (active) {
      const resumeAt = resumeAtRef.current;
      if (resumeAt > 0.05) {
        try {
          if (Math.abs(video.currentTime - resumeAt) > 0.2) {
            video.currentTime = resumeAt;
          }
        } catch {
          /* ignore */
        }
        setCurrent(resumeAt);
        setSeekValue(resumeAt);
      }
      // Fresh slide (no saved time) or was playing before leave → autoplay.
      // If the user had paused, stay paused at the saved frame.
      if (wasPlayingRef.current || resumeAt <= 0.05) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
      return;
    }

    // Leaving: stash position + pause so we don't burn decode/bandwidth off-tab.
    resumeAtRef.current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    wasPlayingRef.current = !video.paused;
    setCurrent(resumeAtRef.current);
    setSeekValue(resumeAtRef.current);
    video.pause();
  }, [active, post.kind, playSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || post.kind !== "video") return undefined;

    const onTime = () => {
      if (!seeking) {
        setCurrent(video.currentTime);
        setSeekValue(video.currentTime);
      }
    };
    const onMeta = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onPlay = () => {
      setPlaying(true);
      if (chromeVisibleRef.current) scheduleHide();
    };
    const onPause = () => {
      setPlaying(false);
      clearHideTimer();
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    onMeta();
    setPlaying(!video.paused);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [clearHideTimer, displaySrc, post.kind, scheduleHide, seeking, playSrc]);

  useEffect(() => {
    if (!active || post.kind !== "video") return undefined;
    function onFeedTap(event: Event) {
      const detail = (event as CustomEvent<{ postId?: string }>).detail;
      if (!detail?.postId || detail.postId !== post._id) return;
      if (chromeVisibleRef.current) hideChrome();
      else showChrome();
    }
    window.addEventListener("ys-feed-media-tap", onFeedTap);
    return () => window.removeEventListener("ys-feed-media-tap", onFeedTap);
  }, [active, hideChrome, post._id, post.kind, showChrome]);

  function stopFeedGesture(event: ReactPointerEvent | ReactMouseEvent) {
    event.stopPropagation();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
    showChrome();
  }

  function onSeekStart(event: ReactPointerEvent<HTMLInputElement>) {
    stopFeedGesture(event);
    setSeeking(true);
    clearHideTimer();
  }

  function onSeekChange(event: ChangeEvent<HTMLInputElement>) {
    setSeekValue(Number(event.target.value));
  }

  function onSeekEnd(event: ReactPointerEvent<HTMLInputElement> | ReactFocusEvent<HTMLInputElement>) {
    const video = videoRef.current;
    const next = Number((event.target as HTMLInputElement).value);
    if (video && Number.isFinite(next)) {
      video.currentTime = next;
      setCurrent(next);
      setSeekValue(next);
    }
    setSeeking(false);
    if (video && !video.paused) scheduleHide();
  }

  const progressPct = duration > 0 ? Math.min(100, (seekValue / duration) * 100) : 0;

  return (
    <div className={`profile-post-slide-media${isVideo ? " is-video" : ""}`}>
      {isVideo && playSrc ? (
        <MediaLoadFrame
          kind="video"
          src={playSrc}
          ratio="video-portrait"
          className="profile-post-slide-frame"
        >
          {({ onLoad, onError }) => (
            <video
              ref={videoRef}
              src={playSrc}
              poster={
                thumbUrl && !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(thumbUrl) ? thumbUrl : undefined
              }
              playsInline
              loop
              muted={!active}
              controls={false}
              preload={shouldWarm ? "auto" : "metadata"}
              onLoadedData={onLoad}
              onError={onError}
            />
          )}
        </MediaLoadFrame>
      ) : displaySrc ? (
        <MediaLoadFrame
          kind="image"
          src={displaySrc}
          ratio="image"
          className="profile-post-slide-frame"
        >
          {({ onLoad, onError }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displaySrc}
              alt={post.caption || post.name}
              draggable={false}
              decoding="async"
              loading={shouldWarm ? "eager" : "lazy"}
              fetchPriority={active ? "high" : shouldWarm ? "low" : "auto"}
              onLoad={onLoad}
              onError={onError}
            />
          )}
        </MediaLoadFrame>
      ) : (
        <div
          className={`profile-post-slide-loading ${post.kind === "video" ? "is-ratio-video" : "is-ratio-image"}`}
          aria-busy="true"
        >
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        </div>
      )}

      {isVideo && playSrc ? (
        <div
          className={`profile-post-video-chrome${chromeVisible ? " is-visible" : ""}`}
          aria-hidden={!chromeVisible}
        >
          <button
            type="button"
            data-video-control
            className="profile-post-video-play"
            aria-label={playing ? "Pause" : "Play"}
            tabIndex={chromeVisible ? 0 : -1}
            onPointerDown={stopFeedGesture}
            onClick={(event) => {
              stopFeedGesture(event);
              togglePlay();
            }}
          >
            {playing ? (
              <Pause className="h-14 w-14" fill="currentColor" strokeWidth={0} aria-hidden="true" />
            ) : (
              <Play className="h-14 w-14" fill="currentColor" strokeWidth={0} aria-hidden="true" />
            )}
          </button>

          <div
            data-video-control
            className="profile-post-video-bar"
            onPointerDown={stopFeedGesture}
            onClick={stopFeedGesture}
          >
            <span className="profile-post-video-time">{formatVideoTime(seeking ? seekValue : current)}</span>
            <div
              className="profile-post-video-scrub"
              style={{ "--pp-video-progress": `${progressPct}%` } as CSSProperties}
            >
              <input
                type="range"
                className="profile-post-video-scrub-input"
                min={0}
                max={duration || 0}
                step={0.05}
                value={seekValue}
                disabled={!duration}
                aria-label="Seek"
                tabIndex={chromeVisible ? 0 : -1}
                onPointerDown={onSeekStart}
                onChange={onSeekChange}
                onPointerUp={onSeekEnd}
                onBlur={onSeekEnd}
              />
            </div>
            <span className="profile-post-video-time">{formatVideoTime(duration)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedActions({
  post,
  username,
  avatarUrl,
  displayName,
  firstName,
  lastName,
  likeBusy,
  saveBusy,
  shareBusy,
  localComments,
  localSaves,
  localShares,
  onLike,
  onSave,
  onShare,
  onOpenComments,
  onOpenProfile,
}: {
  post: SlidePost;
  username: string;
  avatarUrl?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  likeBusy: boolean;
  saveBusy: boolean;
  shareBusy: boolean;
  localComments: number;
  localSaves: number;
  localShares: number;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onOpenComments: () => void;
  onOpenProfile?: (username: string) => void;
}) {
  const initials = profileNameInitials({ displayName, firstName, lastName });
  const saved = Boolean(post.savedByViewer);

  return (
    <div className="profile-post-rail">
      <button
        type="button"
        className="profile-post-rail-avatar"
        style={avatarUrl ? undefined : profileAvatarStyle(initials)}
        onClick={(event) => {
          event.stopPropagation();
          if (username) onOpenProfile?.(username);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={username ? `Open @${username}` : "Open profile"}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" draggable={false} />
        ) : (
          <span>{initials}</span>
        )}
      </button>
      <button
        type="button"
        className={`profile-post-rail-btn${post.likedByViewer ? " is-liked" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onLike();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        disabled={likeBusy}
        aria-label={post.likedByViewer ? "Unlike" : "Like"}
      >
        {likeBusy ? (
          <Loader2 className="profile-post-rail-spin" aria-hidden="true" />
        ) : (
          <Heart aria-hidden="true" fill="currentColor" strokeWidth={0} />
        )}
        <span>{formatCount(post.likeCount)}</span>
      </button>
      <button
        type="button"
        className="profile-post-rail-btn"
        onClick={(event) => {
          event.stopPropagation();
          onOpenComments();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label="Comments"
      >
        <MessageCircle aria-hidden="true" fill="currentColor" strokeWidth={0} />
        <span>{formatCount(localComments)}</span>
      </button>
      <button
        type="button"
        className={`profile-post-rail-btn${saved ? " is-saved" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onSave();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        disabled={saveBusy}
        aria-label={saved ? "Unsave" : "Save"}
      >
        {saveBusy ? (
          <Loader2 className="profile-post-rail-spin" aria-hidden="true" />
        ) : (
          <Bookmark aria-hidden="true" fill="currentColor" strokeWidth={0} />
        )}
        <span>{formatCount(localSaves)}</span>
      </button>
      <button
        type="button"
        className="profile-post-rail-btn"
        onClick={(event) => {
          event.stopPropagation();
          onShare();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        disabled={shareBusy}
        aria-label="Share"
      >
        {shareBusy ? (
          <Loader2 className="profile-post-rail-spin" aria-hidden="true" />
        ) : (
          <Forward
            className="profile-post-rail-share"
            aria-hidden="true"
            strokeWidth={2.25}
          />
        )}
        <span>{formatCount(localShares)}</span>
      </button>
    </div>
  );
}

/**
 * TikTok-style feed:
 * - Up / down = next ranked feed post
 * - Left / right = other posts from current author
 * Swipes slide into the next item (not bounce-then-switch).
 */
export function ProfilePostViewer({
  postId,
  onOpenProfile,
  tabActive = true,
}: {
  username?: string;
  postId: Id<"profilePosts"> | string;
  onOpenProfile?: (username: string) => void;
  /** False while another studio tab is focused — pause playback, keep state. */
  tabActive?: boolean;
}) {
  const auth = useConvexAuth();
  const { isMobile } = useMobileLayout();
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const seedPostId = !postId || String(postId) === "home" ? undefined : postId;
  const feed = useQuery(api.profiles.listFeed, {
    expiresUnix,
    limit: 28,
    seedPostId,
  });
  const toggleLike = useMutation(api.profiles.toggleLike);
  const toggleSave = useMutation(api.profiles.toggleSave);
  const recordShare = useMutation(api.profiles.recordShare);
  const recordPostView = useMutation(api.profiles.recordPostView);

  const [activePostId, setActivePostId] = useState<Id<"profilePosts"> | null>(null);
  const [likeBusyId, setLikeBusyId] = useState<Id<"profilePosts"> | null>(null);
  const [saveBusyId, setSaveBusyId] = useState<Id<"profilePosts"> | null>(null);
  const [shareBusyId, setShareBusyId] = useState<Id<"profilePosts"> | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [localLikes, setLocalLikes] = useState<
    Record<string, { liked: boolean; likeCount: number }>
  >({});
  const [localSaves, setLocalSaves] = useState<
    Record<string, { saved: boolean; saveCount: number }>
  >({});
  const [localShares, setLocalShares] = useState<Record<string, number>>({});
  const [localViews, setLocalViews] = useState<Record<string, number>>({});
  const [localComments, setLocalComments] = useState<Record<string, number>>({});
  const [axis, setAxis] = useState<"x" | "y">("y");
  const [animating, setAnimating] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  const pointerRef = useRef<{
    id: number;
    x: number;
    y: number;
    axis: "x" | "y" | null;
    moved: boolean;
    captured?: boolean;
  } | null>(null);
  const recordedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const animatingRef = useRef(false);
  const axisRef = useRef<"x" | "y">("y");
  const activePostIdRef = useRef<Id<"profilePosts"> | null>(null);
  const feedIndexRef = useRef(0);
  const authorIndexRef = useRef(-1);
  const feedLenRef = useRef(0);
  const authorLenRef = useRef(0);
  const lastFeedIndexRef = useRef(0);
  const sizeRef = useRef({ w: 1, h: 1 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pendingCommitRef = useRef<{ axis: "x" | "y"; delta: -1 | 1 } | null>(null);
  const pendingSnapRef = useRef(false);
  const commitTokenRef = useRef(0);
  const lastTapRef = useRef(0);
  const likeBurstTimerRef = useRef<number | null>(null);
  const handleLikeRef = useRef<() => void>(() => {});
  const activeLikedRef = useRef(false);

  const resolvedFeed = useMemo(() => {
    return (feed ?? []).map((post) => {
      const like = localLikes[post._id];
      const save = localSaves[post._id];
      return {
        ...post,
        ...(like
          ? { likedByViewer: like.liked, likeCount: like.likeCount }
          : null),
        ...(save
          ? { savedByViewer: save.saved, saveCount: save.saveCount }
          : null),
        shareCount: localShares[post._id] ?? post.shareCount ?? 0,
      };
    });
  }, [feed, localLikes, localSaves, localShares]);

  // One source of truth for what is on screen — axis only picks neighbor lists.
  useEffect(() => {
    if (!resolvedFeed.length || seededRef.current) return;
    const found = seedPostId
      ? resolvedFeed.findIndex((post) => post._id === seedPostId)
      : 0;
    const safeIdx = found >= 0 ? found : 0;
    const id = resolvedFeed[safeIdx]!._id;
    seededRef.current = true;
    lastFeedIndexRef.current = safeIdx;
    activePostIdRef.current = id;
    setActivePostId(id);
  }, [seedPostId, resolvedFeed]);

  const feedIndexExact = activePostId
    ? resolvedFeed.findIndex((post) => post._id === activePostId)
    : -1;
  const feedIndex = feedIndexExact >= 0 ? feedIndexExact : lastFeedIndexRef.current;
  const feedAnchor = resolvedFeed[feedIndex] ?? resolvedFeed[0] ?? null;
  const authorUsername = feedAnchor?.username ?? "";

  const authorPostsRaw = useQuery(
    api.profiles.listPublicPosts,
    authorUsername ? { username: authorUsername, expiresUnix, limit: 48 } : "skip",
  );

  const authorPosts = useMemo(() => {
    return (authorPostsRaw ?? []).map((post) => {
      const like = localLikes[post._id];
      const save = localSaves[post._id];
      return {
        ...post,
        ...(like
          ? { likedByViewer: like.liked, likeCount: like.likeCount }
          : null),
        ...(save
          ? { savedByViewer: save.saved, saveCount: save.saveCount }
          : null),
        shareCount: localShares[post._id] ?? post.shareCount ?? 0,
      };
    });
  }, [authorPostsRaw, localLikes, localSaves, localShares]);

  const authorIndex = activePostId
    ? authorPosts.findIndex((post) => post._id === activePostId)
    : -1;

  useEffect(() => {
    if (feedIndexExact >= 0) lastFeedIndexRef.current = feedIndexExact;
  }, [feedIndexExact]);

  activePostIdRef.current = activePostId;
  feedIndexRef.current = feedIndex;
  authorIndexRef.current = authorIndex;
  axisRef.current = axis;
  feedLenRef.current = resolvedFeed.length;
  authorLenRef.current = authorPosts.length;

  const resolvedFeedRef = useRef(resolvedFeed);
  const authorPostsRef = useRef(authorPosts);
  resolvedFeedRef.current = resolvedFeed;
  authorPostsRef.current = authorPosts;

  const lockAxis = useCallback((next: "x" | "y") => {
    axisRef.current = next;
    if (axis !== next) setAxis(next);
  }, [axis]);

  // Snap the track back in the same commit as the active-post swap — before
  // paint. flushSync was painting one frame with new roles + old translate
  // (looked like a remount / flash on every swipe).
  useLayoutEffect(() => {
    if (!pendingSnapRef.current) return;
    pendingSnapRef.current = false;
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = "translate3d(0px, 0px, 0)";
  }, [activePostId]);

  const activePost = useMemo(() => {
    if (!activePostId) return null;
    // Prefer feed row (has username / avatar) when the post is in both lists.
    return (
      resolvedFeed.find((post) => post._id === activePostId) ??
      authorPosts.find((post) => post._id === activePostId) ??
      null
    );
  }, [activePostId, resolvedFeed, authorPosts]);

  const feedPrev = feedIndex > 0 ? (resolvedFeed[feedIndex - 1] ?? null) : null;
  const feedNext =
    feedIndex >= 0 && feedIndex < resolvedFeed.length - 1
      ? (resolvedFeed[feedIndex + 1] ?? null)
      : null;
  const authorPrev = authorIndex > 0 ? (authorPosts[authorIndex - 1] ?? null) : null;
  const authorNext =
    authorIndex >= 0 && authorIndex < authorPosts.length - 1
      ? (authorPosts[authorIndex + 1] ?? null)
      : null;

  const recordViewOnce = useCallback(
    async (id: Id<"profilePosts">, fallbackCount: number) => {
      if (typeof window === "undefined") return;
      const key = viewedKey(id);
      if (recordedRef.current.has(id) || sessionStorage.getItem(key)) {
        setLocalViews((prev) => (prev[id] != null ? prev : { ...prev, [id]: fallbackCount }));
        return;
      }
      recordedRef.current.add(id);
      sessionStorage.setItem(key, "1");
      try {
        const result = await recordPostView({ postId: id });
        setLocalViews((prev) => ({ ...prev, [id]: result.viewCount }));
      } catch {
        setLocalViews((prev) => ({ ...prev, [id]: fallbackCount + 1 }));
      }
    },
    [recordPostView],
  );

  useEffect(() => {
    if (!activePost) return;
    void recordViewOnce(activePost._id, activePost.viewCount);
  }, [activePost, recordViewOnce]);

  useEffect(() => {
    if (isMobile) setCommentsOpen(false);
  }, [activePost?._id, isMobile]);

  const measureSize = useCallback(() => {
    const node = rootRef.current;
    if (!node) return sizeRef.current;
    sizeRef.current = {
      w: Math.max(1, node.clientWidth),
      h: Math.max(1, node.clientHeight),
    };
    return sizeRef.current;
  }, []);

  const setTrackTransform = useCallback((x: number, y: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate
      ? "transform 300ms cubic-bezier(0.22, 0.9, 0.28, 1)"
      : "none";
    track.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const resetTrack = useCallback(() => {
    setTrackTransform(0, 0, false);
    animatingRef.current = false;
    setAnimating(false);
    pendingCommitRef.current = null;
  }, [setTrackTransform]);

  const commitSlide = useCallback(
    (nextAxis: "x" | "y", delta: -1 | 1) => {
      if (animatingRef.current) return;
      const track = trackRef.current;
      if (!track) return;

      // Lock neighbors to this axis BEFORE measuring/animating — otherwise a
      // y→x switch mid-gesture shows the wrong adjacent post, then snaps.
      lockAxis(nextAxis);

      const { w, h } = measureSize();
      const feedIdx = feedIndexRef.current;
      const authorIdx = authorIndexRef.current;
      const canMove =
        nextAxis === "y"
          ? delta < 0
            ? feedIdx > 0
            : feedIdx < feedLenRef.current - 1
          : authorIdx >= 0 &&
            (delta < 0 ? authorIdx > 0 : authorIdx < authorLenRef.current - 1);

      if (isMobile) setCommentsOpen(false);

      if (!canMove) {
        animatingRef.current = true;
        setAnimating(true);
        setTrackTransform(0, 0, true);
        window.setTimeout(() => resetTrack(), 300);
        return;
      }

      const targetX = nextAxis === "x" ? -delta * w : 0;
      const targetY = nextAxis === "y" ? -delta * h : 0;
      animatingRef.current = true;
      setAnimating(true);
      const token = ++commitTokenRef.current;
      pendingCommitRef.current = { axis: nextAxis, delta };

      const finish = (event?: TransitionEvent) => {
        if (event && (event.target !== track || event.propertyName !== "transform")) return;
        if (commitTokenRef.current !== token) return;
        track.removeEventListener("transitionend", finish);
        const pending = pendingCommitRef.current;
        if (!pending) return;
        pendingCommitRef.current = null;

        const nextPost =
          pending.axis === "y"
            ? resolvedFeedRef.current[feedIndexRef.current + pending.delta]
            : authorPostsRef.current[authorIndexRef.current + pending.delta];
        if (!nextPost) {
          setTrackTransform(0, 0, false);
          animatingRef.current = false;
          setAnimating(false);
          return;
        }

        track.style.transition = "none";
        pendingSnapRef.current = true;
        activePostIdRef.current = nextPost._id;
        if (pending.axis === "y") {
          lastFeedIndexRef.current = feedIndexRef.current + pending.delta;
        } else {
          const fIdx = resolvedFeedRef.current.findIndex((row) => row._id === nextPost._id);
          if (fIdx >= 0) lastFeedIndexRef.current = fIdx;
        }
        axisRef.current = pending.axis;
        setActivePostId(nextPost._id);
        setAxis(pending.axis);
        animatingRef.current = false;
        setAnimating(false);
      };

      track.addEventListener("transitionend", finish);
      window.setTimeout(() => {
        if (commitTokenRef.current !== token) return;
        if (!pendingCommitRef.current) return;
        finish();
      }, 360);

      requestAnimationFrame(() => {
        if (commitTokenRef.current !== token) return;
        setTrackTransform(targetX, targetY, true);
      });
    },
    [isMobile, lockAxis, measureSize, resetTrack, setTrackTransform],
  );

  useEffect(() => {
    const onResize = () => measureSize();
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureSize]);

  useEffect(() => {
    return () => {
      if (likeBurstTimerRef.current) window.clearTimeout(likeBurstTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!tabActive) return undefined;
    function onKey(event: KeyboardEvent) {
      if (animatingRef.current) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        commitSlide("y", 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        commitSlide("y", -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commitSlide("x", 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitSlide("x", -1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commitSlide, tabActive]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !tabActive) return undefined;
    let wheelLockUntil = 0;
    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        if (Math.abs(event.deltaX) < 18) return;
        event.preventDefault();
        if (animatingRef.current || Date.now() < wheelLockUntil) return;
        wheelLockUntil = Date.now() + 360;
        commitSlide("x", event.deltaX > 0 ? 1 : -1);
        return;
      }
      if (Math.abs(event.deltaY) < 18) return;
      event.preventDefault();
      if (animatingRef.current || Date.now() < wheelLockUntil) return;
      wheelLockUntil = Date.now() + 360;
      commitSlide("y", event.deltaY > 0 ? 1 : -1);
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [commitSlide, tabActive]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || animatingRef.current) return;
    // Skip capture until the pointer actually moves — keeps desktop click/tap
    // working for video chrome show/hide (same as mobile).
    if ((event.target as HTMLElement | null)?.closest?.("[data-video-control]")) {
      return;
    }
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      axis: null,
      moved: false,
      captured: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerRef.current;
    if (!start || start.id !== event.pointerId || animatingRef.current) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      start.axis = Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
      start.moved = true;
      if (!start.captured) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
          start.captured = true;
        } catch {
          /* ignore */
        }
      }
      pointerRef.current = start;
      // Sync neighbor slides to this axis before the drag transform paints.
      lockAxis(start.axis);
      setTrackTransform(0, 0, false);
    }
    if (start.axis === "y") {
      const atStart = feedIndexRef.current <= 0 && dy > 0;
      const atEnd = feedIndexRef.current >= feedLenRef.current - 1 && dy < 0;
      const resisted = atStart || atEnd ? dy * 0.28 : dy;
      setTrackTransform(0, resisted, false);
    } else {
      const atStart = authorIndexRef.current <= 0 && dx > 0;
      const atEnd =
        (authorIndexRef.current < 0 ||
          authorIndexRef.current >= authorLenRef.current - 1) &&
        dx < 0;
      const resisted = atStart || atEnd ? dx * 0.28 : dx;
      setTrackTransform(resisted, 0, false);
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerRef.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const gestureAxis = start.axis;
    const moved = start.moved;
    const captured = Boolean(start.captured);
    pointerRef.current = null;
    if (captured) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (animatingRef.current) return;

    // Single tap: toggle video chrome. Double-tap: like.
    if (!moved || (Math.abs(dx) < 10 && Math.abs(dy) < 10)) {
      setTrackTransform(0, 0, false);
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-video-control]")) return;
      if (target?.closest?.(".profile-post-rail")) return;
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        lastTapRef.current = 0;
        void handleDoubleTapLike();
      } else {
        lastTapRef.current = now;
        const postId = activePostIdRef.current;
        if (postId) {
          window.dispatchEvent(
            new CustomEvent("ys-feed-media-tap", { detail: { postId } }),
          );
        }
      }
      return;
    }

    if (!gestureAxis) {
      setTrackTransform(0, 0, false);
      return;
    }

    const { w, h } = measureSize();
    const size = gestureAxis === "y" ? h : w;
    const delta = gestureAxis === "y" ? dy : dx;
    const threshold = Math.min(64, size * 0.1);
    if (delta <= -threshold) {
      commitSlide(gestureAxis, 1);
      return;
    }
    if (delta >= threshold) {
      commitSlide(gestureAxis, -1);
      return;
    }
    animatingRef.current = true;
    setAnimating(true);
    setTrackTransform(0, 0, true);
    window.setTimeout(() => resetTrack(), 300);
  }

  async function handleDoubleTapLike() {
    setLikeBurst(true);
    if (likeBurstTimerRef.current) window.clearTimeout(likeBurstTimerRef.current);
    likeBurstTimerRef.current = window.setTimeout(() => setLikeBurst(false), 700);
    if (activeLikedRef.current) return;
    handleLikeRef.current();
  }

  async function handleLike(post: SlidePost) {
    if (!auth.isAuthenticated) {
      window.location.href = `/?next=${encodeURIComponent("/")}`;
      return;
    }
    setLikeBusyId(post._id);
    try {
      const result = await toggleLike({ postId: post._id });
      setLocalLikes((prev) => ({
        ...prev,
        [post._id]: { liked: result.liked, likeCount: result.likeCount },
      }));
    } catch (error) {
      console.error(friendlyConvexError(error, "Could not update like"));
    } finally {
      setLikeBusyId(null);
    }
  }

  handleLikeRef.current = () => {
    if (activePost) void handleLike(activePost);
  };
  activeLikedRef.current = Boolean(
    localLikes[activePost?._id ?? ""]?.liked ?? activePost?.likedByViewer,
  );

  async function handleSave(post: SlidePost) {
    if (!auth.isAuthenticated) {
      window.location.href = `/?next=${encodeURIComponent("/")}`;
      return;
    }
    setSaveBusyId(post._id);
    try {
      const result = await toggleSave({ postId: post._id });
      setLocalSaves((prev) => ({
        ...prev,
        [post._id]: { saved: result.saved, saveCount: result.saveCount },
      }));
    } catch (error) {
      console.error(friendlyConvexError(error, "Could not update save"));
    } finally {
      setSaveBusyId(null);
    }
  }

  async function handleShare(post: SlidePost) {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/?feed=${encodeURIComponent(post._id)}`
        : `/?feed=${encodeURIComponent(post._id)}`;
    const shareTitle =
      post.caption?.trim() ||
      (post.username ? `@${post.username}` : "Yatishara Studio");

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch (error) {
      // User cancel on share sheet — still fine to skip recording.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }

    if (!auth.isAuthenticated) return;
    setShareBusyId(post._id);
    try {
      const result = await recordShare({ postId: post._id });
      setLocalShares((prev) => ({ ...prev, [post._id]: result.shareCount }));
    } catch (error) {
      console.error(friendlyConvexError(error, "Could not record share"));
    } finally {
      setShareBusyId(null);
    }
  }

  if (feed === undefined) {
    return (
      <div className="profile-post-viewer is-loading">
        <div className="profile-post-viewer-blur" aria-hidden="true" />
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!activePost || !resolvedFeed.length) {
    return (
      <div className="profile-post-viewer is-empty">
        <div className="profile-post-viewer-blur" aria-hidden="true" />
        <p>No posts in feed yet</p>
        {authorUsername && onOpenProfile ? (
          <button type="button" onClick={() => onOpenProfile(authorUsername)}>
            Back to @{authorUsername}
          </button>
        ) : null}
      </div>
    );
  }

  const activeFeedRow = activePostId
    ? (resolvedFeed.find((post) => post._id === activePostId) ?? null)
    : null;
  const profileMeta = activeFeedRow ?? feedAnchor;

  const activeSlidePost: SlidePost =
    activeFeedRow && activePost._id === activeFeedRow._id
      ? { ...activeFeedRow, ...activePost }
      : {
          ...activePost,
          username: authorUsername,
          displayName: profileMeta?.displayName,
          firstName: profileMeta?.firstName,
          lastName: profileMeta?.lastName,
          avatarUrl: profileMeta?.avatarUrl,
        };

  const withProfile = (post: AuthorPost | FeedPost | null): SlidePost | null => {
    if (!post) return null;
    if ("username" in post && post.username) return post;
    return {
      ...post,
      username: authorUsername,
      displayName: profileMeta?.displayName,
      avatarUrl: profileMeta?.avatarUrl,
      firstName: profileMeta?.firstName,
      lastName: profileMeta?.lastName,
    };
  };

  // Keep feed + author neighbors mounted (hidden when idle) so axis switches and
  // commits reuse the same <img> nodes instead of remounting media every swipe.
  const slidePool: SlidePost[] = (() => {
    const map = new Map<string, SlidePost>();
    const add = (post: SlidePost | null) => {
      if (!post) return;
      const prev = map.get(post._id);
      if (!prev || ("username" in post && post.username)) map.set(post._id, post);
      else map.set(post._id, { ...prev, ...post });
    };
    add(activeSlidePost);
    add(withProfile(feedPrev));
    add(withProfile(feedNext));
    add(withProfile(authorPrev));
    add(withProfile(authorNext));
    return [...map.values()];
  })();

  const slideRole = (id: string): "prev" | "current" | "next" | "idle" => {
    if (id === activeSlidePost._id) return "current";
    if (axis === "y") {
      if (feedPrev?._id === id) return "prev";
      if (feedNext?._id === id) return "next";
    } else {
      if (authorPrev?._id === id) return "prev";
      if (authorNext?._id === id) return "next";
    }
    return "idle";
  };

  return (
    <div className="profile-post-viewer-layout">
      <div
        ref={rootRef}
        className="profile-post-viewer is-feed"
        aria-label="Studio feed"
        onPointerDown={tabActive ? onPointerDown : undefined}
        onPointerMove={tabActive ? onPointerMove : undefined}
        onPointerUp={tabActive ? finishPointer : undefined}
        onPointerCancel={tabActive ? finishPointer : undefined}
      >
        <div className="profile-post-viewer-blur" aria-hidden="true" />
        <div className="profile-post-track" ref={trackRef}>
          {slidePool.map((post) => {
            const role = slideRole(post._id);
            const postUsername = post.username || authorUsername;
            const postComments = localComments[post._id] ?? post.commentCount ?? 0;
            const postSaves =
              localSaves[post._id]?.saveCount ?? post.saveCount ?? 0;
            const postShares = localShares[post._id] ?? post.shareCount ?? 0;
            return (
              <article
                key={post._id}
                className={`profile-post-slide is-${role} is-${axis}`}
                aria-hidden={role === "idle"}
              >
                <div className="profile-post-slide-glass" aria-hidden="true" />
                <FeedMedia
                  post={post}
                  active={tabActive && role === "current" && !animating}
                  preload={tabActive || role !== "idle"}
                />
                <FeedActions
                  post={post}
                  username={postUsername}
                  avatarUrl={post.avatarUrl}
                  displayName={post.displayName}
                  firstName={post.firstName}
                  lastName={post.lastName}
                  likeBusy={likeBusyId === post._id}
                  saveBusy={saveBusyId === post._id}
                  shareBusy={shareBusyId === post._id}
                  localComments={postComments}
                  localSaves={postSaves}
                  localShares={postShares}
                  onLike={() => void handleLike(post)}
                  onSave={() => void handleSave(post)}
                  onShare={() => void handleShare(post)}
                  onOpenComments={() => {
                    if (role === "current") setCommentsOpen(true);
                  }}
                  onOpenProfile={onOpenProfile}
                />
                {role === "current" && likeBurst ? (
                  <div className="profile-post-like-burst" aria-hidden="true">
                    <Heart fill="currentColor" strokeWidth={0} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <ProfileCommentsPanel
        postId={activePost._id}
        open={commentsOpen && tabActive}
        onClose={() => setCommentsOpen(false)}
        commentCount={
          localComments[activePost._id] ??
          activePost.commentCount ??
          activeFeedRow?.commentCount ??
          0
        }
        onCommentCountChange={(count) =>
          setLocalComments((prev) => ({ ...prev, [activePost._id]: count }))
        }
        postAuthor={{
          displayName: activeSlidePost.displayName,
          username: activeSlidePost.username,
          firstName: activeSlidePost.firstName,
          lastName: activeSlidePost.lastName,
          avatarUrl: activeSlidePost.avatarUrl,
          publishedAt: activeSlidePost.publishedAt,
        }}
        postActions={{
          liked: Boolean(
            localLikes[activePost._id]?.liked ?? activeSlidePost.likedByViewer,
          ),
          saved: Boolean(
            localSaves[activePost._id]?.saved ?? activeSlidePost.savedByViewer,
          ),
          likeCount:
            localLikes[activePost._id]?.likeCount ?? activeSlidePost.likeCount ?? 0,
          saveCount:
            localSaves[activePost._id]?.saveCount ?? activeSlidePost.saveCount ?? 0,
          shareCount:
            localShares[activePost._id] ?? activeSlidePost.shareCount ?? 0,
          likeBusy: likeBusyId === activePost._id,
          saveBusy: saveBusyId === activePost._id,
          shareBusy: shareBusyId === activePost._id,
          onLike: () => void handleLike(activeSlidePost),
          onSave: () => void handleSave(activeSlidePost),
          onShare: () => void handleShare(activeSlidePost),
        }}
      />
    </div>
  );
}

export const StudioFeedViewer = ProfilePostViewer;
