/** Pure scoring helpers for the public profile feed. */

export type FeedMode = "forYou" | "following";

export type FeedEngagement = {
  likeCount: number;
  viewCount?: number;
  commentCount?: number;
  saveCount?: number;
};

/** Followed authors dominate For You unless discovery is much hotter. */
export const FOR_YOU_FOLLOW_BOOST = 5000;
export const SEED_BOOST = 100_000;

/** ~70% following / ~30% discovery when the viewer has follows. */
export const FOR_YOU_FOLLOWING_SHARE = 0.7;

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

export function scoreFeedPost(args: {
  mode: FeedMode;
  fromFollowing: boolean;
  isSeed: boolean;
  publishedAt: number;
  now: number;
  engagement: FeedEngagement;
}): number {
  const engagement = engagementScore(args.engagement);
  const recency = recencyScore(args.publishedAt, args.now);
  const seedBoost = args.isSeed ? SEED_BOOST : 0;

  if (args.mode === "following") {
    // Chronology first; light engagement as tie-break only.
    return seedBoost + recency * 20 + engagement * 0.15;
  }

  const followBoost = args.fromFollowing ? FOR_YOU_FOLLOW_BOOST : 0;
  return seedBoost + followBoost + engagement + recency;
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
