"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  Bookmark,
  Eye,
  Globe,
  Forward,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  Loader2,
  Mail,
  Phone,
  Play,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { profileNameInitials } from "@/studio/lib/profileAvatar";
import { LogoLoader } from "./logo-loader";
import { MediaLoadFrame } from "./media-load-frame";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import { CaptionChipText } from "./CaptionChipText";
import "./public-profile.css";
import "./post-compose-tab.css";

type PublicPost = {
  _id: Id<"profilePosts">;
  assetId: Id<"assets">;
  kind: "image" | "video";
  name: string;
  caption?: string;
  hashtags?: Array<{ tag: string; displayTag: string }>;
  mentions?: Array<{
    username: string;
    profileId: Id<"profiles">;
    displayName?: string;
    avatarUrl?: string;
  }>;
  likeCount: number;
  viewCount: number;
  publishedAt: number;
  thumbnailUrl?: string;
  mediaUrl?: string;
  likedByViewer: boolean;
  savedByViewer?: boolean;
  username?: string;
};

type ProfileTab = "posts" | "saved" | "liked" | "shared";

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

const OWNER_TABS: Array<{ id: ProfileTab; label: string; icon: typeof LayoutGrid }> = [
  { id: "posts", label: "Posts", icon: LayoutGrid },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "liked", label: "Liked", icon: Heart },
  { id: "shared", label: "Shared", icon: Forward },
];

