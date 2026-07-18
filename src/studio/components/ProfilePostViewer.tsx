"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Forward,
  Heart,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Plus,
} from "lucide-react";
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
import { ProfileCommentsPanel } from "./ProfileCommentsPanel";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { MediaLoadFrame, MediaLoadWave } from "./media-load-frame";
import "./profile-post-viewer.css";

type FeedMode = "forYou" | "following";

type FeedPost = {
  _id: Id<"profilePosts">;
  assetId: Id<"assets">;
  profileId: Id<"profiles">;
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
  isFollowing: boolean;
  isOwner: boolean;
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
  profileId?: Id<"profiles">;
  isFollowing?: boolean;
  isOwner?: boolean;
};

type SlideRole = "prev" | "current" | "next" | "idle";

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function viewedKey(postId: string) {
  return `pp-viewed:${postId}`;
}

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

/** Collect up to `count` unique neighbors in one direction, wrapping the list. */
function collectAxisNeighbors<T extends { _id: string }>(
  posts: T[],
  index: number,
  direction: -1 | 1,
  count = 3,
): T[] {
  if (index < 0 || posts.length <= 1) return [];
  const out: T[] = [];
  const seen = new Set<string>([posts[index]!._id]);
  const max = Math.min(count, posts.length - 1);
  for (let step = 1; step <= max; step++) {
    const post = posts[wrapIndex(index + direction * step, posts.length)];
    if (!post || seen.has(post._id)) break;
    seen.add(post._id);
    out.push(post);
  }
  return out;
}

