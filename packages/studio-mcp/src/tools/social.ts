/**
 * Studio social / feed / profiles MCP tools (Wave 2).
 *
 * Intended HTTP paths (Wave HTTP agent wires these to Convex *ForApi):
 *
 * Profiles
 *   GET    /profiles/me
 *   PATCH  /profiles/me
 *   GET    /profiles/:username
 *   GET    /profiles/username-available?username=
 *   POST   /profiles/claim-username          { username }
 *   POST   /profiles/change-username        { username }
 *
 * Feed / posts
 *   GET    /feed?mode=forYou|following&limit=&seedPostId=
 *   GET    /feed/posts?username=&limit=     (public profile grid)
 *   GET    /feed/collection?kind=saved|liked|shared
 *   POST   /feed/posts                      { assetId, caption?, hashtags?, postKind?, parentRequestPostId?, previewStartMs?, previewEndMs? }
 *   DELETE /feed/posts/by-asset/:assetId    unshare (?keepPurchasers=true for sold help answers)
 *   GET    /feed/help-requests              questions you can post value on
 *   GET    /feed/help-requests/:postId      one question context
 *   POST   /feed/posts/:postId/unlock       pay credits to unlock a help answer
 *   POST   /feed/unlocks/:unlockId/undo     undo unlock within 60s
 *   PATCH  /feed/posts/:postId              { caption? }  update caption
 *   GET    /feed/assets/:assetId/shared
 *   GET    /feed/shared-asset-ids
 *   GET    /feed/posts/:postId/media
 *   POST   /feed/posts/:postId/like
 *   POST   /feed/posts/:postId/save
 *   POST   /feed/posts/:postId/share        recordShare (engagement)
 *   POST   /feed/posts/:postId/view
 *
 * Comments
 *   GET    /feed/posts/:postId/comments
 *   GET    /feed/comments/:parentId/replies
 *   POST   /feed/posts/:postId/comments     { body, parentId?, imageAssetId? }
 *   POST   /feed/comments/:commentId/like
 *   DELETE /feed/comments/:commentId
 *
 * Follows / people
 *   POST   /profiles/:profileId/follow
 *   DELETE /profiles/:profileId/follow
 *   GET    /profiles/me/following
 *   GET    /profiles/people
 *
 * Suggest
 *   GET    /feed/suggest/hashtags?query=&limit=
 *   GET    /feed/suggest/people?query=&limit=
 *
 * Scope: social
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function registerSocialTools(server: McpServer) {
  server.tool(
    "studio_get_my_profile",
    "Get the authenticated API key owner's Studio public profile (username, bio, counts).",
    {},
    async () => jsonResult(await studioFetch("/profiles/me")),
  );

  server.tool(
    "studio_update_my_profile",
    "Update the owner's profile (bio, visibility, contact links, avatar, seller display name).",
    {
      useSellerDisplayName: z.boolean().optional(),
      bio: z.string().optional(),
      isPublic: z.boolean().optional(),
      contactLinks: z
        .array(
          z.object({
            type: z.enum(["website", "phone", "email", "other"]),
            label: z.string(),
            value: z.string(),
          }),
        )
        .optional(),
      avatarAssetId: z.string().nullable().optional(),
    },
    async (args) =>
      jsonResult(
        await studioFetch("/profiles/me", {
          method: "PATCH",
          body: JSON.stringify(args),
        }),
      ),
  );

  server.tool(
    "studio_get_profile",
    "Get a public profile by username (includes isFollowing / isOwner for the API key user).",
    { username: z.string() },
    async ({ username }) =>
      jsonResult(await studioFetch(`/profiles/${encodeURIComponent(username)}`)),
  );

  server.tool(
    "studio_check_username_available",
    "Check whether a username can be claimed/changed by the API key owner.",
    { username: z.string() },
    async ({ username }) =>
      jsonResult(
        await studioFetch(
          `/profiles/username-available${qs({ username })}`,
        ),
      ),
  );

  server.tool(
    "studio_claim_username",
    "Claim or set the owner's public username (creates profile if missing).",
    { username: z.string() },
    async ({ username }) =>
      jsonResult(
        await studioFetch("/profiles/claim-username", {
          method: "POST",
          body: JSON.stringify({ username }),
        }),
      ),
  );

  server.tool(
    "studio_change_username",
    "Rename the owner's public username (profile must already exist).",
    { username: z.string() },
    async ({ username }) =>
      jsonResult(
        await studioFetch("/profiles/change-username", {
          method: "POST",
          body: JSON.stringify({ username }),
        }),
      ),
  );

  server.tool(
    "studio_list_feed",
    "List ranked feed posts (forYou or following). Viewer like/save state included.",
    {
      mode: z.enum(["forYou", "following"]).optional(),
      limit: z.number().optional(),
      seedPostId: z.string().optional(),
    },
    async ({ mode, limit, seedPostId }) =>
      jsonResult(
        await studioFetch(
          `/feed${qs({ mode, limit, seedPostId })}`,
        ),
      ),
  );

  server.tool(
    "studio_list_public_posts",
    "List public posts for a username (profile grid).",
    {
      username: z.string(),
      limit: z.number().optional(),
    },
    async ({ username, limit }) =>
      jsonResult(
        await studioFetch(`/feed/posts${qs({ username, limit })}`),
      ),
  );

  server.tool(
    "studio_list_my_collection",
    "List the owner's saved, liked, or shared collection posts.",
    {
      kind: z.enum(["saved", "liked", "shared"]),
      limit: z.number().optional(),
    },
    async ({ kind, limit }) =>
      jsonResult(
        await studioFetch(`/feed/collection${qs({ kind, limit })}`),
      ),
  );

  server.tool(
    "studio_share_asset_post",
    "Publish owned media to the public profile. postKind: post (default), help_request (question), or help_answer (paid Value — needs a screen-recording video ≥1 min, previewStartMs/previewEndMs 10s–5min inside the recording, optional parentRequestPostId). Confirm with the user before publishing.",
    {
      assetId: z.string(),
      assetIds: z.array(z.string()).optional().describe("Extra media on the same post"),
      caption: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
      voiceAssetId: z.string().optional(),
      voiceDurationSec: z.number().optional(),
      postKind: z.enum(["post", "help_request", "help_answer"]).optional(),
      parentRequestPostId: z
        .string()
        .optional()
        .describe("Question postId when posting Value (help_answer)"),
      previewStartMs: z
        .number()
        .optional()
        .describe("help_answer free preview start (ms)"),
      previewEndMs: z
        .number()
        .optional()
        .describe("help_answer free preview end (ms); 10s–5min window"),
      recordingDurationMs: z.number().optional(),
    },
    async (args) =>
      jsonResult(
        await studioFetch("/feed/posts", {
          method: "POST",
          body: JSON.stringify(args),
        }),
      ),
  );

  server.tool(
    "studio_unshare_post",
    "Unshare a previously shared asset from the public profile (by assetId). For a sold help_answer, pass keepPurchasers=true to close new sales while buyers keep their copy.",
    {
      assetId: z.string(),
      keepPurchasers: z.boolean().optional(),
    },
    async ({ assetId, keepPurchasers }) =>
      jsonResult(
        await studioFetch(
          `/feed/posts/by-asset/${encodeURIComponent(assetId)}${qs({
            keepPurchasers: keepPurchasers ? "true" : undefined,
          })}`,
          { method: "DELETE" },
        ),
      ),
  );

  server.tool(
    "studio_list_help_requests",
    "List public Help questions you can post Value on (excludes your own). alreadyAnswered=true if you already posted Value on that question.",
    { limit: z.number().optional() },
    async ({ limit }) =>
      jsonResult(
        await studioFetch(`/feed/help-requests${qs({ limit })}`),
      ),
  );

  server.tool(
    "studio_get_help_request",
    "Get one Help question (username, caption, whether you already posted Value).",
    { postId: z.string() },
    async ({ postId }) =>
      jsonResult(
        await studioFetch(`/feed/help-requests/${encodeURIComponent(postId)}`),
      ),
  );

  server.tool(
    "studio_unlock_help_answer",
    "Spend credits to unlock a paid help_answer (TT$5 under 1h recording, TT$10 at 1h+). Returns unlockId + undoUntil (~60s). Confirm with the user first — this is a paid spend.",
    { postId: z.string() },
    async ({ postId }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}/unlock`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_undo_help_unlock",
    "Undo a help_answer unlock within ~60s (undoUntil from studio_unlock_help_answer). Refunds credits if still inside the window.",
    { unlockId: z.string() },
    async ({ unlockId }) =>
      jsonResult(
        await studioFetch(`/feed/unlocks/${encodeURIComponent(unlockId)}/undo`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_update_post_caption",
    "Update the caption/description on an owned published post.",
    {
      postId: z.string(),
      caption: z.string().optional(),
    },
    async ({ postId, caption }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}`, {
          method: "PATCH",
          body: JSON.stringify({ caption }),
        }),
      ),
  );

  server.tool(
    "studio_is_asset_shared",
    "Check whether an asset is currently shared on the owner's profile.",
    { assetId: z.string() },
    async ({ assetId }) =>
      jsonResult(
        await studioFetch(`/feed/assets/${encodeURIComponent(assetId)}/shared`),
      ),
  );

  server.tool(
    "studio_list_my_shared_asset_ids",
    "List asset IDs currently shared on the owner's public profile.",
    {},
    async () => jsonResult(await studioFetch("/feed/shared-asset-ids")),
  );

  server.tool(
    "studio_get_post_media",
    "Get signed thumbnail/media URLs for a public post.",
    { postId: z.string() },
    async ({ postId }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}/media`),
      ),
  );

  server.tool(
    "studio_toggle_like",
    "Toggle like on a public feed post.",
    { postId: z.string() },
    async ({ postId }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}/like`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_toggle_save",
    "Toggle save/bookmark on a public feed post.",
    { postId: z.string() },
    async ({ postId }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}/save`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_record_share",
    "Record a share engagement on a public feed post (bumps shareCount).",
    { postId: z.string() },
    async ({ postId }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}/share`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_record_post_view",
    "Record a view on a public feed post.",
    { postId: z.string() },
    async ({ postId }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}/view`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_list_comments",
    "List top-level comments on a public post.",
    {
      postId: z.string(),
      limit: z.number().optional(),
    },
    async ({ postId, limit }) =>
      jsonResult(
        await studioFetch(
          `/feed/posts/${encodeURIComponent(postId)}/comments${qs({ limit })}`,
        ),
      ),
  );

  server.tool(
    "studio_list_comment_replies",
    "List replies under a parent comment.",
    {
      parentId: z.string(),
      limit: z.number().optional(),
    },
    async ({ parentId, limit }) =>
      jsonResult(
        await studioFetch(
          `/feed/comments/${encodeURIComponent(parentId)}/replies${qs({ limit })}`,
        ),
      ),
  );

  server.tool(
    "studio_add_comment",
    "Add a comment (or reply) on a public post.",
    {
      postId: z.string(),
      body: z.string(),
      parentId: z.string().optional(),
      imageAssetId: z.string().optional(),
    },
    async ({ postId, body, parentId, imageAssetId }) =>
      jsonResult(
        await studioFetch(`/feed/posts/${encodeURIComponent(postId)}/comments`, {
          method: "POST",
          body: JSON.stringify({ body, parentId, imageAssetId }),
        }),
      ),
  );

  server.tool(
    "studio_toggle_comment_like",
    "Toggle like on a comment.",
    { commentId: z.string() },
    async ({ commentId }) =>
      jsonResult(
        await studioFetch(`/feed/comments/${encodeURIComponent(commentId)}/like`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_delete_comment",
    "Delete a comment (author or post owner).",
    { commentId: z.string() },
    async ({ commentId }) =>
      jsonResult(
        await studioFetch(`/feed/comments/${encodeURIComponent(commentId)}`, {
          method: "DELETE",
        }),
      ),
  );

  server.tool(
    "studio_follow",
    "Follow a public profile by profileId.",
    { profileId: z.string() },
    async ({ profileId }) =>
      jsonResult(
        await studioFetch(`/profiles/${encodeURIComponent(profileId)}/follow`, {
          method: "POST",
        }),
      ),
  );

  server.tool(
    "studio_unfollow",
    "Unfollow a public profile by profileId.",
    { profileId: z.string() },
    async ({ profileId }) =>
      jsonResult(
        await studioFetch(`/profiles/${encodeURIComponent(profileId)}/follow`, {
          method: "DELETE",
        }),
      ),
  );

  server.tool(
    "studio_list_my_following",
    "List profiles the API key owner follows.",
    { limit: z.number().optional() },
    async ({ limit }) =>
      jsonResult(
        await studioFetch(`/profiles/me/following${qs({ limit })}`),
      ),
  );

  server.tool(
    "studio_list_platform_people",
    "List public profiles the owner does not follow (people directory).",
    { limit: z.number().optional() },
    async ({ limit }) =>
      jsonResult(await studioFetch(`/profiles/people${qs({ limit })}`)),
  );

  server.tool(
    "studio_suggest_hashtags",
    "Autocomplete hashtag suggestions for captions.",
    {
      query: z.string(),
      limit: z.number().optional(),
    },
    async ({ query, limit }) =>
      jsonResult(
        await studioFetch(`/feed/suggest/hashtags${qs({ query, limit })}`),
      ),
  );

  server.tool(
    "studio_suggest_people",
    "Autocomplete @mention people suggestions.",
    {
      query: z.string(),
      limit: z.number().optional(),
    },
    async ({ query, limit }) =>
      jsonResult(
        await studioFetch(`/feed/suggest/people${qs({ query, limit })}`),
      ),
  );
}
