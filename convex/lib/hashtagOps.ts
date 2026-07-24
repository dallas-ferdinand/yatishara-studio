import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  AFFINITY_WEIGHTS,
  type AffinityEvent,
  creatorConsistencyScore,
  displayHashtag,
  normalizeHashtag,
  normalizeHashtagList,
  normalizeKeywordList,
} from "./hashtagNormalize";

type DbCtx = QueryCtx | MutationCtx;

export type PostHashtagRef = {
  hashtagId: Id<"hashtags">;
  tag: string;
  displayTag: string;
};

export async function loadPostHashtagRefs(
  ctx: DbCtx,
  postId: Id<"profilePosts">,
): Promise<PostHashtagRef[]> {
  const links = await ctx.db
    .query("profilePostHashtags")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .take(24);
  const refs: PostHashtagRef[] = [];
  for (const link of links) {
    const hashtag = await ctx.db.get("hashtags", link.hashtagId);
    if (!hashtag) continue;
    refs.push({
      hashtagId: hashtag._id,
      tag: hashtag.tag,
      displayTag: hashtag.displayTag,
    });
  }
  return refs;
}

export async function upsertHashtag(
  ctx: MutationCtx,
  rawTag: string,
  now: number,
): Promise<Doc<"hashtags">> {
  const tag = normalizeHashtag(rawTag);
  if (!tag) throw new Error(`Invalid hashtag: ${rawTag}`);
  const existing = await ctx.db
    .query("hashtags")
    .withIndex("by_tag", (q) => q.eq("tag", tag))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("hashtags", {
    tag,
    displayTag: displayHashtag(rawTag, tag),
    postCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get("hashtags", id);
  if (!created) throw new Error("Failed to create hashtag");
  return created;
}

async function bumpCreatorStats(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  hashtagId: Id<"hashtags">,
  delta: number,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("creatorHashtagStats")
    .withIndex("by_profile_and_hashtag", (q) =>
      q.eq("profileId", profileId).eq("hashtagId", hashtagId),
    )
    .unique();
  if (existing) {
    const postCount = Math.max(0, existing.postCount + delta);
    if (postCount === 0) {
      await ctx.db.delete(existing._id);
      return;
    }
    await ctx.db.patch(existing._id, {
      postCount,
      consistencyScore: creatorConsistencyScore(postCount, now, now),
      updatedAt: now,
    });
    return;
  }
  if (delta <= 0) return;
  await ctx.db.insert("creatorHashtagStats", {
    profileId,
    hashtagId,
    postCount: delta,
    consistencyScore: creatorConsistencyScore(delta, now, now),
    updatedAt: now,
  });
}

/**
 * Replace hashtag links on a post. Adjusts global postCount and creator stats.
 * `wasPublished` — if republishing an already-live post, old tags are swapped.
 */
export async function syncPostHashtags(
  ctx: MutationCtx,
  args: {
    postId: Id<"profilePosts">;
    profileId: Id<"profiles">;
    ownerId: Id<"users">;
    rawTags: string[];
    now: number;
  },
): Promise<Id<"hashtags">[]> {
  const tags = normalizeHashtagList(args.rawTags);
  const existingLinks = await ctx.db
    .query("profilePostHashtags")
    .withIndex("by_post", (q) => q.eq("postId", args.postId))
    .collect();

  const oldByTag = new Map<string, Doc<"profilePostHashtags">>();
  for (const link of existingLinks) {
    const hashtag = await ctx.db.get("hashtags", link.hashtagId);
    if (hashtag) oldByTag.set(hashtag.tag, link);
  }

  const nextIds: Id<"hashtags">[] = [];
  const nextSet = new Set<string>();

  for (const tag of tags) {
    nextSet.add(tag);
    const hashtag = await upsertHashtag(ctx, tag, args.now);
    nextIds.push(hashtag._id);
    const old = oldByTag.get(tag);
    if (old) continue;
    await ctx.db.insert("profilePostHashtags", {
      postId: args.postId,
      hashtagId: hashtag._id,
      profileId: args.profileId,
      ownerId: args.ownerId,
      createdAt: args.now,
    });
    await ctx.db.patch(hashtag._id, {
      postCount: hashtag.postCount + 1,
      updatedAt: args.now,
    });
    await bumpCreatorStats(ctx, args.profileId, hashtag._id, 1, args.now);
  }

  for (const [tag, link] of oldByTag) {
    if (nextSet.has(tag)) continue;
    const hashtag = await ctx.db.get("hashtags", link.hashtagId);
    await ctx.db.delete(link._id);
    if (hashtag) {
      await ctx.db.patch(hashtag._id, {
        postCount: Math.max(0, hashtag.postCount - 1),
        updatedAt: args.now,
      });
      await bumpCreatorStats(ctx, args.profileId, hashtag._id, -1, args.now);
    }
  }

  return nextIds;
}

export async function clearPostHashtags(
  ctx: MutationCtx,
  post: Doc<"profilePosts">,
  now: number,
): Promise<void> {
  await syncPostHashtags(ctx, {
    postId: post._id,
    profileId: post.profileId,
    ownerId: post.ownerId,
    rawTags: [],
    now,
  });
}

async function bumpHashtagAffinity(
  ctx: MutationCtx,
  userId: Id<"users">,
  hashtagId: Id<"hashtags">,
  event: AffinityEvent,
  direction: 1 | -1,
  now: number,
): Promise<void> {
  const weight = AFFINITY_WEIGHTS[event] * direction;
  const decay = direction < 0 ? 0.5 : 1; // unlike/unsave decays gently
  const delta = weight * decay;
  const existing = await ctx.db
    .query("userHashtagAffinity")
    .withIndex("by_user_and_hashtag", (q) =>
      q.eq("userId", userId).eq("hashtagId", hashtagId),
    )
    .unique();

  const countKey =
    event === "like"
      ? "likeCount"
      : event === "save"
        ? "saveCount"
        : event === "share"
          ? "shareCount"
          : "viewCount";

  if (existing) {
    const nextScore = Math.max(0, Math.round((existing.score + delta) * 100) / 100);
    const nextCount = Math.max(0, (existing[countKey] ?? 0) + direction);
    if (nextScore <= 0 && nextCount <= 0 && existing.likeCount + existing.saveCount + existing.shareCount + existing.viewCount <= 1) {
      await ctx.db.delete(existing._id);
      return;
    }
    await ctx.db.patch(existing._id, {
      score: nextScore,
      [countKey]: nextCount,
      updatedAt: now,
    });
    return;
  }

  if (direction < 0) return;
  await ctx.db.insert("userHashtagAffinity", {
    userId,
    hashtagId,
    score: Math.max(0, Math.round(delta * 100) / 100),
    likeCount: event === "like" ? 1 : 0,
    saveCount: event === "save" ? 1 : 0,
    shareCount: event === "share" ? 1 : 0,
    viewCount: event === "view" ? 1 : 0,
    updatedAt: now,
  });
}

async function bumpKeywordAffinity(
  ctx: MutationCtx,
  userId: Id<"users">,
  keyword: string,
  event: AffinityEvent,
  direction: 1 | -1,
  now: number,
): Promise<void> {
  const weight = AFFINITY_WEIGHTS[event] * direction;
  const decay = direction < 0 ? 0.5 : 1;
  const delta = weight * decay;
  const existing = await ctx.db
    .query("userKeywordAffinity")
    .withIndex("by_user_and_keyword", (q) =>
      q.eq("userId", userId).eq("keyword", keyword),
    )
    .unique();

  const countKey =
    event === "like"
      ? "likeCount"
      : event === "save"
        ? "saveCount"
        : event === "share"
          ? "shareCount"
          : "viewCount";

  if (existing) {
    const nextScore = Math.max(0, Math.round((existing.score + delta) * 100) / 100);
    const nextCount = Math.max(0, (existing[countKey] ?? 0) + direction);
    await ctx.db.patch(existing._id, {
      score: nextScore,
      [countKey]: nextCount,
      updatedAt: now,
    });
    return;
  }
  if (direction < 0) return;
  await ctx.db.insert("userKeywordAffinity", {
    userId,
    keyword,
    score: Math.max(0, Math.round(delta * 100) / 100),
    likeCount: event === "like" ? 1 : 0,
    saveCount: event === "save" ? 1 : 0,
    shareCount: event === "share" ? 1 : 0,
    viewCount: event === "view" ? 1 : 0,
    updatedAt: now,
  });
}

/** Apply engagement affinity for all hashtags + keywords on a post. */
export async function applyPostAffinity(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    post: Doc<"profilePosts">;
    event: AffinityEvent;
    direction?: 1 | -1;
  },
): Promise<void> {
  const direction = args.direction ?? 1;
  const now = Date.now();
  const refs = await loadPostHashtagRefs(ctx, args.post._id);
  for (const ref of refs) {
    await bumpHashtagAffinity(ctx, args.userId, ref.hashtagId, args.event, direction, now);
  }
  const keywords = normalizeKeywordList(args.post.keywords);
  for (const keyword of keywords) {
    await bumpKeywordAffinity(ctx, args.userId, keyword, args.event, direction, now);
  }
}

export async function loadViewerAffinityMaps(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{
  hashtagScores: Map<Id<"hashtags">, number>;
  keywordScores: Map<string, number>;
}> {
  const [hashtagRows, keywordRows] = await Promise.all([
    ctx.db
      .query("userHashtagAffinity")
      .withIndex("by_user_and_score", (q) => q.eq("userId", userId))
      .order("desc")
      .take(80),
    ctx.db
      .query("userKeywordAffinity")
      .withIndex("by_user_and_score", (q) => q.eq("userId", userId))
      .order("desc")
      .take(80),
  ]);
  const hashtagScores = new Map<Id<"hashtags">, number>();
  for (const row of hashtagRows) {
    if (row.score > 0) hashtagScores.set(row.hashtagId, row.score);
  }
  const keywordScores = new Map<string, number>();
  for (const row of keywordRows) {
    if (row.score > 0) keywordScores.set(row.keyword, row.score);
  }
  return { hashtagScores, keywordScores };
}

export async function loadCreatorConsistencyForLinks(
  ctx: QueryCtx,
  profileId: Id<"profiles">,
  hashtagIds: Id<"hashtags">[],
): Promise<Map<Id<"hashtags">, number>> {
  const out = new Map<Id<"hashtags">, number>();
  await Promise.all(
    hashtagIds.map(async (hashtagId) => {
      const row = await ctx.db
        .query("creatorHashtagStats")
        .withIndex("by_profile_and_hashtag", (q) =>
          q.eq("profileId", profileId).eq("hashtagId", hashtagId),
        )
        .unique();
      if (row) out.set(hashtagId, row.consistencyScore);
    }),
  );
  return out;
}

export type PostMentionRef = {
  profileId: Id<"profiles">;
  username: string;
};

export async function loadPostMentionRefs(
  ctx: DbCtx,
  postId: Id<"profilePosts">,
): Promise<PostMentionRef[]> {
  const links = await ctx.db
    .query("profilePostMentions")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .take(24);
  return links.map((link) => ({
    profileId: link.mentionedProfileId,
    username: link.mentionedUsername,
  }));
}

/** Replace @mention links on a post. Only resolves existing public profiles. */
export async function syncPostMentions(
  ctx: MutationCtx,
  args: {
    postId: Id<"profilePosts">;
    ownerId: Id<"users">;
    usernames: string[];
    now: number;
  },
): Promise<PostMentionRef[]> {
  const wanted = [...new Set(args.usernames.map((u) => u.toLowerCase()))].slice(0, 12);
  const existing = await ctx.db
    .query("profilePostMentions")
    .withIndex("by_post", (q) => q.eq("postId", args.postId))
    .collect();

  const resolved: PostMentionRef[] = [];
  const keepIds = new Set<string>();

  for (const username of wanted) {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile || !profile.isPublic) continue;
    resolved.push({ profileId: profile._id, username: profile.username });
    const already = existing.find((row) => row.mentionedProfileId === profile._id);
    if (already) {
      keepIds.add(already._id);
      continue;
    }
    const id = await ctx.db.insert("profilePostMentions", {
      postId: args.postId,
      mentionedProfileId: profile._id,
      mentionedUsername: profile.username,
      ownerId: args.ownerId,
      createdAt: args.now,
    });
    keepIds.add(id);
  }

  for (const row of existing) {
    if (keepIds.has(row._id)) continue;
    await ctx.db.delete(row._id);
  }

  return resolved;
}

export async function clearPostMentions(
  ctx: MutationCtx,
  postId: Id<"profilePosts">,
): Promise<void> {
  const existing = await ctx.db
    .query("profilePostMentions")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
}
