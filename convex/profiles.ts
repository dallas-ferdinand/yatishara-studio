import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getOptionalUser } from "./lib/auth";
import {
  assetThumbnailPath,
  PREVIEW_TRANSFORM,
  signBunnyCdnUrls,
  signBunnyFullUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  contactHref,
  sanitizeBio,
  sanitizeContactLinks,
  sanitizeDisplayName,
  validateUsername,
  type ContactLinkInput,
} from "./lib/profileIdentity";

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
  likeCount: v.number(),
  publishedAt: v.number(),
  thumbnailUrl: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  likedByViewer: v.boolean(),
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
  const thumbPath = assetThumbnailPath(asset);
  if (!thumbPath) return undefined;
  const signed = await signBunnyCdnUrls([thumbPath], expiresUnix, PREVIEW_TRANSFORM);
  return signed.get(thumbPath);
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
    const now = Date.now();
    if (existing) {
      if (!existing.unpublishedAt && existing.ownerId === ctx.user._id) {
        await ctx.db.patch(existing._id, {
          caption,
          publishedAt: now,
          unpublishedAt: undefined,
        });
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
        publishedAt: now,
        unpublishedAt: undefined,
      });
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
      likeCount: 0,
      publishedAt: now,
    });
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
    await ctx.db.patch(post._id, { unpublishedAt: Date.now() });
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

    const assets = await Promise.all(active.map((post) => ctx.db.get("assets", post.assetId)));
    const thumbPaths = assets.map((asset) => (asset ? assetThumbnailPath(asset) : undefined));
    const likedFlags = viewerId
      ? await Promise.all(
          active.map(async (post) => {
            const like = await ctx.db
              .query("profileLikes")
              .withIndex("by_user_and_post", (q) =>
                q.eq("userId", viewerId).eq("postId", post._id),
              )
              .unique();
            return Boolean(like);
          }),
        )
      : active.map(() => false);

    const thumbs = await signBunnyCdnUrls(thumbPaths, expiresUnix, THUMB_TRANSFORM);

    const results: Array<{
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
    }> = [];

    for (let i = 0; i < active.length; i++) {
      const post = active[i]!;
      const asset = assets[i];
      if (!asset || asset.deletedAt || (asset.kind !== "image" && asset.kind !== "video")) {
        continue;
      }
      const thumbPath = thumbPaths[i];
      const thumbnailUrl = thumbPath ? thumbs.get(thumbPath) : undefined;
      results.push({
        _id: post._id,
        assetId: post.assetId,
        kind: asset.kind,
        name: asset.name,
        caption: post.caption,
        likeCount: post.likeCount,
        publishedAt: post.publishedAt,
        thumbnailUrl,
        // Grid uses thumbnails; lightbox loads full media via getPublicPostMedia.
        mediaUrl: undefined,
        likedByViewer: likedFlags[i] ?? false,
      });
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
      return { liked: false, likeCount };
    }
    await ctx.db.insert("profileLikes", {
      userId: ctx.user._id,
      postId: post._id,
      createdAt: Date.now(),
    });
    const likeCount = post.likeCount + 1;
    await ctx.db.patch(post._id, { likeCount });
    return { liked: true, likeCount };
  },
});
