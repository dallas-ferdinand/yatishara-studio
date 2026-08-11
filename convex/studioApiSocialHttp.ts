/**
 * Wave 2 — Social feed + profiles HTTP surface.
 * Scope: social (user-level; not sandbox-limited).
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import {
  authenticateStudioRequest,
  type StudioHttpAuth,
} from "./lib/studioApi/requestAuth";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseOptionalId,
  readJsonBody,
  signedUrlExpiryUnix,
} from "./lib/studioApi/httpHelpers";

type AuthContext = Pick<StudioHttpAuth, "userId" | "apiKeyId" | "scopes">;

async function authenticateRequest(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  requiredScope?: string,
): Promise<AuthContext | Response> {
  const auth = await authenticateStudioRequest(ctx, request, requiredScope);
  if (auth instanceof Response) return auth;
  return {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    scopes: auth.scopes,
  };
}

function routePath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
}

function asId<T extends TableNames>(_table: T, value: string): Id<T> {
  return value as Id<T>;
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const studioApiSocial = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  const started = Date.now();
  const url = new URL(request.url);
  const route = routePath(url.pathname);
  const expiresUnix =
    parseOptionalNumber(url.searchParams.get("expiresUnix")) ??
    signedUrlExpiryUnix();
  let audit: { apiKeyId: Id<"apiKeys">; userId: Id<"users"> } | null = null;

  const finish = async (response: Response) => {
    if (audit) {
      await ctx
        .runMutation(internal.studioApiInternal.logApiRequest, {
          apiKeyId: audit.apiKeyId,
          userId: audit.userId,
          method: request.method,
          route: `/api/v1/${route}`,
          status: response.status,
          latencyMs: Date.now() - started,
        })
        .catch(() => {});
    }
    return response;
  };

  const authFor = async (scope: string): Promise<AuthContext | Response> => {
    const auth = await authenticateRequest(ctx, request, scope);
    if (!(auth instanceof Response)) {
      audit = { apiKeyId: auth.apiKeyId, userId: auth.userId };
    }
    return auth;
  };

  try {
    if (!route.startsWith("feed") && !route.startsWith("profiles")) {
      return finish(errorResponse("Not found", 404));
    }

    // —— Profiles ——

    if (request.method === "GET" && route === "profiles/me") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const profile = await ctx.runQuery(internal.profiles.getMineForApi, {
        userId: auth.userId,
        expiresUnix,
      });
      return finish(jsonResponse({ profile }));
    }

    if (request.method === "PATCH" && route === "profiles/me") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        useSellerDisplayName?: boolean;
        bio?: string;
        isPublic?: boolean;
        contactLinks?: Array<{
          type: "email" | "phone" | "website" | "other";
          label: string;
          value: string;
        }>;
        avatarAssetId?: string | null;
      }>(request);
      const result = await ctx.runMutation(internal.profiles.updateMineForApi, {
        userId: auth.userId,
        useSellerDisplayName: body.useSellerDisplayName,
        bio: body.bio,
        isPublic: body.isPublic,
        contactLinks: body.contactLinks,
        avatarAssetId:
          body.avatarAssetId === null
            ? null
            : body.avatarAssetId
              ? asId("assets", body.avatarAssetId)
              : undefined,
      });
      return finish(jsonResponse(result));
    }

    if (request.method === "GET" && route === "profiles/username-available") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const username = url.searchParams.get("username") ?? "";
      const result = await ctx.runQuery(
        internal.profiles.checkUsernameAvailableForApi,
        { userId: auth.userId, username },
      );
      return finish(jsonResponse(result));
    }

    if (request.method === "POST" && route === "profiles/claim-username") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ username?: string }>(request);
      if (!body.username) {
        return finish(errorResponse("username is required", 400));
      }
      const result = await ctx.runMutation(internal.profiles.claimUsernameForApi, {
        userId: auth.userId,
        username: body.username,
      });
      return finish(jsonResponse(result));
    }

    if (request.method === "POST" && route === "profiles/change-username") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ username?: string }>(request);
      if (!body.username) {
        return finish(errorResponse("username is required", 400));
      }
      const result = await ctx.runMutation(
        internal.profiles.changeUsernameForApi,
        { userId: auth.userId, username: body.username },
      );
      return finish(jsonResponse(result));
    }

    if (request.method === "GET" && route === "profiles/me/following") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const people = await ctx.runQuery(internal.profiles.listMyFollowingForApi, {
        userId: auth.userId,
        limit: parseOptionalNumber(url.searchParams.get("limit")),
        expiresUnix,
      });
      return finish(jsonResponse({ people }));
    }

    if (request.method === "GET" && route === "profiles/people") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const people = await ctx.runQuery(
        internal.profiles.listPlatformPeopleForApi,
        {
          userId: auth.userId,
          limit: parseOptionalNumber(url.searchParams.get("limit")),
          expiresUnix,
        },
      );
      return finish(jsonResponse({ people }));
    }

    const followMatch = route.match(/^profiles\/([^/]+)\/follow$/);
    if (followMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const profileId = asId("profiles", followMatch[1]!);
      if (request.method === "POST") {
        const result = await ctx.runMutation(internal.profiles.followForApi, {
          userId: auth.userId,
          profileId,
        });
        return finish(jsonResponse(result));
      }
      if (request.method === "DELETE") {
        const result = await ctx.runMutation(internal.profiles.unfollowForApi, {
          userId: auth.userId,
          profileId,
        });
        return finish(jsonResponse(result));
      }
    }

    if (request.method === "GET" && route.startsWith("profiles/")) {
      const reserved = new Set([
        "me",
        "username-available",
        "claim-username",
        "change-username",
        "people",
      ]);
      const username = route.slice("profiles/".length);
      if (username && !username.includes("/") && !reserved.has(username)) {
        const auth = await authFor("social");
        if (auth instanceof Response) return finish(auth);
        const profile = await ctx.runQuery(
          internal.profiles.getPublicByUsernameForApi,
          { userId: auth.userId, username, expiresUnix },
        );
        if (!profile) {
          return finish(errorResponse("Profile not found", 404));
        }
        return finish(jsonResponse({ profile }));
      }
    }

    // —— Feed ——

    if (request.method === "GET" && route === "feed") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const modeRaw = url.searchParams.get("mode");
      const mode =
        modeRaw === "forYou" || modeRaw === "following" ? modeRaw : undefined;
      const seedPostId = parseOptionalId(url.searchParams.get("seedPostId"));
      const posts = await ctx.runQuery(internal.profiles.listFeedForApi, {
        userId: auth.userId,
        expiresUnix,
        limit: parseOptionalNumber(url.searchParams.get("limit")),
        seedPostId: seedPostId
          ? asId("profilePosts", seedPostId)
          : undefined,
        mode,
      });
      return finish(jsonResponse({ posts }));
    }

    if (request.method === "GET" && route === "feed/posts") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const username = url.searchParams.get("username") ?? "";
      if (!username) {
        return finish(errorResponse("username is required", 400));
      }
      const posts = await ctx.runQuery(internal.profiles.listPublicPostsForApi, {
        userId: auth.userId,
        username,
        expiresUnix,
        limit: parseOptionalNumber(url.searchParams.get("limit")),
      });
      return finish(jsonResponse({ posts }));
    }

    if (request.method === "POST" && route === "feed/posts") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        assetId?: string;
        caption?: string;
        hashtags?: string[];
        keywords?: string[];
      }>(request);
      if (!body.assetId) {
        return finish(errorResponse("assetId is required", 400));
      }
      const result = await ctx.runMutation(internal.profiles.shareAssetForApi, {
        userId: auth.userId,
        assetId: asId("assets", body.assetId),
        caption: body.caption,
        hashtags: body.hashtags,
        keywords: body.keywords,
      });
      return finish(jsonResponse(result));
    }

    if (request.method === "GET" && route === "feed/collection") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const kind = url.searchParams.get("kind");
      if (kind !== "saved" && kind !== "liked" && kind !== "shared") {
        return finish(
          errorResponse("kind must be saved, liked, or shared", 400),
        );
      }
      const posts = await ctx.runQuery(internal.profiles.listMyCollectionForApi, {
        userId: auth.userId,
        kind,
        expiresUnix,
        limit: parseOptionalNumber(url.searchParams.get("limit")),
      });
      return finish(jsonResponse({ posts }));
    }

    const unshareMatch = route.match(/^feed\/posts\/by-asset\/([^/]+)$/);
    if (request.method === "DELETE" && unshareMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      await ctx.runMutation(internal.profiles.unshareAssetForApi, {
        userId: auth.userId,
        assetId: asId("assets", unshareMatch[1]!),
      });
      return finish(jsonResponse({ ok: true }));
    }

    const sharedAssetMatch = route.match(/^feed\/assets\/([^/]+)\/shared$/);
    if (request.method === "GET" && sharedAssetMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const result = await ctx.runQuery(internal.profiles.isAssetSharedForApi, {
        userId: auth.userId,
        assetId: asId("assets", sharedAssetMatch[1]!),
      });
      return finish(jsonResponse(result));
    }

    if (request.method === "GET" && route === "feed/shared-asset-ids") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const result = await ctx.runQuery(
        internal.profiles.listMySharedAssetIdsForApi,
        { userId: auth.userId },
      );
      return finish(jsonResponse(result));
    }

    if (request.method === "GET" && route === "feed/suggest/hashtags") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const suggestions = await ctx.runQuery(
        internal.hashtags.suggestHashtagsForApi,
        {
          userId: auth.userId,
          query: url.searchParams.get("query") ?? "",
          limit: parseOptionalNumber(url.searchParams.get("limit")),
        },
      );
      return finish(jsonResponse({ suggestions }));
    }

    if (request.method === "GET" && route === "feed/suggest/people") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const suggestions = await ctx.runQuery(
        internal.hashtags.suggestPeopleForApi,
        {
          userId: auth.userId,
          query: url.searchParams.get("query") ?? "",
          limit: parseOptionalNumber(url.searchParams.get("limit")),
          expiresUnix,
        },
      );
      return finish(jsonResponse({ suggestions }));
    }

    const commentRepliesMatch = route.match(
      /^feed\/comments\/([^/]+)\/replies$/,
    );
    if (request.method === "GET" && commentRepliesMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const comments = await ctx.runQuery(
        internal.profiles.listCommentRepliesForApi,
        {
          userId: auth.userId,
          parentId: asId("profileComments", commentRepliesMatch[1]!),
          expiresUnix,
          limit: parseOptionalNumber(url.searchParams.get("limit")),
        },
      );
      return finish(jsonResponse({ comments }));
    }

    const commentLikeMatch = route.match(/^feed\/comments\/([^/]+)\/like$/);
    if (request.method === "POST" && commentLikeMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const result = await ctx.runMutation(
        internal.profiles.toggleCommentLikeForApi,
        {
          userId: auth.userId,
          commentId: asId("profileComments", commentLikeMatch[1]!),
        },
      );
      return finish(jsonResponse(result));
    }

    const commentDeleteMatch = route.match(/^feed\/comments\/([^/]+)$/);
    if (request.method === "DELETE" && commentDeleteMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const result = await ctx.runMutation(internal.profiles.deleteCommentForApi, {
        userId: auth.userId,
        commentId: asId("profileComments", commentDeleteMatch[1]!),
      });
      return finish(jsonResponse(result));
    }

    const postActionMatch = route.match(
      /^feed\/posts\/([^/]+)\/(like|save|share|view|comments|media)$/,
    );
    if (postActionMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const postId = asId("profilePosts", postActionMatch[1]!);
      const action = postActionMatch[2]!;

      if (action === "media" && request.method === "GET") {
        const media = await ctx.runQuery(
          internal.profiles.getPublicPostMediaForApi,
          { userId: auth.userId, postId, expiresUnix },
        );
        if (!media) {
          return finish(errorResponse("Post media not found", 404));
        }
        return finish(jsonResponse({ media }));
      }

      if (action === "like" && request.method === "POST") {
        const result = await ctx.runMutation(internal.profiles.toggleLikeForApi, {
          userId: auth.userId,
          postId,
        });
        return finish(jsonResponse(result));
      }

      if (action === "save" && request.method === "POST") {
        const result = await ctx.runMutation(internal.profiles.toggleSaveForApi, {
          userId: auth.userId,
          postId,
        });
        return finish(jsonResponse(result));
      }

      if (action === "share" && request.method === "POST") {
        const result = await ctx.runMutation(
          internal.profiles.recordShareForApi,
          { userId: auth.userId, postId },
        );
        return finish(jsonResponse(result));
      }

      if (action === "view" && request.method === "POST") {
        const result = await ctx.runMutation(
          internal.profiles.recordPostViewForApi,
          { userId: auth.userId, postId },
        );
        return finish(jsonResponse(result));
      }

      if (action === "comments" && request.method === "GET") {
        const comments = await ctx.runQuery(
          internal.profiles.listCommentsForApi,
          {
            userId: auth.userId,
            postId,
            expiresUnix,
            limit: parseOptionalNumber(url.searchParams.get("limit")),
          },
        );
        return finish(jsonResponse({ comments }));
      }

      if (action === "comments" && request.method === "POST") {
        const body = await readJsonBody<{
          body?: string;
          parentId?: string;
          imageAssetId?: string;
        }>(request);
        if (typeof body.body !== "string") {
          return finish(errorResponse("body is required", 400));
        }
        const result = await ctx.runMutation(internal.profiles.addCommentForApi, {
          userId: auth.userId,
          postId,
          body: body.body,
          parentId: body.parentId
            ? asId("profileComments", body.parentId)
            : undefined,
          imageAssetId: body.imageAssetId
            ? asId("assets", body.imageAssetId)
            : undefined,
        });
        return finish(jsonResponse(result));
      }
    }

    const postPatchMatch = route.match(/^feed\/posts\/([^/]+)$/);
    if (request.method === "PATCH" && postPatchMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ caption?: string }>(request);
      const result = await ctx.runMutation(
        internal.profiles.updatePostCaptionForApi,
        {
          userId: auth.userId,
          postId: asId("profilePosts", postPatchMatch[1]!),
          caption: body.caption,
        },
      );
      return finish(jsonResponse(result));
    }

    return finish(errorResponse("Not found", 404));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status =
      /not found|unauthorized|cannot|required|invalid|taken|empty|fewer|must/i.test(
        message,
      )
        ? message.toLowerCase().includes("not found")
          ? 404
          : 400
        : 500;
    return finish(errorResponse(message, status));
  }
});

export const studioApiSocialOptions = httpAction(async () => optionsResponse());
