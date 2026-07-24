import { describe, expect, it } from "vitest";
import {
  FOR_YOU_FOLLOW_BOOST,
  forYouCandidateCap,
  identityScore,
  scoreFeedPost,
  TAG_SIGNAL_CAP,
} from "./feedRanking";

const now = Date.UTC(2026, 6, 17, 12, 0, 0);
const recent = now - 2 * 60 * 60 * 1000; // 2h ago

describe("scoreFeedPost forYou", () => {
  it("ranks a followed post above a similar non-followed post", () => {
    const engagement = { likeCount: 10, viewCount: 100, commentCount: 2, saveCount: 1 };
    const followed = scoreFeedPost({
      mode: "forYou",
      fromFollowing: true,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement,
    });
    const stranger = scoreFeedPost({
      mode: "forYou",
      fromFollowing: false,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement,
    });
    expect(followed - stranger).toBe(FOR_YOU_FOLLOW_BOOST);
    expect(followed).toBeGreaterThan(stranger);
  });

  it("lets a much hotter stranger beat a quiet followed post", () => {
    const quietFollowed = scoreFeedPost({
      mode: "forYou",
      fromFollowing: true,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement: { likeCount: 0, viewCount: 1 },
    });
    const viralStranger = scoreFeedPost({
      mode: "forYou",
      fromFollowing: false,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement: {
        likeCount: 800,
        viewCount: 5000,
        commentCount: 100,
        saveCount: 50,
      },
    });
    expect(viralStranger).toBeGreaterThan(quietFollowed);
  });

  it("pins seed above everything", () => {
    const seed = scoreFeedPost({
      mode: "forYou",
      fromFollowing: false,
      isSeed: true,
      publishedAt: recent,
      now,
      engagement: { likeCount: 0 },
    });
    const hotFollowed = scoreFeedPost({
      mode: "forYou",
      fromFollowing: true,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement: {
        likeCount: 800,
        viewCount: 5000,
        commentCount: 100,
        saveCount: 50,
      },
    });
    expect(seed).toBeGreaterThan(hotFollowed);
  });

  it("boosts matching hashtag affinity and creator consistency", () => {
    const engagement = { likeCount: 5, viewCount: 20 };
    const baseline = scoreFeedPost({
      mode: "forYou",
      fromFollowing: false,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement,
    });
    const withIdentity = scoreFeedPost({
      mode: "forYou",
      fromFollowing: false,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement,
      identity: {
        hashtagAffinity: 4,
        creatorConsistency: 20,
        keywordAffinity: 2,
      },
    });
    expect(withIdentity).toBeGreaterThan(baseline);
    expect(withIdentity - baseline).toBe(
      identityScore({
        hashtagAffinity: 4,
        creatorConsistency: 20,
        keywordAffinity: 2,
      }),
    );
  });

  it("caps identity so it cannot drown follow boost alone", () => {
    const huge = identityScore({
      hashtagAffinity: 10_000,
      creatorConsistency: 10_000,
      keywordAffinity: 10_000,
    });
    expect(huge).toBeLessThanOrEqual(TAG_SIGNAL_CAP);
    expect(huge).toBeLessThan(FOR_YOU_FOLLOW_BOOST);
  });

  it("ignores identity signals in following mode", () => {
    const engagement = { likeCount: 3 };
    const plain = scoreFeedPost({
      mode: "following",
      fromFollowing: true,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement,
    });
    const withIdentity = scoreFeedPost({
      mode: "following",
      fromFollowing: true,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement,
      identity: { hashtagAffinity: 50, creatorConsistency: 50, keywordAffinity: 50 },
    });
    expect(withIdentity).toBe(plain);
  });
});

describe("scoreFeedPost following", () => {
  it("does not apply the For You follow boost", () => {
    const followed = scoreFeedPost({
      mode: "following",
      fromFollowing: true,
      isSeed: false,
      publishedAt: recent,
      now,
      engagement: { likeCount: 5 },
    });
    const alsoFollowed = scoreFeedPost({
      mode: "following",
      fromFollowing: true,
      isSeed: false,
      publishedAt: recent - 60 * 60 * 1000,
      now,
      engagement: { likeCount: 5 },
    });
    // Newer wins primarily via recency; no flat follow boost.
    expect(followed).toBeGreaterThan(alsoFollowed);
    const withoutRecency = scoreFeedPost({
      mode: "following",
      fromFollowing: true,
      isSeed: false,
      publishedAt: now - 80 * 60 * 60 * 1000,
      now,
      engagement: { likeCount: 0 },
    });
    expect(withoutRecency).toBe(0);
  });
});

describe("forYouCandidateCap", () => {
  it("gives ~70% of the pool to following when follows exist", () => {
    const caps = forYouCandidateCap({
      followingCandidateCount: 80,
      totalCap: 90,
    });
    expect(caps.followingCap).toBe(Math.floor(90 * 0.7));
    expect(caps.discoveryCap).toBe(90 - caps.followingCap);
    expect(caps.followingCap / 90).toBeGreaterThanOrEqual(0.65);
  });

  it("uses the full pool for discovery when nobody is followed", () => {
    const caps = forYouCandidateCap({
      followingCandidateCount: 0,
      totalCap: 90,
    });
    expect(caps.followingCap).toBe(0);
    expect(caps.discoveryCap).toBe(90);
  });
});
