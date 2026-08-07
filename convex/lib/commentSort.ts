/** Shared comment list sort for posts + Academy. */
export const COMMENT_SORT_VALUES = [
  "newest",
  "oldest",
  "liked",
  "replies",
] as const;

export type CommentSort = (typeof COMMENT_SORT_VALUES)[number];

export function normalizeCommentSort(value: string | undefined): CommentSort {
  if (
    value === "oldest" ||
    value === "liked" ||
    value === "replies" ||
    value === "newest"
  ) {
    return value;
  }
  return "newest";
}

export function sortCommentRows<
  T extends {
    createdAt: number;
    likeCount?: number;
    replyCount?: number;
  },
>(rows: T[], sort: CommentSort): T[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "oldest") {
      return a.createdAt - b.createdAt;
    }
    if (sort === "liked") {
      const byLikes = (b.likeCount ?? 0) - (a.likeCount ?? 0);
      if (byLikes !== 0) return byLikes;
      return b.createdAt - a.createdAt;
    }
    if (sort === "replies") {
      const byReplies = (b.replyCount ?? 0) - (a.replyCount ?? 0);
      if (byReplies !== 0) return byReplies;
      return b.createdAt - a.createdAt;
    }
    return b.createdAt - a.createdAt;
  });
  return copy;
}

/** How many raw rows to scan before filtering top-level / sorting. */
export function commentSortFetchCap(sort: CommentSort, limit: number): number {
  if (sort === "liked" || sort === "replies") {
    return Math.min(Math.max(limit * 10, 200), 500);
  }
  return Math.min(Math.max(limit * 3 + 40, limit), 200);
}
