import { describe, expect, it } from "vitest";
import {
  FOR_YOU_FOLLOW_BOOST,
  forYouCandidateCap,
  scoreFeedPost,
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
