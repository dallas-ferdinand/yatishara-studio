import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getOptionalUser } from "./lib/auth";
import {
  assetThumbnailPath,
  signBunnyCdnUrls,
  signBunnyFullUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  forYouCandidateCap,
  scoreFeedPost,
  type FeedMode,
} from "./lib/feedRanking";
import {
  applyPostAffinity,
  clearPostHashtags,
  clearPostMentions,
  loadCreatorConsistencyForLinks,
  loadPostHashtagRefs,
  loadPostMentionRefs,
  loadViewerAffinityMaps,
  syncPostHashtags,
  syncPostMentions,
} from "./lib/hashtagOps";
import {
  extractHashtagsFromCaption,
  extractKeywordsFromCaption,
  extractMentionsFromCaption,
  normalizeHashtagList,
  normalizeKeywordList,
} from "./lib/hashtagNormalize";
import {
  contactHref,
  sanitizeBio,
  sanitizeContactLinks,
  sanitizeDisplayName,
  validateUsername,
  type ContactLinkInput,
} from "./lib/profileIdentity";

const hashtagChipValidator = v.object({
  tag: v.string(),
  displayTag: v.string(),
});

const mentionChipValidator = v.object({
  username: v.string(),
  profileId: v.id("profiles"),
  displayName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
});

const contactLinkValidator = v.object({
  type: v.union(
    v.literal("website"),
    v.literal("phone"),
    v.literal("email"),
    v.literal("other"),
  ),
  label: v.string(),
  value: v.string(),
});

const publicContactLinkReturn = v.object({
  type: contactLinkValidator.fields.type,
  label: v.string(),
  value: v.string(),
  href: v.string(),
});

