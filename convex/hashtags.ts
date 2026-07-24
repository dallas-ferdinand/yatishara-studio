import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  assetThumbnailPath,
  THUMB_TRANSFORM,
  signBunnyCdnUrls,
} from "./lib/bunny";
import { normalizeHashtag } from "./lib/hashtagNormalize";

const suggestionReturn = v.object({
  tag: v.string(),
  displayTag: v.string(),
  postCount: v.number(),
  exists: v.boolean(),
});

const PUBLIC_URL_TTL_SECONDS = 60 * 60;

async function signAvatarUrl(
  asset: Doc<"assets"> | null,
  expiresUnix: number,
): Promise<string | undefined> {
  if (!asset || asset.deletedAt || !asset.bunnyPath) return undefined;
  const thumbPath = assetThumbnailPath(asset) ?? asset.bunnyPath;
  if (!thumbPath) return undefined;
  const signed = await signBunnyCdnUrls([thumbPath], expiresUnix, THUMB_TRANSFORM);
  return signed.get(thumbPath);
}

/**
 * Prefix autocomplete for hashtags. When the query is a valid new tag with no
 * exact match, includes a `{ exists: false }` create option.
 */
export const suggestHashtags = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(suggestionReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 8, 1), 20);
    const raw = args.query.trim().replace(/^#+/, "");
    const prefix = raw.toLowerCase();
    const normalizedExact = normalizeHashtag(raw);

    const results: Array<{
      tag: string;
      displayTag: string;
      postCount: number;
      exists: boolean;
    }> = [];
    const seen = new Set<string>();

    if (prefix.length >= 1) {
      const upper = `${prefix}\uffff`;
      const ranged = await ctx.db
        .query("hashtags")
        .withIndex("by_tag", (q) => q.gte("tag", prefix).lt("tag", upper))
        .take(limit + 4);
      for (const row of ranged) {
        if (!row.tag.startsWith(prefix) || seen.has(row.tag)) continue;
        seen.add(row.tag);
        results.push({
          tag: row.tag,
          displayTag: row.displayTag,
          postCount: row.postCount,
          exists: true,
        });
        if (results.length >= limit) break;
      }
    } else {
      const popular = await ctx.db
        .query("hashtags")
        .withIndex("by_post_count")
        .order("desc")
        .take(limit);
      for (const row of popular) {
        if (seen.has(row.tag)) continue;
        seen.add(row.tag);
        results.push({
          tag: row.tag,
          displayTag: row.displayTag,
          postCount: row.postCount,
          exists: true,
        });
      }
    }

    if (normalizedExact && !seen.has(normalizedExact)) {
      results.unshift({
        tag: normalizedExact,
        displayTag: normalizedExact,
        postCount: 0,
        exists: false,
      });
      if (results.length > limit) results.length = limit;
    }

    return results.slice(0, limit);
  },
});

const peopleSuggestionReturn = v.object({
  username: v.string(),
  displayName: v.optional(v.string()),
  profileId: v.id("profiles"),
  avatarUrl: v.optional(v.string()),
});

/** Prefix autocomplete for @mentions of public profiles. */
export const suggestPeople = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(peopleSuggestionReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 8, 1), 20);
    const prefix = args.query.trim().replace(/^@+/, "").toLowerCase();
    if (!prefix) return [];

    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const upper = `${prefix}\uffff`;
    const ranged = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.gte("username", prefix).lt("username", upper))
      .take(limit + 8);

    const results: Array<{
      username: string;
      displayName?: string;
      profileId: Id<"profiles">;
      avatarUrl?: string;
    }> = [];
    for (const profile of ranged) {
      if (!profile.isPublic) continue;
      if (!profile.username.startsWith(prefix)) continue;
      let avatarUrl: string | undefined;
      if (profile.avatarAssetId) {
        const avatar = await ctx.db.get("assets", profile.avatarAssetId);
        avatarUrl = await signAvatarUrl(avatar, expiresUnix);
      }
      results.push({
        username: profile.username,
        displayName: profile.displayName?.trim() || undefined,
        profileId: profile._id,
        avatarUrl,
      });
      if (results.length >= limit) break;
    }
    return results;
  },
});
