/** Pure scoring helpers for the public profile feed. */

export type FeedMode = "forYou" | "following";

export type FeedEngagement = {
  likeCount: number;
  viewCount?: number;
  commentCount?: number;
  saveCount?: number;
};

export type FeedIdentitySignals = {
  /** Sum of viewer affinities for overlapping hashtags. */
  hashtagAffinity?: number;
  /** Sum of creator consistency scores on overlapping tags. */
  creatorConsistency?: number;
  /** Sum of viewer keyword affinities for overlapping keywords. */
  keywordAffinity?: number;
};

/** Followed authors dominate For You unless discovery is much hotter. */
export const FOR_YOU_FOLLOW_BOOST = 5000;
export const SEED_BOOST = 100_000;

/** ~70% following / ~30% discovery when the viewer has follows. */
export const FOR_YOU_FOLLOWING_SHARE = 0.7;

/** Caps so tag/keyword identity cannot drown follow boost. */
export const AFFINITY_SIGNAL_CAP = 800;
export const CONSISTENCY_SIGNAL_CAP = 400;
export const KEYWORD_SIGNAL_CAP = 200;
export const TAG_SIGNAL_CAP = 1200;

export function engagementScore(post: FeedEngagement): number {
  return (
    post.likeCount * 8 +
    (post.commentCount ?? 0) * 12 +
    (post.saveCount ?? 0) * 10 +
    (post.viewCount ?? 0) * 1.2
  );
}

export function recencyScore(publishedAt: number, now: number): number {
  const ageHours = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));
  return Math.max(0, 72 - ageHours) * 4;
}

/** Additive identity boost from hashtag affinity + creator consistency + keywords. */
export function identityScore(signals?: FeedIdentitySignals): number {
  if (!signals) return 0;
  const affinity = Math.min(AFFINITY_SIGNAL_CAP, Math.max(0, signals.hashtagAffinity ?? 0) * 18);
  const consistency = Math.min(
    CONSISTENCY_SIGNAL_CAP,
    Math.max(0, signals.creatorConsistency ?? 0) * 6,
  );
  const keywords = Math.min(KEYWORD_SIGNAL_CAP, Math.max(0, signals.keywordAffinity ?? 0) * 14);
  return Math.min(TAG_SIGNAL_CAP, affinity + consistency + keywords);
}

export function scoreFeedPost(args: {
  mode: FeedMode;
  fromFollowing: boolean;
  isSeed: boolean;
  publishedAt: number;
  now: number;
  engagement: FeedEngagement;
  identity?: FeedIdentitySignals;
}): number {
  const engagement = engagementScore(args.engagement);
  const recency = recencyScore(args.publishedAt, args.now);
  const seedBoost = args.isSeed ? SEED_BOOST : 0;
  const identity = args.mode === "forYou" ? identityScore(args.identity) : 0;

  if (args.mode === "following") {
    // Chronology first; light engagement as tie-break only.
    return seedBoost + recency * 20 + engagement * 0.15;
  }

  const followBoost = args.fromFollowing ? FOR_YOU_FOLLOW_BOOST : 0;
  return seedBoost + followBoost + engagement + recency + identity;
}

/**
 * Cap discovery candidates so followed posts keep ~70% of the pool when
 * the viewer follows anyone.
 */
export function forYouCandidateCap(args: {
  followingCandidateCount: number;
  totalCap: number;
}): { followingCap: number; discoveryCap: number } {
  if (args.followingCandidateCount <= 0) {
    return { followingCap: 0, discoveryCap: args.totalCap };
  }
  const followingCap = Math.min(
    args.followingCandidateCount,
    Math.max(1, Math.floor(args.totalCap * FOR_YOU_FOLLOWING_SHARE)),
  );
  const discoveryCap = Math.max(0, args.totalCap - followingCap);
  return { followingCap, discoveryCap };
}
