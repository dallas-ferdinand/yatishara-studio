/**
 * Extra Studio HTTP API routes that are not sandbox-scoped (messages, and later
 * social / marketplace). Keep studioApiHttp.ts focused on workspace/generation.
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { hashApiKey } from "./lib/studioApi/crypto";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseBearerToken,
  parseOptionalId,
  readJsonBody,
  signedUrlExpiryUnix,
} from "./lib/studioApi/httpHelpers";

type AuthContext = {
  userId: Id<"users">;
  apiKeyId: Id<"apiKeys">;
  scopes: Set<string>;
};

async function authenticateRequest(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  requiredScope?: string,
): Promise<AuthContext | Response> {
  const token = parseBearerToken(request);
  if (!token) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }
  const keyHash = await hashApiKey(token);
  const auth = await ctx.runQuery(internal.studioApiInternal.authenticateApiKey, {
    keyHash,
  });
  if (!auth) {
    return errorResponse("Invalid or revoked API key", 401);
  }
  const scopes = new Set<string>(auth.scopes);
  if (requiredScope && !scopes.has(requiredScope)) {
    return errorResponse(`Missing required scope: ${requiredScope}`, 403);
  }
  await ctx.runMutation(internal.studioApiInternal.touchApiKeyLastUsed, {
    apiKeyId: auth.apiKeyId,
  });
  return {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    scopes,
  };
}

function routePath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
}

function asId<T extends TableNames>(_table: T, value: string): Id<T> {
  return value as Id<T>;
}

export const studioApiExtra = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  const started = Date.now();
  const url = new URL(request.url);
  const route = routePath(url.pathname);
  const expiresUnix = signedUrlExpiryUnix();
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
    if (!route.startsWith("messages")) {
      return finish(errorResponse("Not found", 404));
    }

    // GET /messages/conversations
    if (request.method === "GET" && route === "messages/conversations") {
      const auth = await authFor("messages");
      if (auth instanceof Response) return finish(auth);
      const labelId = parseOptionalId(url.searchParams.get("labelId"));
      const conversations = await ctx.runQuery(
        internal.dms.listMyConversationsForApi,
        {
          userId: auth.userId,
          expiresUnix,
          ...(labelId ? { labelId: asId("dmLabels", labelId) } : {}),
        },
      );
      return finish(jsonResponse({ conversations }));
    }

    // POST /messages/conversations
    if (request.method === "POST" && route === "messages/conversations") {
      const auth = await authFor("messages");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ username?: string }>(request);
      if (!body.username || typeof body.username !== "string") {
        return finish(errorResponse("username is required", 400));
      }
      const result = await ctx.runMutation(internal.dms.openConversationForApi, {
        userId: auth.userId,
        username: body.username,
      });
      return finish(jsonResponse(result));
    }

    // GET /messages/search?q=
    if (request.method === "GET" && route === "messages/search") {
      const auth = await authFor("messages");
      if (auth instanceof Response) return finish(auth);
      const q = url.searchParams.get("q") ?? "";
      const result = await ctx.runQuery(internal.dms.searchSidebarForApi, {
        userId: auth.userId,
        query: q,
        expiresUnix,
        now: Date.now(),
      });
      return finish(jsonResponse(result));
    }

    // GET /messages/unread-count
    if (request.method === "GET" && route === "messages/unread-count") {
      const auth = await authFor("messages");
      if (auth instanceof Response) return finish(auth);
      const count = await ctx.runQuery(
        internal.dms.unreadConversationCountForApi,
        { userId: auth.userId },
      );
      return finish(jsonResponse({ count }));
    }

    // GET /messages/labels
    if (request.method === "GET" && route === "messages/labels") {
      const auth = await authFor("messages");
      if (auth instanceof Response) return finish(auth);
      const labels = await ctx.runQuery(internal.dmLabels.listMineForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ labels }));
    }

    // POST /messages/labels
    if (request.method === "POST" && route === "messages/labels") {
      const auth = await authFor("messages");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ name?: string; icon?: string }>(request);
      if (!body.name || typeof body.name !== "string") {
        return finish(errorResponse("name is required", 400));
      }
      if (!body.icon || typeof body.icon !== "string") {
        return finish(errorResponse("icon is required", 400));
      }
      const labelId = await ctx.runMutation(internal.dmLabels.createForApi, {
        userId: auth.userId,
        name: body.name,
        icon: body.icon,
      });
      return finish(jsonResponse({ labelId }));
    }

    // PATCH|DELETE /messages/labels/:id
    {
      const labelMatch = /^messages\/labels\/([^/]+)$/.exec(route);
      if (labelMatch) {
        const labelId = asId("dmLabels", labelMatch[1]!);
        if (request.method === "PATCH") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{ name?: string; icon?: string }>(
            request,
          );
          await ctx.runMutation(internal.dmLabels.updateForApi, {
            userId: auth.userId,
            labelId,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.icon !== undefined ? { icon: body.icon } : {}),
          });
          return finish(jsonResponse({ ok: true }));
        }
        if (request.method === "DELETE") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          await ctx.runMutation(internal.dmLabels.removeForApi, {
            userId: auth.userId,
            labelId,
          });
          return finish(jsonResponse({ ok: true }));
        }
      }
    }

    // PATCH|DELETE /messages/notes/:id
    {
      const noteMatch = /^messages\/notes\/([^/]+)$/.exec(route);
      if (noteMatch) {
        const noteId = asId("dmPeerNotes", noteMatch[1]!);
        if (request.method === "PATCH") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{ body?: string }>(request);
          if (!body.body || typeof body.body !== "string") {
            return finish(errorResponse("body is required", 400));
          }
          await ctx.runMutation(internal.dmPeerPanel.updateNoteForApi, {
            userId: auth.userId,
            noteId,
            body: body.body,
          });
          return finish(jsonResponse({ ok: true }));
        }
        if (request.method === "DELETE") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          await ctx.runMutation(internal.dmPeerPanel.deleteNoteForApi, {
            userId: auth.userId,
            noteId,
          });
          return finish(jsonResponse({ ok: true }));
        }
      }
    }

    // Conversation sub-routes: /messages/conversations/:id/...
    {
      const convMatch =
        /^messages\/conversations\/([^/]+)(?:\/(messages|images|voice|media|share|read))?$/.exec(
          route,
        );
      if (convMatch) {
        const conversationId = asId("dmConversations", convMatch[1]!);
        const action = convMatch[2];

        if (request.method === "GET" && action === "messages") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const limitRaw = url.searchParams.get("limit");
          const limit = limitRaw ? Number(limitRaw) : undefined;
          const messages = await ctx.runQuery(internal.dms.listMessagesForApi, {
            userId: auth.userId,
            conversationId,
            expiresUnix,
            ...(limit !== undefined && Number.isFinite(limit)
              ? { limit }
              : {}),
          });
          return finish(jsonResponse({ messages }));
        }

        if (request.method === "POST" && action === "messages") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{
            body?: string;
            replyToMessageId?: string;
          }>(request);
          if (!body.body || typeof body.body !== "string") {
            return finish(errorResponse("body is required", 400));
          }
          const messageId = await ctx.runMutation(
            internal.dms.sendMessageForApi,
            {
              userId: auth.userId,
              conversationId,
              body: body.body,
              ...(body.replyToMessageId
                ? {
                    replyToMessageId: asId("dmMessages", body.replyToMessageId),
                  }
                : {}),
            },
          );
          return finish(jsonResponse({ messageId }));
        }

        if (request.method === "POST" && action === "images") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{
            assetId?: string;
            caption?: string;
            replyToMessageId?: string;
          }>(request);
          if (!body.assetId || typeof body.assetId !== "string") {
            return finish(errorResponse("assetId is required", 400));
          }
          const messageId = await ctx.runMutation(
            internal.dms.sendImageMessageForApi,
            {
              userId: auth.userId,
              conversationId,
              assetId: asId("assets", body.assetId),
              ...(body.caption !== undefined ? { caption: body.caption } : {}),
              ...(body.replyToMessageId
                ? {
                    replyToMessageId: asId("dmMessages", body.replyToMessageId),
                  }
                : {}),
            },
          );
          return finish(jsonResponse({ messageId }));
        }


        if (request.method === "POST" && action === "voice") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{
            assetId?: string;
            durationSec?: number;
            replyToMessageId?: string;
          }>(request);
          if (!body.assetId || typeof body.assetId !== "string") {
            return finish(errorResponse("assetId is required", 400));
          }
          if (typeof body.durationSec !== "number") {
            return finish(errorResponse("durationSec is required", 400));
          }
          const messageId = await ctx.runMutation(
            internal.dms.sendVoiceMessageForApi,
            {
              userId: auth.userId,
              conversationId,
              assetId: asId("assets", body.assetId),
              durationSec: body.durationSec,
              ...(body.replyToMessageId
                ? {
                    replyToMessageId: asId("dmMessages", body.replyToMessageId),
                  }
                : {}),
            },
          );
          return finish(jsonResponse({ messageId }));
        }

        // UI Choose/Share parity: send Studio media into DM. Default delivery=file
        // copies into the peer's Messages folder (video/image bubbles).
        if (request.method === "POST" && action === "media") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{
            assetId?: string;
            assetIds?: string[];
            items?: Array<{ itemKind?: string; itemId?: string }>;
            note?: string;
            delivery?: string;
            permission?: string;
          }>(request);

          const items: Array<{ itemKind: string; itemId: string }> = [];
          if (Array.isArray(body.items)) {
            for (const item of body.items) {
              if (
                item &&
                typeof item.itemKind === "string" &&
                typeof item.itemId === "string"
              ) {
                items.push({ itemKind: item.itemKind, itemId: item.itemId });
              }
            }
          }
          const assetIds = [
            ...(typeof body.assetId === "string" ? [body.assetId] : []),
            ...(Array.isArray(body.assetIds)
              ? body.assetIds.filter((id): id is string => typeof id === "string")
              : []),
          ];
          for (const assetId of assetIds) {
            items.push({ itemKind: "asset", itemId: assetId });
          }
          if (items.length === 0) {
            return finish(
              errorResponse("assetId, assetIds, or items is required", 400),
            );
          }

          const delivery =
            body.delivery === "access" || body.delivery === "file"
              ? body.delivery
              : "file";
          const permission =
            body.permission === "edit" || body.permission === "view"
              ? body.permission
              : "view";

          const result = await ctx.runMutation(
            internal.studioShares.shareItemsForApi,
            {
              userId: auth.userId,
              conversationId,
              items: items.map((item) => ({
                itemKind: item.itemKind as
                  | "asset"
                  | "document"
                  | "element"
                  | "videoEdit"
                  | "folder",
                itemId: item.itemId,
              })),
              delivery,
              permission,
              ...(typeof body.note === "string" ? { note: body.note } : {}),
            },
          );
          return finish(jsonResponse(result));
        }

        if (request.method === "POST" && action === "share") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{
            postId?: string;
            commentId?: string;
            note?: string;
          }>(request);
          if (!body.postId || typeof body.postId !== "string") {
            return finish(errorResponse("postId is required", 400));
          }
          const messageId = await ctx.runMutation(
            internal.dms.sendFeedShareForApi,
            {
              userId: auth.userId,
              conversationId,
              postId: asId("profilePosts", body.postId),
              ...(body.commentId
                ? { commentId: asId("profileComments", body.commentId) }
                : {}),
              ...(body.note !== undefined ? { note: body.note } : {}),
            },
          );
          return finish(jsonResponse({ messageId }));
        }

        if (request.method === "POST" && action === "read") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          await ctx.runMutation(internal.dms.markReadForApi, {
            userId: auth.userId,
            conversationId,
          });
          return finish(jsonResponse({ ok: true }));
        }
      }
    }


    // Message-level routes: /messages/messages/:id (+ /delete)
    {
      const msgMatch = /^messages\/messages\/([^/]+)(?:\/(delete))?$/.exec(route);
      if (msgMatch) {
        const messageId = asId("dmMessages", msgMatch[1]!);
        const action = msgMatch[2];

        if (request.method === "PATCH" && !action) {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{ body?: string }>(request);
          if (typeof body.body !== "string") {
            return finish(errorResponse("body is required", 400));
          }
          await ctx.runMutation(internal.dms.editMessageForApi, {
            userId: auth.userId,
            messageId,
            body: body.body,
          });
          return finish(jsonResponse({ ok: true }));
        }

        if (request.method === "POST" && action === "delete") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{ scope?: string }>(request);
          const scope = body.scope === "everyone" ? "everyone" : "me";
          if (scope === "everyone") {
            await ctx.runMutation(internal.dms.deleteMessageForEveryoneForApi, {
              userId: auth.userId,
              messageId,
            });
          } else {
            await ctx.runMutation(internal.dms.deleteMessageForMeForApi, {
              userId: auth.userId,
              messageId,
            });
          }
          return finish(jsonResponse({ ok: true, scope }));
        }
      }
    }

    // Peer routes: /messages/peers/:userId/...
    {
      const peerMatch =
        /^messages\/peers\/([^/]+)(?:\/(labels|panel|notes|block|unblock))?$/.exec(
          route,
        );
      if (peerMatch) {
        const peerUserId = asId("users", peerMatch[1]!);
        const action = peerMatch[2];

        if (request.method === "GET" && action === "labels") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const labels = await ctx.runQuery(internal.dmLabels.listForPeerForApi, {
            userId: auth.userId,
            peerUserId,
          });
          return finish(jsonResponse({ labels }));
        }

        if (request.method === "PUT" && action === "labels") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{ labelIds?: string[] }>(request);
          if (!Array.isArray(body.labelIds)) {
            return finish(errorResponse("labelIds array is required", 400));
          }
          await ctx.runMutation(internal.dmLabels.setPeerLabelsForApi, {
            userId: auth.userId,
            peerUserId,
            labelIds: body.labelIds.map((id) => asId("dmLabels", id)),
          });
          return finish(jsonResponse({ ok: true }));
        }

        if (request.method === "GET" && action === "panel") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const panel = await ctx.runQuery(internal.dmPeerPanel.peerPanelForApi, {
            userId: auth.userId,
            peerUserId,
            expiresUnix,
          });
          return finish(jsonResponse({ panel }));
        }

        if (request.method === "GET" && action === "notes") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const notes = await ctx.runQuery(
            internal.dmPeerPanel.listNotesForApi,
            {
              userId: auth.userId,
              peerUserId,
            },
          );
          return finish(jsonResponse({ notes }));
        }

        if (request.method === "POST" && action === "notes") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          const body = await readJsonBody<{ body?: string }>(request);
          if (!body.body || typeof body.body !== "string") {
            return finish(errorResponse("body is required", 400));
          }
          const noteId = await ctx.runMutation(
            internal.dmPeerPanel.addNoteForApi,
            {
              userId: auth.userId,
              peerUserId,
              body: body.body,
            },
          );
          return finish(jsonResponse({ noteId }));
        }

        if (request.method === "POST" && action === "block") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          await ctx.runMutation(internal.dmPeerPanel.blockForApi, {
            userId: auth.userId,
            peerUserId,
          });
          return finish(jsonResponse({ ok: true }));
        }

        if (request.method === "POST" && action === "unblock") {
          const auth = await authFor("messages");
          if (auth instanceof Response) return finish(auth);
          await ctx.runMutation(internal.dmPeerPanel.unblockForApi, {
            userId: auth.userId,
            peerUserId,
          });
          return finish(jsonResponse({ ok: true }));
        }
      }
    }

    return finish(errorResponse("Not found", 404));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status =
      /not found|not part of|cannot|required|invalid|empty|at most|full/i.test(
        message,
      )
        ? 400
        : 500;
    return finish(errorResponse(message, status));
  }
});

export const studioApiExtraOptions = httpAction(async () => optionsResponse());