export function PublicProfileView({
  username,
  embedded = false,
  ownerName,
  onOpenPost,
}: {
  username: string;
  embedded?: boolean;
  ownerName?: {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
  } | null;
  onOpenPost?: (post: PublicPost) => void;
}) {
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const auth = useConvexAuth();
  const profile = useQuery(api.profiles.getPublicByUsername, {
    username,
    expiresUnix,
  });
  const isOwner = Boolean(profile?.isOwner);
  const activeTab: ProfileTab = isOwner ? tab : "posts";

  const posts = useQuery(
    api.profiles.listPublicPosts,
    profile && activeTab === "posts" ? { username, expiresUnix, limit: 36 } : "skip",
  );
  const collection = useQuery(
    api.profiles.listMyCollection,
    profile && isOwner && activeTab !== "posts"
      ? { kind: activeTab, expiresUnix, limit: 36 }
      : "skip",
  );
  const follow = useMutation(api.profiles.follow);
  const unfollow = useMutation(api.profiles.unfollow);

  const [followBusy, setFollowBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const resolvedPosts = useMemo(() => {
    if (activeTab === "posts") return posts ?? [];
    return collection ?? [];
  }, [activeTab, collection, posts]);

  const gridLoading =
    activeTab === "posts" ? posts === undefined : collection === undefined;

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

  function handleOpenPost(post: PublicPost) {
    if (onOpenPost) {
      onOpenPost(post);
      return;
    }
    window.location.href = `/?feed=${encodeURIComponent(post._id)}`;
  }

  const title =
    profile?.displayName?.trim() ||
    [ownerName?.firstName, ownerName?.lastName].filter(Boolean).join(" ").trim() ||
    ownerName?.name?.trim() ||
    (profile ? `@${profile.username}` : username);
  const initials = profileNameInitials({
    firstName: ownerName?.firstName,
    lastName: ownerName?.lastName,
    name: ownerName?.name,
    displayName: profile?.displayName,
  });

  const emptyCopy =
    activeTab === "saved"
      ? "No saved posts yet"
      : activeTab === "liked"
        ? "No liked posts yet"
        : activeTab === "shared"
          ? "No shared posts yet"
          : "No posts yet";

  if (profile === undefined) {
    return (
      <div className={`public-profile-shell${embedded ? " is-embedded" : ""}`}>
        <div className="public-profile-blur" aria-hidden="true" />
        <div className="public-profile-loading">
          <LogoLoader size="lg" />
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
          <p>This username isn’t public or doesn’t exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`public-profile-shell${embedded ? " is-embedded" : ""}`}>
      <div className="public-profile-blur" aria-hidden="true" />
      <main className="public-profile-main">
        <section className="public-profile-hero">
          <StudioProfileAvatar
            className="public-profile-avatar"
            size="lg"
            src={profile.avatarUrl}
            initials={initials}
            displayName={profile.displayName}
            firstName={ownerName?.firstName}
            lastName={ownerName?.lastName}
            name={ownerName?.name}
          />

          <div className="public-profile-identity">
            <div className="public-profile-title-row">
              <div className="public-profile-titles">
                <h1 className="public-profile-name">{title}</h1>
                <p className="public-profile-handle">@{profile.username}</p>
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
            </div>

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

            {profile.bio ? <p className="public-profile-bio">{profile.bio}</p> : null}

            {profile.contactLinks.length ? (
              <ul className="public-profile-links">
                {profile.contactLinks.map((link) => (
                  <li key={`${link.type}-${link.label}-${link.value}`}>
                    <a href={link.href} target="_blank" rel="noreferrer">
                      <ContactIcon type={link.type} />
                      <span>{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {actionError ? <p className="public-profile-error">{actionError}</p> : null}
          </div>
        </section>

        {isOwner ? (
          <div className="public-profile-tabs-wrap">
            <div className="public-profile-posts-rule" role="separator" />
            <nav className="public-profile-tabs" aria-label="Your posts">
              {OWNER_TABS.map((item) => {
                const Icon = item.icon;
                const selected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`public-profile-tab${selected ? " is-active" : ""}`}
                    aria-pressed={selected}
                    onClick={() => setTab(item.id)}
                  >
                    <Icon aria-hidden="true" strokeWidth={2.15} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="public-profile-posts-rule" role="separator" />
          </div>
        ) : (
          <div className="public-profile-posts-rule" role="separator" />
        )}

        <section
          className="public-profile-grid-section"
          aria-label={
            activeTab === "posts"
              ? "Public posts"
              : activeTab === "saved"
                ? "Saved posts"
                : activeTab === "liked"
                  ? "Liked posts"
                  : "Shared posts"
          }
        >
          {gridLoading ? (
            <div className="public-profile-loading is-inline">
              <LogoLoader size="md" />
            </div>
          ) : resolvedPosts.length === 0 ? (
            <div className="public-profile-empty-posts">
              <span>{emptyCopy}</span>
            </div>
          ) : (
            <div className="public-profile-grid">
              {resolvedPosts.map((post) => (
                <button
                  key={post._id}
                  type="button"
                  className="public-profile-tile"
                  onClick={() => handleOpenPost(post)}
                  aria-label={post.caption || post.name}
                >
                  {(() => {
                    const imageThumb =
                      post.thumbnailUrl &&
                      !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(post.thumbnailUrl)
                        ? post.thumbnailUrl
                        : undefined;
                    const videoSrc =
                      post.kind === "video"
                        ? post.mediaUrl ||
                          (post.thumbnailUrl &&
                          /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(post.thumbnailUrl)
                            ? post.thumbnailUrl
                            : undefined)
                        : undefined;
                    if (imageThumb) {
                      return (
                        <MediaLoadFrame kind="image" src={imageThumb} ratio="fill" loaderSize="md">
                          {({ onLoad, onError }) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageThumb}
                              alt=""
                              loading="lazy"
                              onLoad={onLoad}
                              onError={onError}
                            />
                          )}
                        </MediaLoadFrame>
                      );
                    }
                    if (videoSrc) {
                      return (
                        <MediaLoadFrame kind="video" src={videoSrc} ratio="fill" loaderSize="md">
                          {({ onLoad, onError }) => (
                            <video
                              className="public-profile-tile-video"
                              src={videoSrc}
                              muted
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={onLoad}
                              onLoadedData={onLoad}
                              onError={onError}
                            />
                          )}
                        </MediaLoadFrame>
                      );
                    }
                    return (
                      <span className="public-profile-tile-fallback">
                        <LogoLoader size="sm" />
                        {post.kind === "video" ? "Video" : "Image"}
                      </span>
                    );
                  })()}
                  <span className="public-profile-tile-top" aria-hidden="true">
                    <span className="public-profile-tile-meta">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatCount(post.viewCount ?? 0)}
                    </span>
                    <span
                      className="public-profile-tile-kind"
                      title={post.kind === "video" ? "Video" : "Image"}
                    >
                      {post.kind === "video" ? (
                        <Play
                          className="public-profile-tile-kind-icon is-play"
                          strokeWidth={2.85}
                          aria-hidden="true"
                        />
                      ) : (
                        <ImageIcon className="public-profile-tile-kind-icon" />
                      )}
                    </span>
                  </span>
                  <span className="public-profile-tile-caption">
                    <span className="public-profile-tile-username">
                      {post.username || profile?.username || username}
                    </span>
                    {post.caption?.trim() ? (
                      <span className="public-profile-tile-description">
                        <CaptionChipText
                          caption={post.caption}
                          mentions={post.mentions}
                          author={{
                            username: post.username || profile?.username || username,
                            avatarUrl: profile?.avatarUrl,
                            displayName: profile?.displayName,
                          }}
                        />
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