const myProfileReturn = v.union(
  v.null(),
  v.object({
    _id: v.id("profiles"),
    username: v.string(),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarAssetId: v.optional(v.id("assets")),
    avatarUrl: v.optional(v.string()),
    contactLinks: v.array(contactLinkValidator),
    isPublic: v.boolean(),
    followerCount: v.number(),
    followingCount: v.number(),
    postCount: v.number(),
    publicUrlPath: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
);

const publicProfileReturn = v.union(
  v.null(),
  v.object({
    _id: v.id("profiles"),
    username: v.string(),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    contactLinks: v.array(publicContactLinkReturn),
    followerCount: v.number(),
    followingCount: v.number(),
    postCount: v.number(),
    isOwner: v.boolean(),
    isFollowing: v.boolean(),
    viewerAuthenticated: v.boolean(),
  }),
);

const publicPostReturn = v.object({
  _id: v.id("profilePosts"),
  assetId: v.id("assets"),
  kind: v.union(v.literal("image"), v.literal("video")),
  name: v.string(),
  caption: v.optional(v.string()),
  keywords: v.optional(v.array(v.string())),
  hashtags: v.array(hashtagChipValidator),
  mentions: v.array(mentionChipValidator),
  likeCount: v.number(),
  viewCount: v.number(),
  commentCount: v.number(),
  saveCount: v.number(),
  shareCount: v.number(),
  publishedAt: v.number(),
  thumbnailUrl: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  likedByViewer: v.boolean(),
  savedByViewer: v.boolean(),
  username: v.string(),
});

const feedPostReturn = v.object({
  _id: v.id("profilePosts"),
  assetId: v.id("assets"),
  profileId: v.id("profiles"),
  kind: v.union(v.literal("image"), v.literal("video")),
  name: v.string(),
  caption: v.optional(v.string()),
  keywords: v.optional(v.array(v.string())),
  hashtags: v.array(hashtagChipValidator),
  mentions: v.array(mentionChipValidator),
  likeCount: v.number(),
  viewCount: v.number(),
  commentCount: v.number(),
  saveCount: v.number(),
  shareCount: v.number(),
  publishedAt: v.number(),
  thumbnailUrl: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  likedByViewer: v.boolean(),
  savedByViewer: v.boolean(),
  username: v.string(),
  displayName: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  fromFollowing: v.boolean(),
  isFollowing: v.boolean(),
  isOwner: v.boolean(),
  score: v.number(),
});

type HydratedPublicPost = {
  _id: Id<"profilePosts">;
  assetId: Id<"assets">;
  kind: "image" | "video";
  name: string;
  caption?: string;
  keywords?: string[];
  hashtags: Array<{ tag: string; displayTag: string }>;
  mentions: Array<{
    username: string;
    profileId: Id<"profiles">;
    displayName?: string;
    avatarUrl?: string;
  }>;
  likeCount: number;
  viewCount: number;
  commentCount: number;
  saveCount: number;
  shareCount: number;
  publishedAt: number;
  thumbnailUrl?: string;
  mediaUrl?: string;
  likedByViewer: boolean;
  savedByViewer: boolean;
  username: string;
};

async function hydratePublicPosts(
  ctx: QueryCtx,
  posts: Doc<"profilePosts">[],
  expiresUnix: number,
  viewerId: Id<"users"> | null,
): Promise<HydratedPublicPost[]> {
  if (posts.length === 0) return [];
  const assets = await Promise.all(posts.map((post) => ctx.db.get("assets", post.assetId)));
  const profiles = await Promise.all(posts.map((post) => ctx.db.get("profiles", post.profileId)));
  const thumbPaths = assets.map((asset) => (asset ? assetThumbnailPath(asset) : undefined));
  /** Videos without a poster image still need a signed URL for grid <video> thumbs. */
  const videoPreviewPaths = assets.map((asset) => {
    if (!asset || asset.deletedAt || asset.kind !== "video" || !asset.bunnyPath) {
      return undefined;
    }
    if (assetThumbnailPath(asset)) return undefined;
    return asset.bunnyPath;
  });
  const likedFlags = viewerId
    ? await Promise.all(
        posts.map(async (post) => {
          const like = await ctx.db
            .query("profileLikes")
            .withIndex("by_user_and_post", (q) =>
              q.eq("userId", viewerId).eq("postId", post._id),
            )
            .unique();
          return Boolean(like);
        }),
      )
    : posts.map(() => false);
  const savedFlags = viewerId
    ? await Promise.all(
        posts.map(async (post) => {
          const save = await ctx.db
            .query("profileSaves")
            .withIndex("by_user_and_post", (q) =>
              q.eq("userId", viewerId).eq("postId", post._id),
            )
            .unique();
          return Boolean(save);
        }),
      )
    : posts.map(() => false);
  const [thumbs, videoUrls, hashtagRefs, mentionRefs] = await Promise.all([
    signBunnyCdnUrls(thumbPaths, expiresUnix, THUMB_TRANSFORM),
    signBunnyCdnUrls(videoPreviewPaths, expiresUnix),
    Promise.all(posts.map((post) => loadPostHashtagRefs(ctx, post._id))),
    Promise.all(posts.map((post) => loadPostMentionRefs(ctx, post._id))),
  ]);
  const results: HydratedPublicPost[] = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!;
    const asset = assets[i];
    const author = profiles[i];
    if (!asset || asset.deletedAt || (asset.kind !== "image" && asset.kind !== "video")) {
      continue;
    }
    if (!author?.username) continue;
    const thumbPath = thumbPaths[i];
    const videoPath = videoPreviewPaths[i];
    const tags = hashtagRefs[i] ?? [];
    const mentions = await hydrateMentionChips(
      ctx,
      mentionRefs[i] ?? [],
      expiresUnix,
    );
    results.push({
      _id: post._id,
      assetId: post.assetId,
      kind: asset.kind,
      name: asset.name,
      caption: post.caption,
      keywords: post.keywords?.length ? post.keywords : undefined,
      hashtags: tags.map((t) => ({ tag: t.tag, displayTag: t.displayTag })),
      mentions,
      likeCount: post.likeCount,
      viewCount: post.viewCount ?? 0,
      commentCount: post.commentCount ?? 0,
      saveCount: post.saveCount ?? 0,
      shareCount: post.shareCount ?? 0,
      publishedAt: post.publishedAt,
      thumbnailUrl: thumbPath ? thumbs.get(thumbPath) : undefined,
      mediaUrl: videoPath ? videoUrls.get(videoPath) : undefined,
      likedByViewer: likedFlags[i] ?? false,
      savedByViewer: savedFlags[i] ?? false,
      username: author.username,
    });
  }
  return results;
}

const profileCommentReturn = v.object({
  _id: v.id("profileComments"),
  postId: v.id("profilePosts"),
  body: v.string(),
  createdAt: v.number(),
  userId: v.id("users"),
  username: v.optional(v.string()),
  displayName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  isOwner: v.boolean(),
  isMine: v.boolean(),
});

const PUBLIC_URL_TTL_SECONDS = 60 * 60; // 1 hour signed CDN URLs

function publicUrlPath(username: string): string {
  return `/u/${username}`;
}

function withPublicLinks(links: ContactLinkInput[]) {
  return links.map((link) => ({
    ...link,
    href: contactHref(link),
  }));
}

async function signAvatarUrl(
  asset: Doc<"assets"> | null,
  expiresUnix: number,
): Promise<string | undefined> {
  if (!asset || asset.deletedAt || !asset.bunnyPath) return undefined;
  // Prefer thumbnail; fall back to bunnyPath so avatar images always resolve
  // (same pattern as feed author thumbs).
  const thumbPath = assetThumbnailPath(asset) ?? asset.bunnyPath;
  if (!thumbPath) return undefined;
  const signed = await signBunnyCdnUrls([thumbPath], expiresUnix, THUMB_TRANSFORM);
  return signed.get(thumbPath);
}

type HydratedMentionChip = {
  username: string;
  profileId: Id<"profiles">;
  displayName?: string;
  avatarUrl?: string;
};

/** Resolve display names + signed avatar URLs for post @mention chips. */
async function hydrateMentionChips(
  ctx: QueryCtx,
  mentions: Array<{ username: string; profileId: Id<"profiles"> }>,
  expiresUnix: number,
): Promise<HydratedMentionChip[]> {
  if (mentions.length === 0) return [];

  const uniqueIds = [...new Set(mentions.map((m) => m.profileId))];
  const profiles = await Promise.all(uniqueIds.map((id) => ctx.db.get("profiles", id)));
  const profileById = new Map<string, Doc<"profiles">>();
  for (let i = 0; i < uniqueIds.length; i++) {
    const profile = profiles[i];
    if (profile) profileById.set(uniqueIds[i]!, profile);
  }

  const avatarAssetIds = [
    ...new Set(
      [...profileById.values()]
        .map((p) => p.avatarAssetId)
        .filter((id): id is Id<"assets"> => Boolean(id)),
    ),
  ];
  const avatarAssets = await Promise.all(
    avatarAssetIds.map((id) => ctx.db.get("assets", id)),
  );
  const assetById = new Map<string, Doc<"assets"> | null>();
  for (let i = 0; i < avatarAssetIds.length; i++) {
    assetById.set(avatarAssetIds[i]!, avatarAssets[i] ?? null);
  }

  const thumbPaths = [
    ...new Set(
      [...assetById.values()]
        .map((asset) => {
          if (!asset || asset.deletedAt || !asset.bunnyPath) return undefined;
          return assetThumbnailPath(asset) ?? asset.bunnyPath;
        })
        .filter((path): path is string => Boolean(path)),
    ),
  ];
  const signed =
    thumbPaths.length > 0
      ? await signBunnyCdnUrls(thumbPaths, expiresUnix, THUMB_TRANSFORM)
      : new Map<string, string>();

  return mentions.map((m) => {
    const profile = profileById.get(m.profileId);
    const displayName = profile?.displayName?.trim() || undefined;
    let avatarUrl: string | undefined;
    if (profile?.avatarAssetId) {
      const asset = assetById.get(profile.avatarAssetId) ?? null;
      if (asset && !asset.deletedAt && asset.bunnyPath) {
        const thumbPath = assetThumbnailPath(asset) ?? asset.bunnyPath;
        avatarUrl = thumbPath ? signed.get(thumbPath) : undefined;
      }
    }
    return {
      username: m.username,
      profileId: m.profileId,
      displayName,
      avatarUrl,
    };
  });
}

async function requireOwnedAsset(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  assetId: Id<"assets">,
): Promise<Doc<"assets">> {
  const asset = await ctx.db.get("assets", assetId);
  if (!asset || asset.ownerId !== userId || asset.deletedAt) {
    throw new Error("Asset not found");
  }
  if (asset.kind !== "image" && asset.kind !== "video") {
    throw new Error("Only images and videos can be shared to your profile");
  }
  if (!asset.bunnyPath) {
    throw new Error("Asset is not ready to share yet");
  }
  return asset;
}

async function getProfileByUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function getActivePostByAsset(
  ctx: QueryCtx | MutationCtx,
  assetId: Id<"assets">,
): Promise<Doc<"profilePosts"> | null> {
  const post = await ctx.db
    .query("profilePosts")
    .withIndex("by_asset", (q) => q.eq("assetId", assetId))
    .unique();
  if (!post || post.unpublishedAt) return null;
  return post;
}

async function adjustProfileCounts(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  patch: Partial<{
    followerCount: number;
    followingCount: number;
    postCount: number;
  }>,
) {
  const profile = await ctx.db.get("profiles", profileId);
  if (!profile) return;
  await ctx.db.patch(profileId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export const getMine = authedQuery({
  args: {
    expiresUnix: v.optional(v.number()),
  },
  returns: myProfileReturn,
  handler: async (ctx, args) => {
    const profile = await getProfileByUser(ctx, ctx.user._id);
    if (!profile) return null;
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    let avatarUrl: string | undefined;
    if (profile.avatarAssetId) {
      const avatar = await ctx.db.get("assets", profile.avatarAssetId);
      avatarUrl = await signAvatarUrl(avatar, expiresUnix);
    }
    return {
      _id: profile._id,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarAssetId: profile.avatarAssetId,
      avatarUrl,
      contactLinks: profile.contactLinks,
      isPublic: profile.isPublic,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      postCount: profile.postCount,
      publicUrlPath: publicUrlPath(profile.username),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  },
});

export const checkUsernameAvailable = authedQuery({
  args: { username: v.string() },
  returns: v.object({
    available: v.boolean(),
    normalized: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    let normalized: string;
    try {
      normalized = validateUsername(args.username);
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : "Invalid username",
      };
    }
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (existing && existing.userId !== ctx.user._id) {
      return { available: false, normalized, reason: "Username is taken" };
    }
    return { available: true, normalized };
  },
});

export const claimUsername = authedMutation({
  args: {
    username: v.string(),
    displayName: v.optional(v.string()),
  },
  returns: v.object({
    profileId: v.id("profiles"),
    username: v.string(),
    publicUrlPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const existing = await getProfileByUser(ctx, ctx.user._id);
    if (existing) {
      throw new Error("You already claimed a username");
    }
    const username = validateUsername(args.username);
    const taken = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (taken) {
      throw new Error("Username is taken");
    }
    const now = Date.now();
    const fromAccount = [ctx.user.firstName, ctx.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const displayName =
      sanitizeDisplayName(args.displayName) ??
      (fromAccount || ctx.user.name?.trim() || undefined);
    const profileId = await ctx.db.insert("profiles", {
      userId: ctx.user._id,
      username,
      displayName,
      bio: undefined,
      avatarAssetId: undefined,
      contactLinks: [],
      isPublic: true,
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return {
      profileId,
      username,
      publicUrlPath: publicUrlPath(username),
    };
  },
});

export const updateMine = authedMutation({
  args: {
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    contactLinks: v.optional(v.array(contactLinkValidator)),
    avatarAssetId: v.optional(v.union(v.id("assets"), v.null())),
  },
  returns: v.object({
    profileId: v.id("profiles"),
    username: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile = await getProfileByUser(ctx, ctx.user._id);
    if (!profile) {
      throw new Error("Claim a username before editing your profile");
    }
    const patch: Partial<Doc<"profiles">> = { updatedAt: Date.now() };
    if (args.displayName !== undefined) {
      patch.displayName = sanitizeDisplayName(args.displayName);
    }
    if (args.bio !== undefined) {
      patch.bio = sanitizeBio(args.bio);
    }
    if (args.isPublic !== undefined) {
      patch.isPublic = args.isPublic;
    }
    if (args.contactLinks !== undefined) {
      patch.contactLinks = sanitizeContactLinks(args.contactLinks);
    }
    if (args.avatarAssetId !== undefined) {
      if (args.avatarAssetId === null) {
        patch.avatarAssetId = undefined;
      } else {
        const asset = await requireOwnedAsset(ctx, ctx.user._id, args.avatarAssetId);
        if (asset.kind !== "image") {
          throw new Error("Avatar must be an image");
        }
        patch.avatarAssetId = asset._id;
      }
    }
    await ctx.db.patch(profile._id, patch);
    return { profileId: profile._id, username: profile.username };
  },
});

export const changeUsername = authedMutation({
  args: {
    username: v.string(),
  },
  returns: v.object({
    profileId: v.id("profiles"),
    username: v.string(),
    publicUrlPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile = await getProfileByUser(ctx, ctx.user._id);
    if (!profile) {
      throw new Error("Claim a username before changing it");
    }
    const username = validateUsername(args.username);
    if (username === profile.username) {
      return {
        profileId: profile._id,
        username: profile.username,
        publicUrlPath: publicUrlPath(profile.username),
      };
    }
    const taken = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (taken && taken.userId !== ctx.user._id) {
      throw new Error("Username is taken");
    }
    await ctx.db.patch(profile._id, {
      username,
      updatedAt: Date.now(),
    });
    return {
      profileId: profile._id,
      username,
      publicUrlPath: publicUrlPath(username),
    };
  },
});

export const isAssetShared = authedQuery({
  args: { assetId: v.id("assets") },
  returns: v.object({
    shared: v.boolean(),
    postId: v.optional(v.id("profilePosts")),
    hasProfile: v.boolean(),
    username: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const profile = await getProfileByUser(ctx, ctx.user._id);
    if (!profile) {
      return { shared: false, hasProfile: false };
    }
    const post = await getActivePostByAsset(ctx, args.assetId);
    if (!post || post.ownerId !== ctx.user._id) {
      return {
        shared: false,
        hasProfile: true,
        username: profile.username,
      };
    }
    return {
      shared: true,
      postId: post._id,
      hasProfile: true,
      username: profile.username,
    };
  },
});

export const listMySharedAssetIds = authedQuery({
  args: {},
  returns: v.object({
    hasProfile: v.boolean(),
    username: v.optional(v.string()),
    assetIds: v.array(v.id("assets")),
  }),
  handler: async (ctx) => {
    const profile = await getProfileByUser(ctx, ctx.user._id);
    if (!profile) {
      return { hasProfile: false, assetIds: [] };
    }
    const posts = await ctx.db
      .query("profilePosts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    return {
      hasProfile: true,
      username: profile.username,
      assetIds: posts.filter((post) => !post.unpublishedAt).map((post) => post.assetId),
    };
  },
});

export const shareAsset = authedMutation({
  args: {
    assetId: v.id("assets"),
    caption: v.optional(v.string()),
    hashtags: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
  },
  returns: v.object({
    postId: v.id("profilePosts"),
    publicUrlPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile = await getProfileByUser(ctx, ctx.user._id);
    if (!profile) {
      throw new Error("Claim a username in Settings → Profile before sharing");
    }
    if (!profile.isPublic) {
      throw new Error("Turn on your public profile before sharing");
    }
    await requireOwnedAsset(ctx, ctx.user._id, args.assetId);
    const existing = await ctx.db
      .query("profilePosts")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .unique();
    const caption = args.caption?.trim() || undefined;
    const fromCaptionTags = extractHashtagsFromCaption(caption);
    const fromCaptionKeywords = extractKeywordsFromCaption(caption);
    const fromCaptionMentions = extractMentionsFromCaption(caption);
    const hashtags = normalizeHashtagList([
      ...(args.hashtags ?? []),
      ...fromCaptionTags,
    ]);
    const keywords = normalizeKeywordList([
      ...(args.keywords ?? []),
      ...fromCaptionKeywords,
    ]);
    const now = Date.now();

    async function attachMeta(postId: Id<"profilePosts">) {
      await syncPostHashtags(ctx, {
        postId,
        profileId: profile!._id,
        ownerId: ctx.user._id,
        rawTags: hashtags,
        now,
      });
      await syncPostMentions(ctx, {
        postId,
        ownerId: ctx.user._id,
        usernames: fromCaptionMentions,
        now,
      });
    }

    if (existing) {
      if (!existing.unpublishedAt && existing.ownerId === ctx.user._id) {
        await ctx.db.patch(existing._id, {
          caption,
          keywords: keywords.length ? keywords : undefined,
          publishedAt: now,
          unpublishedAt: undefined,
        });
        await attachMeta(existing._id);
        return {
          postId: existing._id,
          publicUrlPath: publicUrlPath(profile.username),
        };
      }
      if (existing.ownerId !== ctx.user._id) {
        throw new Error("This asset is already shared");
      }
      await ctx.db.patch(existing._id, {
        profileId: profile._id,
        caption,
        keywords: keywords.length ? keywords : undefined,
        publishedAt: now,
        unpublishedAt: undefined,
      });
      await attachMeta(existing._id);
      await adjustProfileCounts(ctx, profile._id, {
        postCount: profile.postCount + 1,
      });
      return {
        postId: existing._id,
        publicUrlPath: publicUrlPath(profile.username),
      };
    }
    const postId = await ctx.db.insert("profilePosts", {
      profileId: profile._id,
      ownerId: ctx.user._id,
      assetId: args.assetId,
      caption,
      keywords: keywords.length ? keywords : undefined,
      likeCount: 0,
      viewCount: 0,
      commentCount: 0,
      saveCount: 0,
      shareCount: 0,
      publishedAt: now,
    });
    await attachMeta(postId);
    await adjustProfileCounts(ctx, profile._id, {
      postCount: profile.postCount + 1,
    });
    return {
      postId,
      publicUrlPath: publicUrlPath(profile.username),
    };
  },
});

export const unshareAsset = authedMutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await getProfileByUser(ctx, ctx.user._id);
    if (!profile) return null;
    const post = await ctx.db
      .query("profilePosts")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .unique();
    if (!post || post.ownerId !== ctx.user._id || post.unpublishedAt) {
      return null;
    }
    const now = Date.now();
    await clearPostHashtags(ctx, post, now);
    await clearPostMentions(ctx, post._id);
    await ctx.db.patch(post._id, { unpublishedAt: now });
    await adjustProfileCounts(ctx, profile._id, {
      postCount: Math.max(0, profile.postCount - 1),
    });
    return null;
  },
});

export const getPublicByUsername = query({
  args: {
    username: v.string(),
    expiresUnix: v.optional(v.number()),
  },
  returns: publicProfileReturn,
  handler: async (ctx, args) => {
    let username: string;
    try {
      username = validateUsername(args.username);
    } catch {
      return null;
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile || !profile.isPublic) return null;

    const viewer = await getOptionalUser(ctx);
    const isOwner = viewer?._id === profile.userId;
    let isFollowing = false;
    if (viewer && !isOwner) {
      const follow = await ctx.db
        .query("profileFollows")
        .withIndex("by_pair", (q) =>
          q.eq("followerUserId", viewer._id).eq("followingProfileId", profile._id),
        )
        .unique();
      isFollowing = Boolean(follow);
    }

    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    let avatarUrl: string | undefined;
    if (profile.avatarAssetId) {
      const avatar = await ctx.db.get("assets", profile.avatarAssetId);
      avatarUrl = await signAvatarUrl(avatar, expiresUnix);
    }

    return {
      _id: profile._id,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl,
      contactLinks: withPublicLinks(profile.contactLinks),
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      postCount: profile.postCount,
      isOwner,
      isFollowing,
      viewerAuthenticated: Boolean(viewer),
    };
  },
});

export const listPublicPosts = query({
  args: {
    username: v.string(),
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(publicPostReturn),
  handler: async (ctx, args) => {
    let username: string;
    try {
      username = validateUsername(args.username);
    } catch {
      return [];
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile || !profile.isPublic) return [];

    // Keep this query under Convex's 1s limit: thumbs only, parallel likes,
    // and defer full media signing to getPublicPostMedia.
    const limit = Math.min(Math.max(args.limit ?? 36, 1), 48);
    const scanned = await ctx.db
      .query("profilePosts")
      .withIndex("by_profile_and_published", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(Math.min(limit + 16, 64));

    const active: Doc<"profilePosts">[] = [];
    for (const post of scanned) {
      if (post.unpublishedAt) continue;
      active.push(post);
      if (active.length >= limit) break;
    }
    if (active.length === 0) return [];

    const viewerId = await getAuthUserId(ctx);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    return await hydratePublicPosts(ctx, active, expiresUnix, viewerId);
  },
});

/**
 * Owner-only collections on your public profile tab bar:
 * saved / liked / shared posts (any public author).
 */
export const listMyCollection = authedQuery({
  args: {
    kind: v.union(v.literal("saved"), v.literal("liked"), v.literal("shared")),
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(publicPostReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 36, 1), 48);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const scan = Math.min(limit + 24, 72);

    let postIds: Id<"profilePosts">[] = [];
    if (args.kind === "liked") {
      const rows = await ctx.db
        .query("profileLikes")
        .withIndex("by_user_and_created", (q) => q.eq("userId", ctx.user._id))
        .order("desc")
        .take(scan);
      postIds = rows.map((row) => row.postId);
    } else if (args.kind === "saved") {
      const rows = await ctx.db
        .query("profileSaves")
        .withIndex("by_user_and_created", (q) => q.eq("userId", ctx.user._id))
        .order("desc")
        .take(scan);
      postIds = rows.map((row) => row.postId);
    } else {
      const rows = await ctx.db
        .query("profileShares")
        .withIndex("by_user_and_created", (q) => q.eq("userId", ctx.user._id))
        .order("desc")
        .take(scan);
      postIds = rows.map((row) => row.postId);
    }

    const posts: Doc<"profilePosts">[] = [];
    const seen = new Set<string>();
    for (const postId of postIds) {
      if (seen.has(postId)) continue;
      seen.add(postId);
      const post = await ctx.db.get("profilePosts", postId);
      if (!post || post.unpublishedAt) continue;
      const profile = await ctx.db.get("profiles", post.profileId);
      if (!profile || !profile.isPublic) continue;
      posts.push(post);
      if (posts.length >= limit) break;
    }
    return await hydratePublicPosts(ctx, posts, expiresUnix, ctx.user._id);
  },
});

/**
 * TikTok-style ranked feed.
 * For You: followed authors dominate, with a discovery mix.
 * Following: only people you follow (chronology + light engagement).
 * Optional seedPostId is pinned first so opening a grid tile lands on that post.
 */
export const listFeed = query({
  args: {
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
    seedPostId: v.optional(v.id("profilePosts")),
    mode: v.optional(v.union(v.literal("forYou"), v.literal("following"))),
  },
  returns: v.array(feedPostReturn),
  handler: async (ctx, args) => {
    const mode: FeedMode = args.mode === "following" ? "following" : "forYou";
    const limit = Math.min(Math.max(args.limit ?? 24, 1), 40);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const viewerId = await getAuthUserId(ctx);
    const now = Date.now();

    const followingIds = new Set<Id<"profiles">>();
    if (viewerId) {
      const follows = await ctx.db
        .query("profileFollows")
        .withIndex("by_follower", (q) => q.eq("followerUserId", viewerId))
        .take(200);
      for (const follow of follows) followingIds.add(follow.followingProfileId);
    }

    // Following mode with nobody followed (or logged out) → empty feed.
    if (mode === "following" && followingIds.size === 0) {
      return [];
    }

    const followingPosts: Doc<"profilePosts">[] = [];
    const followingSeen = new Set<string>();
    for (const profileId of followingIds) {
      const theirs = await ctx.db
        .query("profilePosts")
        .withIndex("by_profile_and_published", (q) => q.eq("profileId", profileId))
        .order("desc")
        .take(10);
      for (const post of theirs) {
        if (post.unpublishedAt || followingSeen.has(post._id)) continue;
        followingSeen.add(post._id);
        followingPosts.push(post);
      }
    }

    const candidates: Doc<"profilePosts">[] = [];
    const seen = new Set<string>();
    const totalCap = 90;

    if (mode === "following") {
      followingPosts.sort((a, b) => b.publishedAt - a.publishedAt);
      for (const post of followingPosts) {
        if (seen.has(post._id)) continue;
        seen.add(post._id);
        candidates.push(post);
        if (candidates.length >= totalCap) break;
      }
    } else {
      const caps = forYouCandidateCap({
        followingCandidateCount: followingPosts.length,
        totalCap,
      });
      for (const post of followingPosts) {
        if (seen.has(post._id)) continue;
        seen.add(post._id);
        candidates.push(post);
        if (candidates.length >= caps.followingCap) break;
      }

      if (caps.discoveryCap > 0) {
        const recent = await ctx.db
          .query("profilePosts")
          .withIndex("by_published")
          .order("desc")
          .take(120);
        let discoveryAdded = 0;
        for (const post of recent) {
          if (post.unpublishedAt || seen.has(post._id)) continue;
          seen.add(post._id);
          candidates.push(post);
          discoveryAdded += 1;
          if (discoveryAdded >= caps.discoveryCap) break;
        }
      }
    }

    if (args.seedPostId) {
      const seed = await ctx.db.get("profilePosts", args.seedPostId);
      if (seed && !seed.unpublishedAt) {
        // Following mode: only pin seed when that author is followed.
        const seedAllowed =
          mode === "forYou" || followingIds.has(seed.profileId);
        if (seedAllowed && !seen.has(seed._id)) {
          candidates.unshift(seed);
          seen.add(seed._id);
        } else if (seedAllowed && seen.has(seed._id)) {
          const idx = candidates.findIndex((post) => post._id === seed._id);
          if (idx > 0) {
            candidates.splice(idx, 1);
            candidates.unshift(seed);
          }
        }
      }
    }

    const profileCache = new Map<Id<"profiles">, Doc<"profiles"> | null>();
    async function profileOf(id: Id<"profiles">) {
      if (profileCache.has(id)) return profileCache.get(id) ?? null;
      const profile = await ctx.db.get("profiles", id);
      profileCache.set(id, profile);
      return profile;
    }

    const affinity =
      viewerId && mode === "forYou"
        ? await loadViewerAffinityMaps(ctx, viewerId)
        : { hashtagScores: new Map(), keywordScores: new Map() };

    const postHashtagCache = new Map<
      Id<"profilePosts">,
      Awaited<ReturnType<typeof loadPostHashtagRefs>>
    >();
    async function hashtagsOf(postId: Id<"profilePosts">) {
      const cached = postHashtagCache.get(postId);
      if (cached) return cached;
      const refs = await loadPostHashtagRefs(ctx, postId);
      postHashtagCache.set(postId, refs);
      return refs;
    }

    const consistencyCache = new Map<string, number>();
    async function consistencyOf(profileId: Id<"profiles">, hashtagId: Id<"hashtags">) {
      const key = `${profileId}:${hashtagId}`;
      if (consistencyCache.has(key)) return consistencyCache.get(key)!;
      const map = await loadCreatorConsistencyForLinks(ctx, profileId, [hashtagId]);
      const score = map.get(hashtagId) ?? 0;
      consistencyCache.set(key, score);
      return score;
    }

    type Scored = {
      post: Doc<"profilePosts">;
      profile: Doc<"profiles">;
      fromFollowing: boolean;
      score: number;
      hashtags: Awaited<ReturnType<typeof loadPostHashtagRefs>>;
    };
    const scored: Scored[] = [];
    for (const post of candidates) {
      const profile = await profileOf(post.profileId);
      if (!profile || !profile.isPublic) continue;
      const fromFollowing = followingIds.has(profile._id);
      if (mode === "following" && !fromFollowing) continue;

      const hashtags = await hashtagsOf(post._id);
      let hashtagAffinity = 0;
      let creatorConsistency = 0;
      if (mode === "forYou" && hashtags.length) {
        for (const ref of hashtags) {
          hashtagAffinity += affinity.hashtagScores.get(ref.hashtagId) ?? 0;
          creatorConsistency += await consistencyOf(profile._id, ref.hashtagId);
        }
      }
      let keywordAffinity = 0;
      if (mode === "forYou" && post.keywords?.length) {
        for (const kw of post.keywords) {
          keywordAffinity += affinity.keywordScores.get(kw) ?? 0;
        }
      }

      scored.push({
        post,
        profile,
        fromFollowing,
        hashtags,
        score: scoreFeedPost({
          mode,
          fromFollowing,
          isSeed: Boolean(args.seedPostId && post._id === args.seedPostId),
          publishedAt: post.publishedAt,
          now,
          engagement: {
            likeCount: post.likeCount,
            viewCount: post.viewCount,
            commentCount: post.commentCount,
            saveCount: post.saveCount,
          },
          identity: {
            hashtagAffinity,
            creatorConsistency,
            keywordAffinity,
          },
        }),
      });
    }

    scored.sort((a, b) => b.score - a.score || b.post.publishedAt - a.post.publishedAt);

    // Soft anti-streak: avoid more than 2 consecutive posts from same author.
    const ordered: Scored[] = [];
    const leftover = [...scored];
    while (leftover.length && ordered.length < limit) {
      let pickIdx = 0;
      const lastTwo = ordered.slice(-2).map((item) => item.profile._id);
      if (lastTwo.length === 2 && lastTwo[0] === lastTwo[1]) {
        const alt = leftover.findIndex((item) => item.profile._id !== lastTwo[0]);
        if (alt >= 0) pickIdx = alt;
      }
      ordered.push(leftover.splice(pickIdx, 1)[0]!);
    }

    if (ordered.length === 0) return [];

    const assets = await Promise.all(
      ordered.map((item) => ctx.db.get("assets", item.post.assetId)),
    );
    const thumbPaths = assets.map((asset) => (asset ? assetThumbnailPath(asset) : undefined));
    const videoPreviewPaths = assets.map((asset) => {
      if (!asset || asset.deletedAt || asset.kind !== "video" || !asset.bunnyPath) {
        return undefined;
      }
      if (assetThumbnailPath(asset)) return undefined;
      return asset.bunnyPath;
    });
    const avatarAssets = await Promise.all(
      ordered.map(async (item) =>
        item.profile.avatarAssetId
          ? ctx.db.get("assets", item.profile.avatarAssetId)
          : null,
      ),
    );
    const avatarPaths = avatarAssets.map((asset) =>
      asset ? assetThumbnailPath(asset) : undefined,
    );
    const likedFlags = viewerId
      ? await Promise.all(
          ordered.map(async (item) => {
            const like = await ctx.db
              .query("profileLikes")
              .withIndex("by_user_and_post", (q) =>
                q.eq("userId", viewerId).eq("postId", item.post._id),
              )
              .unique();
            return Boolean(like);
          }),
        )
      : ordered.map(() => false);
    const savedFlags = viewerId
      ? await Promise.all(
          ordered.map(async (item) => {
            const save = await ctx.db
              .query("profileSaves")
              .withIndex("by_user_and_post", (q) =>
                q.eq("userId", viewerId).eq("postId", item.post._id),
              )
              .unique();
            return Boolean(save);
          }),
        )
      : ordered.map(() => false);

    const [signed, videoUrls] = await Promise.all([
      signBunnyCdnUrls([...thumbPaths, ...avatarPaths], expiresUnix, THUMB_TRANSFORM),
      signBunnyCdnUrls(videoPreviewPaths, expiresUnix),
    ]);

    const ownerUsers = await Promise.all(
      ordered.map((item) => ctx.db.get("users", item.profile.userId)),
    );

    const results: Array<{
      _id: Id<"profilePosts">;
      assetId: Id<"assets">;
      profileId: Id<"profiles">;
      kind: "image" | "video";
      name: string;
      caption?: string;
      keywords?: string[];
      hashtags: Array<{ tag: string; displayTag: string }>;
      mentions: Array<{
        username: string;
        profileId: Id<"profiles">;
        displayName?: string;
        avatarUrl?: string;
      }>;
      likeCount: number;
      viewCount: number;
      commentCount: number;
      saveCount: number;
      shareCount: number;
      publishedAt: number;
      thumbnailUrl?: string;
      mediaUrl?: string;
      likedByViewer: boolean;
      savedByViewer: boolean;
      username: string;
      displayName?: string;
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
      fromFollowing: boolean;
      isFollowing: boolean;
      isOwner: boolean;
      score: number;
    }> = [];

    const mentionRefsByPost = await Promise.all(
      ordered.map((item) => loadPostMentionRefs(ctx, item.post._id)),
    );
    const mentionsByPost = await Promise.all(
      mentionRefsByPost.map((refs) => hydrateMentionChips(ctx, refs, expiresUnix)),
    );

    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i]!;
      const asset = assets[i];
      if (!asset || asset.deletedAt || (asset.kind !== "image" && asset.kind !== "video")) {
        continue;
      }
      const thumbPath = thumbPaths[i];
      const videoPath = videoPreviewPaths[i];
      const avatarPath = avatarPaths[i];
      const owner = ownerUsers[i];
      const firstName = owner?.firstName?.trim() || undefined;
      const lastName = owner?.lastName?.trim() || undefined;
      const isOwner = Boolean(viewerId && item.profile.userId === viewerId);
      const mentions = mentionsByPost[i] ?? [];
      results.push({
        _id: item.post._id,
        assetId: item.post.assetId,
        profileId: item.profile._id,
        kind: asset.kind,
        name: asset.name,
        caption: item.post.caption,
        keywords: item.post.keywords?.length ? item.post.keywords : undefined,
        hashtags: item.hashtags.map((t) => ({ tag: t.tag, displayTag: t.displayTag })),
        mentions,
        likeCount: item.post.likeCount,
        viewCount: item.post.viewCount ?? 0,
        commentCount: item.post.commentCount ?? 0,
        saveCount: item.post.saveCount ?? 0,
        shareCount: item.post.shareCount ?? 0,
        publishedAt: item.post.publishedAt,
        thumbnailUrl: thumbPath ? signed.get(thumbPath) : undefined,
        mediaUrl: videoPath ? videoUrls.get(videoPath) : undefined,
        likedByViewer: likedFlags[i] ?? false,
        savedByViewer: savedFlags[i] ?? false,
        username: item.profile.username,
        displayName: item.profile.displayName?.trim() || undefined,
        firstName,
        lastName,
        avatarUrl: avatarPath ? signed.get(avatarPath) : undefined,
        fromFollowing: item.fromFollowing,
        isFollowing: item.fromFollowing,
        isOwner,
        score: item.score,
      });
    }

    // If seed was filtered out somehow, try to append it first by reordering.
    if (args.seedPostId) {
      const seedIdx = results.findIndex((post) => post._id === args.seedPostId);
      if (seedIdx > 0) {
        const [seed] = results.splice(seedIdx, 1);
        if (seed) results.unshift(seed);
      }
    }

    return results;
  },
});

export const getPublicPostMedia = query({
  args: {
    postId: v.id("profilePosts"),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      postId: v.id("profilePosts"),
      kind: v.union(v.literal("image"), v.literal("video")),
      thumbnailUrl: v.optional(v.string()),
      mediaUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const post = await ctx.db.get("profilePosts", args.postId);
    if (!post || post.unpublishedAt) return null;
    const profile = await ctx.db.get("profiles", post.profileId);
    if (!profile || !profile.isPublic) return null;

    const asset = await ctx.db.get("assets", post.assetId);
    if (!asset || asset.deletedAt || (asset.kind !== "image" && asset.kind !== "video")) {
      return null;
    }

    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const thumbPath = assetThumbnailPath(asset);
    const [thumbs, mediaUrl] = await Promise.all([
      thumbPath
        ? signBunnyCdnUrls([thumbPath], expiresUnix, THUMB_TRANSFORM)
        : Promise.resolve(new Map<string, string>()),
      asset.bunnyPath
        ? signBunnyFullUrl(asset.bunnyPath, expiresUnix, asset.kind)
        : Promise.resolve(undefined),
    ]);

    return {
      postId: post._id,
      kind: asset.kind,
      thumbnailUrl: thumbPath ? thumbs.get(thumbPath) : undefined,
      mediaUrl,
    };
  },
});

export const follow = authedMutation({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    following: v.boolean(),
    followerCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("profiles", args.profileId);
    if (!profile || !profile.isPublic) {
      throw new Error("Profile not found");
    }
    if (profile.userId === ctx.user._id) {
      throw new Error("You cannot follow yourself");
    }
    const existing = await ctx.db
      .query("profileFollows")
      .withIndex("by_pair", (q) =>
        q.eq("followerUserId", ctx.user._id).eq("followingProfileId", profile._id),
      )
      .unique();
    if (existing) {
      return { following: true, followerCount: profile.followerCount };
    }

    const viewerProfile = await getProfileByUser(ctx, ctx.user._id);
    await ctx.db.insert("profileFollows", {
      followerUserId: ctx.user._id,
      followingProfileId: profile._id,
      createdAt: Date.now(),
    });
    const followerCount = profile.followerCount + 1;
    await ctx.db.patch(profile._id, {
      followerCount,
      updatedAt: Date.now(),
    });
    if (viewerProfile) {
      await ctx.db.patch(viewerProfile._id, {
        followingCount: viewerProfile.followingCount + 1,
        updatedAt: Date.now(),
      });
    }
    return { following: true, followerCount };
  },
});

export const unfollow = authedMutation({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    following: v.boolean(),
    followerCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("profiles", args.profileId);
    if (!profile) {
      throw new Error("Profile not found");
    }
    const existing = await ctx.db
      .query("profileFollows")
      .withIndex("by_pair", (q) =>
        q.eq("followerUserId", ctx.user._id).eq("followingProfileId", profile._id),
      )
      .unique();
    if (!existing) {
      return { following: false, followerCount: profile.followerCount };
    }
    await ctx.db.delete(existing._id);
    const followerCount = Math.max(0, profile.followerCount - 1);
    await ctx.db.patch(profile._id, {
      followerCount,
      updatedAt: Date.now(),
    });
    const viewerProfile = await getProfileByUser(ctx, ctx.user._id);
    if (viewerProfile) {
      await ctx.db.patch(viewerProfile._id, {
        followingCount: Math.max(0, viewerProfile.followingCount - 1),
        updatedAt: Date.now(),
      });
    }
    return { following: false, followerCount };
  },
});

export const toggleLike = authedMutation({
  args: { postId: v.id("profilePosts") },
  returns: v.object({
    liked: v.boolean(),
    likeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const post = await ctx.db.get("profilePosts", args.postId);
    if (!post || post.unpublishedAt) {
      throw new Error("Post not found");
    }
    const profile = await ctx.db.get("profiles", post.profileId);
    if (!profile || !profile.isPublic) {
      throw new Error("Post not found");
    }
    const existing = await ctx.db
      .query("profileLikes")
      .withIndex("by_user_and_post", (q) =>
        q.eq("userId", ctx.user._id).eq("postId", post._id),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      const likeCount = Math.max(0, post.likeCount - 1);
      await ctx.db.patch(post._id, { likeCount });
      await applyPostAffinity(ctx, {
        userId: ctx.user._id,
        post,
        event: "like",
        direction: -1,
      });
      return { liked: false, likeCount };
    }
    await ctx.db.insert("profileLikes", {
      userId: ctx.user._id,
      postId: post._id,
      createdAt: Date.now(),
    });
    const likeCount = post.likeCount + 1;
    await ctx.db.patch(post._id, { likeCount });
    await applyPostAffinity(ctx, {
      userId: ctx.user._id,
      post,
      event: "like",
      direction: 1,
    });
    return { liked: true, likeCount };
  },
});

export const toggleSave = authedMutation({
  args: { postId: v.id("profilePosts") },
  returns: v.object({
    saved: v.boolean(),
    saveCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const post = await requirePublicPost(ctx, args.postId);
    const existing = await ctx.db
      .query("profileSaves")
      .withIndex("by_user_and_post", (q) =>
        q.eq("userId", ctx.user._id).eq("postId", post._id),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      const saveCount = Math.max(0, (post.saveCount ?? 1) - 1);
      await ctx.db.patch(post._id, { saveCount });
      await applyPostAffinity(ctx, {
        userId: ctx.user._id,
        post,
        event: "save",
        direction: -1,
      });
      return { saved: false, saveCount };
    }
    await ctx.db.insert("profileSaves", {
      userId: ctx.user._id,
      postId: post._id,
      createdAt: Date.now(),
    });
    const saveCount = (post.saveCount ?? 0) + 1;
    await ctx.db.patch(post._id, { saveCount });
    await applyPostAffinity(ctx, {
      userId: ctx.user._id,
      post,
      event: "save",
      direction: 1,
    });
    return { saved: true, saveCount };
  },
});

/** Record a share for the viewer (once per user+post) and bump shareCount. */
export const recordShare = authedMutation({
  args: { postId: v.id("profilePosts") },
  returns: v.object({
    shared: v.boolean(),
    shareCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const post = await requirePublicPost(ctx, args.postId);
    const existing = await ctx.db
      .query("profileShares")
      .withIndex("by_user_and_post", (q) =>
        q.eq("userId", ctx.user._id).eq("postId", post._id),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { createdAt: now });
    } else {
      await ctx.db.insert("profileShares", {
        userId: ctx.user._id,
        postId: post._id,
        createdAt: now,
      });
    }
    const shareCount = (post.shareCount ?? 0) + 1;
    await ctx.db.patch(post._id, { shareCount });
    if (!existing) {
      await applyPostAffinity(ctx, {
        userId: ctx.user._id,
        post,
        event: "share",
        direction: 1,
      });
    }
    return { shared: true, shareCount };
  },
});

/** Increment public view count when a post is opened in the viewer. */
export const recordPostView = mutation({
  args: { postId: v.id("profilePosts") },
  returns: v.object({ viewCount: v.number() }),
  handler: async (ctx, args) => {
    const post = await ctx.db.get("profilePosts", args.postId);
    if (!post || post.unpublishedAt) {
      return { viewCount: 0 };
    }
    const profile = await ctx.db.get("profiles", post.profileId);
    if (!profile || !profile.isPublic) {
      return { viewCount: post.viewCount ?? 0 };
    }
    const viewCount = (post.viewCount ?? 0) + 1;
    await ctx.db.patch(post._id, { viewCount });
    const viewerId = await getAuthUserId(ctx);
    if (viewerId) {
      await applyPostAffinity(ctx, {
        userId: viewerId,
        post,
        event: "view",
        direction: 1,
      });
    }
    return { viewCount };
  },
});

const MAX_COMMENT_LEN = 500;

function sanitizeCommentBody(raw: string, { allowEmpty }: { allowEmpty: boolean }): string {
  const body = raw.replace(/\s+/g, " ").trim();
  if (!body) {
    if (allowEmpty) return "";
    throw new Error("Comment cannot be empty");
  }
  if (body.length > MAX_COMMENT_LEN) {
    throw new Error(`Comment must be ${MAX_COMMENT_LEN} characters or fewer`);
  }
  return body;
}

async function requirePublicPost(
  ctx: QueryCtx | MutationCtx,
  postId: Id<"profilePosts">,
): Promise<Doc<"profilePosts">> {
  const post = await ctx.db.get("profilePosts", postId);
  if (!post || post.unpublishedAt) throw new Error("Post not found");
  const profile = await ctx.db.get("profiles", post.profileId);
  if (!profile || !profile.isPublic) throw new Error("Post not found");
  return post;
}

const commentReturnValidator = v.object({
  _id: v.id("profileComments"),
  body: v.string(),
  createdAt: v.number(),
  userId: v.id("users"),
  displayName: v.string(),
  username: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  isOwner: v.boolean(),
  isMine: v.boolean(),
  parentId: v.optional(v.id("profileComments")),
  likeCount: v.number(),
  replyCount: v.number(),
  likedByMe: v.boolean(),
  imageUrl: v.optional(v.string()),
});

type CommentReturn = {
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

async function hydrateComments(
  ctx: QueryCtx,
  rows: Doc<"profileComments">[],
  postOwnerId: Id<"users"> | undefined,
  expiresUnix: number,
): Promise<CommentReturn[]> {
  const viewerId = await getAuthUserId(ctx);
  const prepared: Array<{
    _id: Id<"profileComments">;
    body: string;
    createdAt: number;
    userId: Id<"users">;
    displayName: string;
    username?: string;
    isOwner: boolean;
    isMine: boolean;
    parentId?: Id<"profileComments">;
    likeCount: number;
    replyCount: number;
    likedByMe: boolean;
    avatarAssetId?: Id<"assets">;
    imageAssetId?: Id<"assets">;
  }> = [];

  for (const row of rows) {
    if (row.deletedAt) continue;
    const user = await ctx.db.get("users", row.userId);
    if (!user) continue;
    const authorProfile = await getProfileByUser(ctx, row.userId);
    const displayName =
      authorProfile?.displayName?.trim() ||
      user.name?.trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      authorProfile?.username ||
      "User";
    let likedByMe = false;
    if (viewerId) {
      const like = await ctx.db
        .query("profileCommentLikes")
        .withIndex("by_user_and_comment", (q) =>
          q.eq("userId", viewerId).eq("commentId", row._id),
        )
        .unique();
      likedByMe = Boolean(like);
    }
    prepared.push({
      _id: row._id,
      body: row.body,
      createdAt: row.createdAt,
      userId: row.userId,
      displayName,
      username: authorProfile?.username,
      isOwner: postOwnerId ? row.userId === postOwnerId : false,
      isMine: viewerId === row.userId,
      parentId: row.parentId,
      likeCount: row.likeCount ?? 0,
      replyCount: row.replyCount ?? 0,
      likedByMe,
      avatarAssetId: authorProfile?.avatarAssetId,
      imageAssetId: row.imageAssetId,
    });
  }

  const avatarAssets = await Promise.all(
    prepared.map((comment) =>
      comment.avatarAssetId ? ctx.db.get("assets", comment.avatarAssetId) : null,
    ),
  );
  const avatarUrls = await Promise.all(
    avatarAssets.map((asset) => signAvatarUrl(asset, expiresUnix)),
  );
  const imageAssets = await Promise.all(
    prepared.map((comment) =>
      comment.imageAssetId ? ctx.db.get("assets", comment.imageAssetId) : null,
    ),
  );
  const imageUrls = await Promise.all(
    imageAssets.map(async (asset) => {
      if (!asset || asset.deletedAt || !asset.bunnyPath || asset.kind !== "image") {
        return undefined;
      }
      return signBunnyFullUrl(asset.bunnyPath, expiresUnix);
    }),
  );

  return prepared.map((comment, index) => ({
    _id: comment._id,
    body: comment.body,
    createdAt: comment.createdAt,
    userId: comment.userId,
    displayName: comment.displayName,
    username: comment.username,
    avatarUrl: avatarUrls[index],
    isOwner: comment.isOwner,
    isMine: comment.isMine,
    parentId: comment.parentId,
    likeCount: comment.likeCount,
    replyCount: comment.replyCount,
    likedByMe: comment.likedByMe,
    imageUrl: imageUrls[index],
  }));
}

/** Top-level comments for a post (no parent). */
export const listComments = query({
  args: {
    postId: v.id("profilePosts"),
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(commentReturnValidator),
  handler: async (ctx, args) => {
    try {
      await requirePublicPost(ctx, args.postId);
    } catch {
      return [];
    }
    const limit = Math.min(Math.max(args.limit ?? 60, 1), 100);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const rows = await ctx.db
      .query("profileComments")
      .withIndex("by_post_and_created", (q) => q.eq("postId", args.postId))
      .order("desc")
      .take(limit * 3 + 40);

    const post = await ctx.db.get("profilePosts", args.postId);
    const topLevel: Doc<"profileComments">[] = [];
    for (const row of rows) {
      if (row.deletedAt || row.parentId) continue;
      topLevel.push(row);
      if (topLevel.length >= limit) break;
    }
    topLevel.reverse();
    return hydrateComments(ctx, topLevel, post?.ownerId, expiresUnix);
  },
});

/** Direct replies under a parent comment. */
export const listCommentReplies = query({
  args: {
    parentId: v.id("profileComments"),
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(commentReturnValidator),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get("profileComments", args.parentId);
    if (!parent || parent.deletedAt) return [];
    try {
      await requirePublicPost(ctx, parent.postId);
    } catch {
      return [];
    }
    const limit = Math.min(Math.max(args.limit ?? 60, 1), 100);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const rows = await ctx.db
      .query("profileComments")
      .withIndex("by_parent_and_created", (q) => q.eq("parentId", args.parentId))
      .order("asc")
      .take(limit + 20);

    const post = await ctx.db.get("profilePosts", parent.postId);
    const alive = rows.filter((row) => !row.deletedAt).slice(0, limit);
    return hydrateComments(ctx, alive, post?.ownerId, expiresUnix);
  },
});

export const addComment = authedMutation({
  args: {
    postId: v.id("profilePosts"),
    body: v.string(),
    parentId: v.optional(v.id("profileComments")),
    imageAssetId: v.optional(v.id("assets")),
  },
  returns: v.object({
    commentId: v.id("profileComments"),
    commentCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const post = await requirePublicPost(ctx, args.postId);
    const body = sanitizeCommentBody(args.body, {
      allowEmpty: Boolean(args.imageAssetId),
    });
    let imageAssetId: Id<"assets"> | undefined;
    if (args.imageAssetId) {
      const asset = await ctx.db.get("assets", args.imageAssetId);
      if (
        !asset ||
        asset.ownerId !== ctx.user._id ||
        asset.deletedAt ||
        asset.kind !== "image" ||
        !asset.bunnyPath
      ) {
        throw new Error("Image not found");
      }
      imageAssetId = asset._id;
    }
    if (!body && !imageAssetId) {
      throw new Error("Comment cannot be empty");
    }
    let parent: Doc<"profileComments"> | null = null;
    if (args.parentId) {
      parent = await ctx.db.get("profileComments", args.parentId);
      if (!parent || parent.deletedAt || parent.postId !== args.postId) {
        throw new Error("Comment not found");
      }
    }
    const commentId = await ctx.db.insert("profileComments", {
      postId: args.postId,
      userId: ctx.user._id,
      body,
      createdAt: Date.now(),
      parentId: parent?._id,
      likeCount: 0,
      replyCount: 0,
      imageAssetId,
    });
    if (parent) {
      await ctx.db.patch(parent._id, {
        replyCount: (parent.replyCount ?? 0) + 1,
      });
    }
    const commentCount = (post.commentCount ?? 0) + 1;
    await ctx.db.patch(post._id, { commentCount });
    return { commentId, commentCount };
  },
});

export const toggleCommentLike = authedMutation({
  args: { commentId: v.id("profileComments") },
  returns: v.object({
    liked: v.boolean(),
    likeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("profileComments", args.commentId);
    if (!comment || comment.deletedAt) {
      throw new Error("Comment not found");
    }
    await requirePublicPost(ctx, comment.postId);
    const existing = await ctx.db
      .query("profileCommentLikes")
      .withIndex("by_user_and_comment", (q) =>
        q.eq("userId", ctx.user._id).eq("commentId", comment._id),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      const likeCount = Math.max(0, (comment.likeCount ?? 1) - 1);
      await ctx.db.patch(comment._id, { likeCount });
      return { liked: false, likeCount };
    }
    await ctx.db.insert("profileCommentLikes", {
      userId: ctx.user._id,
      commentId: comment._id,
      createdAt: Date.now(),
    });
    const likeCount = (comment.likeCount ?? 0) + 1;
    await ctx.db.patch(comment._id, { likeCount });
    return { liked: true, likeCount };
  },
});

export const deleteComment = authedMutation({
  args: { commentId: v.id("profileComments") },
  returns: v.object({
    commentCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("profileComments", args.commentId);
    if (!comment || comment.deletedAt) {
      return { commentCount: 0 };
    }
    const post = await ctx.db.get("profilePosts", comment.postId);
    const isAuthor = comment.userId === ctx.user._id;
    const isPostOwner = post?.ownerId === ctx.user._id;
    if (!isAuthor && !isPostOwner) {
      throw new Error("You cannot delete this comment");
    }
    await ctx.db.patch(comment._id, { deletedAt: Date.now() });
    if (comment.parentId) {
      const parent = await ctx.db.get("profileComments", comment.parentId);
      if (parent && !parent.deletedAt) {
        await ctx.db.patch(parent._id, {
          replyCount: Math.max(0, (parent.replyCount ?? 1) - 1),
        });
      }
    }
    if (!post) return { commentCount: 0 };
    const commentCount = Math.max(0, (post.commentCount ?? 1) - 1);
    await ctx.db.patch(post._id, { commentCount });
    return { commentCount };
  },
});