function normalizedWheelDelta(delta: number, deltaMode: number) {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 16;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * window.innerHeight;
  return delta;
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
/** Settle after release — short + strong ease-out so it feels shot forward. */
const SLIDE_MS = 180;
const SLIDE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const SLIDE_FALLBACK_MS = SLIDE_MS + 40;

function roleRank(role: SlideRole): number {
  if (role === "current") return 3;
  if (role === "prev" || role === "next") return 2;
  return 1;
}

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
  const [expiresUnix, setExpiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60,
  );
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
  const pointerSeekingRef = useRef(false);
  // Lock the first usable media URL so Convex re-signs / thumb→full swaps don't
  // rewrite <img>/<video> src after the media is already on screen.
  const lockedSrcRef = useRef<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);

  if (postIdRef.current !== post._id) {
    postIdRef.current = post._id;
    lockedSrcRef.current = null;
    loadedSrcRef.current = null;
    resumeAtRef.current = 0;
    wasPlayingRef.current = false;
    pointerSeekingRef.current = false;
  }

  const mediaUrl = media?.mediaUrl ?? post.mediaUrl;
  const thumbUrl = media?.thumbnailUrl ?? post.thumbnailUrl;
  const thumbIsVideo =
    typeof thumbUrl === "string" && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(thumbUrl);
  const candidateSrc =
    post.kind === "video"
      ? mediaUrl || (thumbIsVideo ? thumbUrl : undefined) || undefined
      : mediaUrl || thumbUrl || undefined;

  if (!lockedSrcRef.current && candidateSrc) {
    lockedSrcRef.current = candidateSrc;
  } else if (
    lockedSrcRef.current &&
    mediaUrl &&
    lockedSrcRef.current !== mediaUrl &&
    thumbUrl &&
    lockedSrcRef.current === thumbUrl
  ) {
    // One-time upgrade from preview thumb → full media.
    lockedSrcRef.current = mediaUrl;
  }

  const stableSrc = lockedSrcRef.current;
  const displaySrc = stableSrc;
  const isVideo = post.kind === "video";
  const playSrc = isVideo ? stableSrc ?? undefined : displaySrc ?? undefined;
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
    setSoundEnabled(false);
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

  // Kick video network fetch once per locked src — never reload on role/active flips.
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
  }, [shouldWarm, playSrc, post.kind]);

  // Pause when leaving the slide/tab; resume from the same position when returning.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || post.kind !== "video" || !playSrc) return;
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
      // Autoplay must stay muted until the user enables sound (browser policy).
      video.muted = !soundEnabled;
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
  }, [active, playSrc, post.kind, soundEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || post.kind !== "video") return undefined;

    const onTime = () => {
      if (!pointerSeekingRef.current) {
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
    const onError = () => {
      lockedSrcRef.current = null;
      loadedSrcRef.current = null;
      setExpiresUnix(Math.floor(Date.now() / 1000) + 60 * 60);
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    onMeta();
    setPlaying(!video.paused);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
    };
  }, [clearHideTimer, playSrc, post.kind, scheduleHide]);

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
    if (video.paused) {
      // User gesture: allow audible playback after the first explicit play.
      if (!soundEnabled) {
        setSoundEnabled(true);
        video.muted = false;
      }
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
    showChrome();
  }

  function onSeekStart(event: ReactPointerEvent<HTMLInputElement>) {
    stopFeedGesture(event);
    pointerSeekingRef.current = true;
    setSeeking(true);
    clearHideTimer();
  }

  function onSeekChange(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);
    setSeekValue(next);
    if (!pointerSeekingRef.current) {
      const video = videoRef.current;
      if (video && Number.isFinite(next)) {
        video.currentTime = next;
        setCurrent(next);
      }
      setSeeking(false);
      if (video && !video.paused) scheduleHide();
    }
  }

  function onSeekEnd(event: ReactPointerEvent<HTMLInputElement> | ReactFocusEvent<HTMLInputElement>) {
    const video = videoRef.current;
    const next = Number((event.target as HTMLInputElement).value);
    if (video && Number.isFinite(next)) {
      video.currentTime = next;
      setCurrent(next);
      setSeekValue(next);
    }
    pointerSeekingRef.current = false;
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
          cacheKey={post._id}
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
              muted={!active || !soundEnabled}
              controls={false}
              preload={shouldWarm ? "auto" : "none"}
              onLoadedData={onLoad}
              onCanPlay={onLoad}
              onError={() => {
                lockedSrcRef.current = null;
                loadedSrcRef.current = null;
                setExpiresUnix(Math.floor(Date.now() / 1000) + 60 * 60);
                onError();
              }}
            />
          )}
        </MediaLoadFrame>
      ) : displaySrc ? (
        <MediaLoadFrame
          kind="image"
          src={displaySrc}
          cacheKey={post._id}
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
          <MediaLoadWave />
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
                onPointerCancel={onSeekEnd}
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
  followBusy,
  showFollow,
  isFollowing,
  localComments,
  localSaves,
  localShares,
  onLike,
  onSave,
  onShare,
  onOpenComments,
  onOpenProfile,
  onToggleFollow,
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
  followBusy: boolean;
  showFollow: boolean;
  isFollowing: boolean;
  localComments: number;
  localSaves: number;
  localShares: number;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onOpenComments: () => void;
  onOpenProfile?: (username: string) => void;
  onToggleFollow: () => void;
}) {
  const saved = Boolean(post.savedByViewer);

  return (
    <div className="profile-post-rail">
      <div className="profile-post-rail-avatar-wrap">
        <StudioProfileAvatar
          as="button"
          className="profile-post-rail-avatar"
          size="sm"
          src={avatarUrl}
          displayName={displayName}
          firstName={firstName}
          lastName={lastName}
          onClick={(event) => {
            event.stopPropagation();
            if (username) onOpenProfile?.(username);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={username ? `Open @${username}` : "Open profile"}
        />
        {showFollow ? (
          <button
            type="button"
            className={`profile-post-rail-follow${isFollowing ? " is-following" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFollow();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={followBusy}
            aria-label={
              isFollowing
                ? `Unfollow @${username}`
                : `Follow @${username}`
            }
          >
            {followBusy ? (
              <Loader2 className="profile-post-rail-spin" aria-hidden="true" />
            ) : isFollowing ? (
              <Check aria-hidden="true" strokeWidth={3} />
            ) : (
              <Plus aria-hidden="true" strokeWidth={3} />
            )}
          </button>
        ) : null}
      </div>
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
  mode = "forYou",
  onModeChange,
  tabActive = true,
}: {
  username?: string;
  postId: Id<"profilePosts"> | string;
  onOpenProfile?: (username: string) => void;
  mode?: FeedMode;
  onModeChange?: (mode: FeedMode) => void;
  /** False while another studio tab is focused — pause playback, keep state. */
  tabActive?: boolean;
}) {
  const auth = useConvexAuth();
  const { isMobile } = useMobileLayout();
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const feedMode: FeedMode = mode === "following" ? "following" : "forYou";
  const seedPostId =
    !postId || String(postId) === "home"
      ? undefined
      : (postId as Id<"profilePosts">);
  const feed = useQuery(api.profiles.listFeed, {
    expiresUnix,
    limit: 28,
    // Seed pin only applies to For You; Following is pure follow graph.
    seedPostId: feedMode === "forYou" ? seedPostId : undefined,
    mode: feedMode,
  });
  const toggleLike = useMutation(api.profiles.toggleLike);
  const toggleSave = useMutation(api.profiles.toggleSave);
  const recordShare = useMutation(api.profiles.recordShare);
  const recordPostView = useMutation(api.profiles.recordPostView);
  const followProfile = useMutation(api.profiles.follow);
  const unfollowProfile = useMutation(api.profiles.unfollow);

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
  /** Optimistic follow state keyed by profileId — flips all slides from that author. */
  const [localFollows, setLocalFollows] = useState<Record<string, boolean>>({});
  const [followBusyProfileId, setFollowBusyProfileId] = useState<string | null>(null);
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
      const follow = localFollows[post.profileId];
      return {
        ...post,
        ...(like
          ? { likedByViewer: like.liked, likeCount: like.likeCount }
          : null),
        ...(save
          ? { savedByViewer: save.saved, saveCount: save.saveCount }
          : null),
        ...(follow != null ? { isFollowing: follow } : null),
        shareCount: localShares[post._id] ?? post.shareCount ?? 0,
      };
    });
  }, [feed, localLikes, localSaves, localShares, localFollows]);

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

  // Mode changes from the tab chooser — reseed to the top of the new feed.
  const prevFeedModeRef = useRef(feedMode);
  useEffect(() => {
    if (prevFeedModeRef.current === feedMode) return;
    prevFeedModeRef.current = feedMode;
    seededRef.current = false;
    lastFeedIndexRef.current = 0;
    activePostIdRef.current = null;
    setActivePostId(null);
    setAxis("y");
    setCommentsOpen(false);
  }, [feedMode]);
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

  // Prefetch 3 posts each way (up/down feed + left/right author). Offset-1
  // stays the animated prev/next; further offsets mount as idle warm slides.
  const feedPrevList = collectAxisNeighbors(resolvedFeed, feedIndex, -1, 3);
  const feedNextList = collectAxisNeighbors(resolvedFeed, feedIndex, 1, 3);
  const authorPrevList = collectAxisNeighbors(authorPosts, authorIndex, -1, 3);
  const authorNextList = collectAxisNeighbors(authorPosts, authorIndex, 1, 3);

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
      ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}`
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
      const feedLen = feedLenRef.current;
      const authorLen = authorLenRef.current;
      const canMove =
        nextAxis === "y"
          ? feedIdx >= 0 && feedLen > 1
          : authorIdx >= 0 && authorLen > 1;

      if (isMobile) setCommentsOpen(false);

      if (!canMove) {
        animatingRef.current = true;
        setAnimating(true);
        setTrackTransform(0, 0, true);
        window.setTimeout(() => resetTrack(), SLIDE_FALLBACK_MS);
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
            ? resolvedFeedRef.current[
                wrapIndex(feedIndexRef.current + pending.delta, resolvedFeedRef.current.length)
              ]
            : authorPostsRef.current[
                wrapIndex(authorIndexRef.current + pending.delta, authorPostsRef.current.length)
              ];
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
          lastFeedIndexRef.current = wrapIndex(
            feedIndexRef.current + pending.delta,
            resolvedFeedRef.current.length,
          );
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
      }, SLIDE_FALLBACK_MS);

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
      const target = event.target as HTMLElement | null;
      if (
        target?.closest?.(
          "input, textarea, select, button, [data-video-control], [contenteditable='true']",
        )
      ) {
        return;
      }
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
    const rootNode = rootRef.current;
    if (!rootNode || !tabActive) return undefined;
    const node: HTMLDivElement = rootNode;
    let wheelLockUntil = 0;
    function onWheel(event: WheelEvent) {
      const path = event.composedPath();
      if (!path.includes(node)) return;
      // Shift+wheel → horizontal author axis (desktop trackpads may already
      // emit deltaX; treat shift as an explicit horizontal intent).
      const deltaX = normalizedWheelDelta(event.deltaX, event.deltaMode);
      const deltaY = normalizedWheelDelta(event.deltaY, event.deltaMode);
      const shiftHorizontal = event.shiftKey && Math.abs(deltaY) >= Math.abs(deltaX);
      const horizontal = shiftHorizontal || Math.abs(deltaY) < Math.abs(deltaX);
      if (horizontal) {
        const delta = shiftHorizontal ? deltaY : deltaX;
        if (Math.abs(delta) < 8) return;
        event.preventDefault();
        if (animatingRef.current || Date.now() < wheelLockUntil) return;
        wheelLockUntil = Date.now() + SLIDE_FALLBACK_MS;
        commitSlide("x", delta > 0 ? 1 : -1);
        return;
      }
      if (Math.abs(deltaY) < 8) return;
      event.preventDefault();
      if (animatingRef.current || Date.now() < wheelLockUntil) return;
      wheelLockUntil = Date.now() + SLIDE_FALLBACK_MS;
      commitSlide("y", deltaY > 0 ? 1 : -1);
    }
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
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

  function cancelPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerRef.current;
    if (!start || start.id !== event.pointerId) return;
    const captured = Boolean(start.captured);
    pointerRef.current = null;
    if (captured) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    setTrackTransform(0, 0, false);
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
      // Tap timing must use wall clock; not render-time state.
      // eslint-disable-next-line react-hooks/purity -- pointer-up gesture clock
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
    window.setTimeout(() => resetTrack(), SLIDE_FALLBACK_MS);
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

  function switchFeedMode(next: FeedMode) {
    if (next === feedMode) return;
    onModeChange?.(next);
  }

  async function handleFollowToggle(post: SlidePost) {
    const profileId = post.profileId;
    if (!profileId) return;
    if (!auth.isAuthenticated) {
      window.location.href = `/?next=${encodeURIComponent("/")}`;
      return;
    }
    const currentlyFollowing =
      localFollows[profileId] ?? Boolean(post.isFollowing);
    // Optimistic: flip every slide by this author immediately.
    setLocalFollows((prev) => ({ ...prev, [profileId]: !currentlyFollowing }));
    setFollowBusyProfileId(profileId);
    try {
      if (currentlyFollowing) {
        await unfollowProfile({ profileId });
      } else {
        await followProfile({ profileId });
      }
    } catch (error) {
      // Roll back on failure.
      setLocalFollows((prev) => ({ ...prev, [profileId]: currentlyFollowing }));
      console.error(friendlyConvexError(error, "Could not update follow"));
    } finally {
      setFollowBusyProfileId(null);
    }
  }

  if (feed === undefined) {
    return (
      <div className="profile-post-viewer is-loading" aria-busy="true">
        <div className="profile-post-viewer-blur" aria-hidden="true" />
        <MediaLoadWave className="profile-post-viewer-load-wave" />
      </div>
    );
  }

  if (!activePost || !resolvedFeed.length) {
    return (
      <div className="profile-post-viewer is-empty">
        <div className="profile-post-viewer-blur" aria-hidden="true" />
        {feedMode === "following" ? (
          <p>Follow people to fill this feed</p>
        ) : (
          <p>No posts in feed yet</p>
        )}
        {feedMode === "following" && onModeChange ? (
          <button type="button" onClick={() => switchFeedMode("forYou")}>
            Browse For You
          </button>
        ) : authorUsername && onOpenProfile ? (
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
          profileId: profileMeta?.profileId,
          isFollowing: profileMeta
            ? (localFollows[profileMeta.profileId] ?? profileMeta.isFollowing)
            : undefined,
          isOwner: profileMeta?.isOwner,
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
      profileId: profileMeta?.profileId,
      isFollowing: profileMeta
        ? (localFollows[profileMeta.profileId] ?? profileMeta.isFollowing)
        : undefined,
      isOwner: profileMeta?.isOwner,
    };
  };

  // Keep one mounted media node per post so scrolling roles (current↔next)
  // don't remount and flash the loader. Only split when the same post is both
  // prev and next (2-item loop).
  const slidePool: Array<{ key: string; post: SlidePost; role: SlideRole }> = (() => {
    const slots = new Map<string, { key: string; post: SlidePost; role: SlideRole }>();

    const upsert = (post: SlidePost | null, role: SlideRole, forceKey?: string) => {
      if (!post) return;
      const key = forceKey ?? post._id;
      const existing = slots.get(key);
      if (!existing || roleRank(role) > roleRank(existing.role)) {
        slots.set(key, { key, post, role });
      }
    };

    upsert(activeSlidePost, "current");

    const feedPrev = withProfile(feedPrevList[0] ?? null);
    const feedNext = withProfile(feedNextList[0] ?? null);
    const authorPrev = withProfile(authorPrevList[0] ?? null);
    const authorNext = withProfile(authorNextList[0] ?? null);

    if (axis === "y" && feedPrev && feedNext && feedPrev._id === feedNext._id) {
      upsert(feedPrev, "prev", `${feedPrev._id}:prev`);
      upsert(feedNext, "next", `${feedNext._id}:next`);
    } else {
      upsert(feedPrev, axis === "y" ? "prev" : "idle");
      upsert(feedNext, axis === "y" ? "next" : "idle");
    }

    if (axis === "x" && authorPrev && authorNext && authorPrev._id === authorNext._id) {
      upsert(authorPrev, "prev", `${authorPrev._id}:prev`);
      upsert(authorNext, "next", `${authorNext._id}:next`);
    } else {
      upsert(authorPrev, axis === "x" ? "prev" : "idle");
      upsert(authorNext, axis === "x" ? "next" : "idle");
    }

    // Warm offsets 2–3 without creating duplicate mounts.
    for (let i = 1; i < feedPrevList.length; i += 1) {
      upsert(withProfile(feedPrevList[i] ?? null), "idle");
    }
    for (let i = 1; i < feedNextList.length; i += 1) {
      upsert(withProfile(feedNextList[i] ?? null), "idle");
    }
    for (let i = 1; i < authorPrevList.length; i += 1) {
      upsert(withProfile(authorPrevList[i] ?? null), "idle");
    }
    for (let i = 1; i < authorNextList.length; i += 1) {
      upsert(withProfile(authorNextList[i] ?? null), "idle");
    }

    return [...slots.values()];
  })();

  return (
    <div className="profile-post-viewer-layout">
      <div
        ref={rootRef}
        className="profile-post-viewer is-feed"
        aria-label="Studio feed"
        onPointerDown={tabActive ? onPointerDown : undefined}
        onPointerMove={tabActive ? onPointerMove : undefined}
        onPointerUp={tabActive ? finishPointer : undefined}
        onPointerCancel={tabActive ? cancelPointer : undefined}
      >
        <div className="profile-post-viewer-blur" aria-hidden="true" />
        <div className="profile-post-track" ref={trackRef}>
          {slidePool.map(({ key, post, role }) => {
            const isInteractiveSlide = tabActive && role === "current";
            const postUsername = post.username || authorUsername;
            const postComments = localComments[post._id] ?? post.commentCount ?? 0;
            const postSaves =
              localSaves[post._id]?.saveCount ?? post.saveCount ?? 0;
            const postShares = localShares[post._id] ?? post.shareCount ?? 0;
            return (
              <article
                key={key}
                className={`profile-post-slide is-${role} is-${axis}`}
                aria-hidden={!isInteractiveSlide}
                inert={!isInteractiveSlide}
              >
                <div className="profile-post-slide-glass" aria-hidden="true" />
                <FeedMedia
                  post={post}
                  active={tabActive && role === "current"}
                  preload={tabActive}
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
                  followBusy={
                    Boolean(post.profileId) && followBusyProfileId === post.profileId
                  }
                  showFollow={Boolean(post.profileId) && !post.isOwner}
                  isFollowing={Boolean(
                    post.profileId
                      ? (localFollows[post.profileId] ?? post.isFollowing)
                      : post.isFollowing,
                  )}
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
                  onToggleFollow={() => void handleFollowToggle(post)}
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

        {!isMobile && tabActive ? (
          <>
            <div className="profile-post-nav-rail is-vertical" aria-label="Feed navigation">
              <button
                type="button"
                className="profile-post-nav-btn"
                aria-label="Previous post"
                disabled={resolvedFeed.length <= 1 || animating}
                onClick={() => commitSlide("y", -1)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ChevronUp aria-hidden="true" strokeWidth={2.25} />
              </button>
              <button
                type="button"
                className="profile-post-nav-btn"
                aria-label="Next post"
                disabled={resolvedFeed.length <= 1 || animating}
                onClick={() => commitSlide("y", 1)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ChevronDown aria-hidden="true" strokeWidth={2.25} />
              </button>
            </div>
            <div className="profile-post-nav-rail is-horizontal" aria-label="Author posts navigation">
              <button
                type="button"
                className="profile-post-nav-btn"
                aria-label="Previous author post"
                disabled={authorIndex < 0 || authorPosts.length <= 1 || animating}
                onClick={() => commitSlide("x", -1)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ChevronLeft aria-hidden="true" strokeWidth={2.25} />
              </button>
              <button
                type="button"
                className="profile-post-nav-btn"
                aria-label="Next author post"
                disabled={authorIndex < 0 || authorPosts.length <= 1 || animating}
                onClick={() => commitSlide("x", 1)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ChevronRight aria-hidden="true" strokeWidth={2.25} />
              </button>
            </div>
          </>
        ) : null}
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
