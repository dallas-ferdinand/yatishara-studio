"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  ExternalLink,
  Globe,
  Heart,
  Link2,
  Loader2,
  Mail,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { profileAvatarStyle, profileNameInitials } from "@/studio/lib/profileAvatar";
import "./public-profile.css";

type PublicPost = {
  _id: Id<"profilePosts">;
  assetId: Id<"assets">;
  kind: "image" | "video";
  name: string;
  caption?: string;
  likeCount: number;
  publishedAt: number;
  thumbnailUrl?: string;
  mediaUrl?: string;
  likedByViewer: boolean;
};

function ContactIcon({ type }: { type: string }) {
  if (type === "phone") return <Phone className="h-3.5 w-3.5" aria-hidden="true" />;
  if (type === "email") return <Mail className="h-3.5 w-3.5" aria-hidden="true" />;
  if (type === "other") return <Link2 className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Globe className="h-3.5 w-3.5" aria-hidden="true" />;
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

export function PublicProfileView({
  username,
  embedded = false,
  ownerName,
}: {
  username: string;
  embedded?: boolean;
  ownerName?: {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
  } | null;
}) {
  const expiresUnix = useMemo(() => Math.floor(Date.now() / 1000) + 60 * 60, []);
  const auth = useConvexAuth();
  const profile = useQuery(api.profiles.getPublicByUsername, {
    username,
    expiresUnix,
  });
  const posts = useQuery(
    api.profiles.listPublicPosts,
    profile ? { username, expiresUnix, limit: 60 } : "skip",
  );
  const follow = useMutation(api.profiles.follow);
  const unfollow = useMutation(api.profiles.unfollow);
  const toggleLike = useMutation(api.profiles.toggleLike);

  const [followBusy, setFollowBusy] = useState(false);
  const [likeBusyId, setLikeBusyId] = useState<Id<"profilePosts"> | null>(null);
  const [actionError, setActionError] = useState("");
  const [activePost, setActivePost] = useState<PublicPost | null>(null);
  const [localLikes, setLocalLikes] = useState<
    Record<string, { liked: boolean; likeCount: number }>
  >({});

  const resolvedPosts = useMemo(() => {
    return (posts ?? []).map((post) => {
      const local = localLikes[post._id];
      return local
        ? { ...post, likedByViewer: local.liked, likeCount: local.likeCount }
        : post;
    });
  }, [posts, localLikes]);

  async function handleFollowToggle() {
    if (!profile) return;
    if (!auth.isAuthenticated) {
      window.location.href = `/?next=${encodeURIComponent(`/u/${username}`)}`;
      return;
    }
    if (profile.isOwner) return;
    setFollowBusy(true);
    setActionError("");
    try {
      if (profile.isFollowing) {
        await unfollow({ profileId: profile._id });
      } else {
        await follow({ profileId: profile._id });
      }
    } catch (error) {
      setActionError(friendlyConvexError(error, "Could not update follow"));
    } finally {
      setFollowBusy(false);
    }
  }

  async function handleLike(post: PublicPost) {
    if (!auth.isAuthenticated) {
      window.location.href = `/?next=${encodeURIComponent(`/u/${username}`)}`;
      return;
    }
    setLikeBusyId(post._id);
    setActionError("");
    try {
      const result = await toggleLike({ postId: post._id });
      setLocalLikes((current) => ({
        ...current,
        [post._id]: { liked: result.liked, likeCount: result.likeCount },
      }));
      setActivePost((current) =>
        current && current._id === post._id
          ? { ...current, likedByViewer: result.liked, likeCount: result.likeCount }
          : current,
      );
    } catch (error) {
      setActionError(friendlyConvexError(error, "Could not like post"));
    } finally {
      setLikeBusyId(null);
    }
  }

  if (profile === undefined) {
    return (
      <div className={`public-profile-shell${embedded ? " is-embedded" : ""}`}>
        <div className="public-profile-blur" aria-hidden="true" />
        <div className="public-profile-loading">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading profile…</span>
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className={`public-profile-shell${embedded ? " is-embedded" : ""}`}>
        <div className="public-profile-blur" aria-hidden="true" />
        <div className="public-profile-empty">
          <UserRound className="h-8 w-8" aria-hidden="true" />
          <h1>Profile not found</h1>
          <p>This username is private or doesn’t exist.</p>
        </div>
      </div>
    );
  }

  const title = profile.displayName || `@${profile.username}`;
  const initials = profileNameInitials(
    profile.isOwner && ownerName
      ? {
          firstName: ownerName.firstName,
          lastName: ownerName.lastName,
          name: ownerName.name,
          displayName: profile.displayName,
        }
      : { displayName: profile.displayName },
  );
  const avatarStyle = profileAvatarStyle(initials);

  return (
    <div className={`public-profile-shell${embedded ? " is-embedded" : ""}`}>
      <div className="public-profile-blur" aria-hidden="true" />
      <main className="public-profile-main">
        <section className="public-profile-hero">
          <div className="public-profile-avatar" style={avatarStyle}>
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <h1 className="public-profile-name">{title}</h1>
          <p className="public-profile-handle">@{profile.username}</p>
          {profile.bio ? <p className="public-profile-bio">{profile.bio}</p> : null}

          <div className="public-profile-stats" aria-label="Profile stats">
            <div>
              <strong>{formatCount(profile.postCount)}</strong>
              <span>posts</span>
            </div>
            <div>
              <strong>{formatCount(profile.followerCount)}</strong>
              <span>followers</span>
            </div>
            <div>
              <strong>{formatCount(profile.followingCount)}</strong>
              <span>following</span>
            </div>
          </div>

          {!profile.isOwner ? (
            <button
              type="button"
              className={`public-profile-follow${profile.isFollowing ? " is-following" : ""}`}
              onClick={() => void handleFollowToggle()}
              disabled={followBusy}
            >
              {followBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {profile.isFollowing ? "Following" : "Follow"}
            </button>
          ) : null}

          {profile.contactLinks.length ? (
            <ul className="public-profile-links">
              {profile.contactLinks.map((link) => (
                <li key={`${link.type}-${link.label}-${link.value}`}>
                  <a href={link.href} target="_blank" rel="noreferrer">
                    <ContactIcon type={link.type} />
                    <span>{link.label}</span>
                    <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          {actionError ? <p className="public-profile-error">{actionError}</p> : null}
        </section>

        <section className="public-profile-grid-section" aria-label="Public posts">
          {posts === undefined ? (
            <div className="public-profile-loading is-inline">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Loading posts…</span>
            </div>
          ) : resolvedPosts.length === 0 ? (
            <p className="public-profile-empty-posts">No public posts yet.</p>
          ) : (
            <div className="public-profile-grid">
              {resolvedPosts.map((post) => (
                <button
                  key={post._id}
                  type="button"
                  className="public-profile-tile"
                  onClick={() => setActivePost(post)}
                >
                  {post.thumbnailUrl || post.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.thumbnailUrl || post.mediaUrl}
                      alt={post.caption || post.name}
                      loading="lazy"
                    />
                  ) : (
                    <span className="public-profile-tile-fallback">
                      {post.kind === "video" ? "Video" : "Image"}
                    </span>
                  )}
                  <span className="public-profile-tile-meta">
                    <Heart
                      className={`h-3.5 w-3.5${post.likedByViewer ? " is-liked" : ""}`}
                      aria-hidden="true"
                    />
                    {formatCount(post.likeCount)}
                    {post.kind === "video" ? <span className="public-profile-tile-kind">Video</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      {activePost ? (
        <div
          className="public-profile-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={activePost.caption || activePost.name}
          onClick={() => setActivePost(null)}
        >
          <button
            type="button"
            className="public-profile-lightbox-close"
            aria-label="Close"
            onClick={() => setActivePost(null)}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div
            className="public-profile-lightbox-body"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="public-profile-lightbox-media">
              {activePost.kind === "video" && activePost.mediaUrl ? (
                <video src={activePost.mediaUrl} controls playsInline poster={activePost.thumbnailUrl} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activePost.mediaUrl || activePost.thumbnailUrl}
                  alt={activePost.caption || activePost.name}
                />
              )}
            </div>
            <div className="public-profile-lightbox-footer">
              {activePost.caption ? <p>{activePost.caption}</p> : null}
              <button
                type="button"
                className={`public-profile-like${activePost.likedByViewer ? " is-liked" : ""}`}
                onClick={() => void handleLike(activePost)}
                disabled={likeBusyId === activePost._id}
              >
                {likeBusyId === activePost._id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Heart className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{formatCount(activePost.likeCount)}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
