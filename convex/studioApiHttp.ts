import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { hashApiKey } from "./lib/studioApi/crypto";
import {
  ELEMENT_PRODUCTION_GUIDE,
  ELEMENT_SHEET_REFERENCE_POLICY,
  sheetReferencePolicy,
} from "./lib/elementSheetGuides";
import { MAX_GENERATION_REFERENCE_ASSETS } from "./lib/elementAssetModel";
import { appendVideoReferenceTags, startFramePromptPrefix } from "./lib/videoGeneration";
import { isDirectPromptMode } from "./lib/skipPromptEnhancement";
import { assertKlingGatewayPromptLength } from "./lib/klingGatewayPrompt";
import { listVideoModelsForMcp, listVideoModelsPublic, resolvePublicVideoModel } from "./lib/videoModels";
import { STUDIO_API_OPENAPI, STUDIO_API_ROOT } from "./lib/studioApi/openapi";
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
  sandboxFolderId: Id<"folders">;
};

async function authenticateRequest(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  requiredScope?: string,
  routeKind: "read" | "write" = "read",
): Promise<Omit<AuthContext, "sandboxFolderId"> | Response> {
  const token = parseBearerToken(request);
  if (!token) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }
  const keyHash = await hashApiKey(token);
  const auth = await ctx.runQuery(internal.studioApiInternal.authenticateApiKey, { keyHash });
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

async function resolveAuth(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  requiredScope?: string,
  routeKind: "read" | "write" = "read",
): Promise<AuthContext | Response> {
  const auth = await authenticateRequest(ctx, request, requiredScope, routeKind);
  if (auth instanceof Response) {
    return auth;
  }
  const sandboxFolderId = await ctx.runMutation(
    internal.studioApiInternal.resolveSandboxForApiKey,
    {
      apiKeyId: auth.apiKeyId,
      userId: auth.userId,
    },
  );
  return { ...auth, sandboxFolderId };
}

async function resolveFolderId(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  auth: AuthContext,
  folderId?: Id<"folders">,
): Promise<Id<"folders">> {
  if (folderId) {
    const folder = await ctx.runQuery(internal.studioApiInternal.getFolder, {
      userId: auth.userId,
      sandboxFolderId: auth.sandboxFolderId,
      folderId,
    });
    if (!folder) {
      throw new Error("Folder not found");
    }
    return folderId;
  }
  return auth.sandboxFolderId;
}

function routePath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
}

type TrashKind = "folder" | "asset" | "document" | "element";

function trashKindFromCollection(collection: string): TrashKind | null {
  switch (collection) {
    case "folders":
      return "folder";
    case "assets":
      return "asset";
    case "documents":
      return "document";
    case "elements":
      return "element";
    default:
      return null;
  }
}

export const studioApiV1 = httpAction(async (ctx, request) => {
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

  const authFor = async (
    scope?: string,
    routeKind: "read" | "write" = "read",
  ): Promise<AuthContext | Response> => {
    const auth = await resolveAuth(ctx, request, scope, routeKind);
    if (!(auth instanceof Response)) {
      audit = { apiKeyId: auth.apiKeyId, userId: auth.userId };
    }
    return auth;
  };

  try {
    if (request.method === "GET" && (route === "" || route === "openapi.json")) {
      if (route === "openapi.json") {
        return finish(jsonResponse(STUDIO_API_OPENAPI));
      }
      return finish(jsonResponse(STUDIO_API_ROOT));
    }

    if (request.method === "GET" && route === "account") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const account = await ctx.runQuery(internal.studioApiInternal.getAccount, {
        userId: auth.userId,
      });
      return finish(jsonResponse(account));
    }

    if (request.method === "GET" && route === "trash") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const kind = url.searchParams.get("kind") as TrashKind | null;
      const trash = await ctx.runQuery(internal.studioApiInternal.listTrashForApi, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        kind: kind ?? undefined,
        expiresUnix,
      });
      return finish(jsonResponse(trash));
    }

    const restoreMatch = route.match(/^(folders|assets|documents|elements)\/([^/]+)\/restore$/);
    if (request.method === "POST" && restoreMatch) {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const kind = trashKindFromCollection(restoreMatch[1]);
      if (!kind) {
        return finish(errorResponse("Not found", 404));
      }
      try {
        await ctx.runMutation(internal.studioApiInternal.restoreItemForApi, {
          userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
          kind,
          id: restoreMatch[2],
        });
        return finish(jsonResponse({ ok: true, kind, id: restoreMatch[2] }));
      } catch {
        return finish(errorResponse(`${kind} not found`, 404));
      }
    }

    if (request.method === "GET" && route === "folders") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const parentIdRaw = url.searchParams.get("parentId");
      const parentId = parseOptionalId(parentIdRaw) as Id<"folders"> | undefined;
      const folders = await ctx.runQuery(internal.studioApiInternal.listFolders, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        parentId,
      });
      return finish(jsonResponse({ folders }));
    }

    if (request.method === "POST" && route === "folders") {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        name?: string;
        parentId?: Id<"folders">;
        icon?: string;
        color?: string;
      }>(request);
      if (!body.name?.trim()) {
        return finish(errorResponse("name is required"));
      }
      const folder = await ctx.runMutation(internal.studioApiInternal.createFolder, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        name: body.name,
        parentId: body.parentId,
        icon: body.icon,
        color: body.color,
      });
      return finish(jsonResponse({ folder }, 201));
    }

    const folderMatch = route.match(/^folders\/([^/]+)$/);
    if (request.method === "GET" && folderMatch) {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const folderId = folderMatch[1] as Id<"folders">;
      const folder = await ctx.runQuery(internal.studioApiInternal.getFolder, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        folderId,
      });
      if (!folder) {
        return finish(errorResponse("Folder not found", 404));
      }
      return finish(jsonResponse({ folder }));
    }
    if (request.method === "PATCH" && folderMatch) {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const folderId = folderMatch[1] as Id<"folders">;
      const body = await readJsonBody<{
        name?: string;
        icon?: string;
        color?: string;
        parentId?: Id<"folders">;
      }>(request);
      try {
        await ctx.runMutation(internal.studioApiInternal.updateFolderForApi, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          folderId,
          name: body.name,
          icon: body.icon,
          color: body.color,
          parentId: body.parentId,
        });
        const folder = await ctx.runQuery(internal.studioApiInternal.getFolder, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          folderId,
        });
        if (!folder) {
          return finish(errorResponse("Folder not found", 404));
        }
        return finish(jsonResponse({ folder }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Update failed";
        const status = message.includes("not found") ? 404 : 400;
        return finish(errorResponse(message, status));
      }
    }
    if (request.method === "DELETE" && folderMatch) {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      try {
        await ctx.runMutation(internal.studioApiInternal.trashItemForApi, {
          userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
          kind: "folder",
          id: folderMatch[1],
        });
        return finish(jsonResponse({ ok: true, kind: "folder", id: folderMatch[1] }));
      } catch {
        return finish(errorResponse("Folder not found", 404));
      }
    }

    const folderContentsMatch = route.match(/^folders\/([^/]+)\/contents$/);
    if (request.method === "GET" && folderContentsMatch) {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const folderId = folderContentsMatch[1] as Id<"folders">;
      const contents = await ctx.runQuery(internal.studioApiInternal.getFolderContents, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        folderId,
        expiresUnix,
      });
      return finish(jsonResponse(contents));
    }

    const assetMatch = route.match(/^assets\/([^/]+)$/);
    if (request.method === "GET" && assetMatch) {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const assetId = assetMatch[1] as Id<"assets">;
      const asset = await ctx.runQuery(internal.studioApiInternal.getAsset, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        assetId,
        expiresUnix,
      });
      if (!asset) {
        return finish(errorResponse("Asset not found", 404));
      }
      return finish(jsonResponse({ asset }));
    }
    if (request.method === "PATCH" && assetMatch) {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const assetId = assetMatch[1] as Id<"assets">;
      const body = await readJsonBody<{
        name?: string;
        folderId?: Id<"folders">;
      }>(request);
      try {
        await ctx.runMutation(internal.studioApiInternal.updateAssetForApi, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          assetId,
          name: body.name,
          folderId: body.folderId,
        });
        const asset = await ctx.runQuery(internal.studioApiInternal.getAsset, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          assetId,
          expiresUnix,
        });
        if (!asset) {
          return finish(errorResponse("Asset not found", 404));
        }
        return finish(jsonResponse({ asset }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Update failed";
        const status = message.includes("not found") ? 404 : 400;
        return finish(errorResponse(message, status));
      }
    }
    if (request.method === "DELETE" && assetMatch) {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      try {
        await ctx.runMutation(internal.studioApiInternal.trashItemForApi, {
          userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
          kind: "asset",
          id: assetMatch[1],
        });
        return finish(jsonResponse({ ok: true, kind: "asset", id: assetMatch[1] }));
      } catch {
        return finish(errorResponse("Asset not found", 404));
      }
    }

    if (request.method === "POST" && route === "assets/upload") {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        folderId?: Id<"folders">;
        name?: string;
        kind?: "image" | "video" | "audio" | "document";
        mimeType?: string;
        byteSize?: number;
        complete?: boolean;
        assetId?: Id<"assets">;
      }>(request);

      if (body.complete && body.assetId) {
        await ctx.runMutation(internal.studioApiInternal.completeAssetUpload, {
          userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
          assetId: body.assetId,
          byteSize: body.byteSize,
        });
        const asset = await ctx.runQuery(internal.studioApiInternal.getAsset, {
          userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
          assetId: body.assetId,
          expiresUnix,
        });
        return finish(jsonResponse({ asset }));
      }

      if (!body.name?.trim() || !body.kind || !body.mimeType) {
        return finish(errorResponse("name, kind, and mimeType are required"));
      }
      const folderId = await resolveFolderId(ctx, auth, body.folderId);
      const upload = await ctx.runMutation(internal.studioApiInternal.reserveAssetUpload, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        folderId,
        name: body.name,
        kind: body.kind,
        mimeType: body.mimeType,
      });
      return finish(jsonResponse({ ...upload, folderId }, 201));
    }

    if (request.method === "POST" && route === "assets/upload-inline") {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        folderId?: Id<"folders">;
        name?: string;
        kind?: "image" | "video" | "audio" | "document";
        mimeType?: string;
        dataBase64?: string;
      }>(request);
      if (!body.name?.trim() || !body.kind || !body.mimeType || !body.dataBase64) {
        return finish(errorResponse("name, kind, mimeType, and dataBase64 are required"));
      }
      const folderId = await resolveFolderId(ctx, auth, body.folderId);
      const uploaded = await ctx.runAction(internal.studioApiActions.uploadAssetInline, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        folderId,
        name: body.name,
        kind: body.kind,
        mimeType: body.mimeType,
        dataBase64: body.dataBase64,
      });
      const asset = await ctx.runQuery(internal.studioApiInternal.getAsset, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        assetId: uploaded.assetId,
        expiresUnix,
      });
      return finish(jsonResponse({ asset }, 201));
    }

    if (request.method === "POST" && route === "documents") {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        folderId?: Id<"folders">;
        title?: string;
        contentMarkdown?: string;
      }>(request);
      if (!body.title?.trim()) {
        return finish(errorResponse("title is required"));
      }
      const folderId = await resolveFolderId(ctx, auth, body.folderId);
      const documentId = await ctx.runMutation(internal.studioApiInternal.createDocumentForApi, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        folderId,
        title: body.title,
        contentMarkdown: body.contentMarkdown,
      });
      const document = await ctx.runQuery(internal.studioApiInternal.getDocument, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        documentId,
        expiresUnix,
      });
      return finish(jsonResponse({ document }, 201));
    }

    const documentMatch = route.match(/^documents\/([^/]+)$/);
    if (documentMatch) {
      const documentId = documentMatch[1] as Id<"documents">;
      if (request.method === "GET") {
        const auth = await authFor("read", "read");
        if (auth instanceof Response) return finish(auth);
        try {
          const document = await ctx.runQuery(internal.studioApiInternal.getDocument, {
            userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
            documentId,
            expiresUnix,
          });
          return finish(jsonResponse({ document }));
        } catch {
          return finish(errorResponse("Document not found", 404));
        }
      }
      if (request.method === "PATCH") {
        const auth = await authFor("write", "write");
        if (auth instanceof Response) return finish(auth);
        const body = await readJsonBody<{
          title?: string;
          contentMarkdown?: string;
          folderId?: Id<"folders">;
        }>(request);
        try {
          await ctx.runMutation(internal.studioApiInternal.updateDocumentForApi, {
            userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
            documentId,
            title: body.title,
            contentMarkdown: body.contentMarkdown,
            folderId: body.folderId,
          });
          const document = await ctx.runQuery(internal.studioApiInternal.getDocument, {
            userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
            documentId,
            expiresUnix,
          });
          return finish(jsonResponse({ document }));
        } catch {
          return finish(errorResponse("Document not found", 404));
        }
      }
      if (request.method === "DELETE") {
        const auth = await authFor("write", "write");
        if (auth instanceof Response) return finish(auth);
        try {
          await ctx.runMutation(internal.studioApiInternal.trashItemForApi, {
            userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
            kind: "document",
            id: documentId,
          });
          return finish(jsonResponse({ ok: true, kind: "document", id: documentId }));
        } catch {
          return finish(errorResponse("Document not found", 404));
        }
      }
    }

    if (request.method === "GET" && route === "elements/production-guide") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      return finish(
        jsonResponse({
          guide: ELEMENT_PRODUCTION_GUIDE,
          note: "Elements have unbuilt (refs only) and built (sheetAssetId) states. Generation uses the sheet, not upload refs.",
        }),
      );
    }

    if (request.method === "GET" && route === "elements/sheet-guide") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const type = url.searchParams.get("type") as
        | "character"
        | "prop"
        | "location"
        | "doc"
        | null;
      if (!type || type === "doc") {
        return finish(
          errorResponse("type query param required: character, prop, or location"),
        );
      }
      const guide = sheetReferencePolicy(type);
      return finish(
        jsonResponse({
          type,
          guide,
          all: ELEMENT_SHEET_REFERENCE_POLICY,
          note:
            "photographic = real subject + upload refs. designed = fictional asset + description only — one generate_element_sheet call, no throwaway plates.",
        }),
      );
    }

    if (request.method === "GET" && route === "elements") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const type = url.searchParams.get("type") as
        | "character"
        | "prop"
        | "location"
        | "doc"
        | null;
      const folderIdRaw = url.searchParams.get("folderId");
      const folderId = parseOptionalId(folderIdRaw) as Id<"folders"> | undefined;
      const elements = await ctx.runQuery(internal.studioApiInternal.listElementsForApi, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        type: type ?? undefined,
        folderId,
        expiresUnix,
      });
      return finish(jsonResponse({ elements }));
    }

    if (request.method === "POST" && route === "elements") {
      const auth = await authFor("write", "write");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        type?: "character" | "prop" | "location" | "doc";
        name?: string;
        description?: string;
        folderId?: Id<"folders">;
        referenceAssetIds?: Id<"assets">[];
        sourceAssetIds?: Id<"assets">[];
        sourceDocumentId?: Id<"documents">;
        sourceMode?: "photographic" | "designed";
      }>(request);
      if (!body.type || !body.name?.trim()) {
        return finish(errorResponse("type and name are required"));
      }
      const elementId = await ctx.runMutation(internal.studioApiInternal.createElementForApi, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        type: body.type,
        name: body.name,
        description: body.description,
        folderId: body.folderId,
        referenceAssetIds: body.referenceAssetIds ?? body.sourceAssetIds,
        sourceAssetIds: body.sourceAssetIds,
        sourceDocumentId: body.sourceDocumentId,
        sourceMode: body.sourceMode,
      });
      const element = await ctx.runQuery(internal.studioApiInternal.getElementForApi, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        elementId,
        expiresUnix,
      });
      return finish(jsonResponse({ element }, 201));
    }

    const elementTextSheetMatch = route.match(/^elements\/([^/]+)\/generate-text-sheet$/);
    if (request.method === "POST" && elementTextSheetMatch) {
      const auth = await authFor("generate", "write");
      if (auth instanceof Response) return finish(auth);
      const elementId = elementTextSheetMatch[1] as Id<"elements">;
      const body = await readJsonBody<{
        referenceAssetIds?: Id<"assets">[];
      }>(request);
      try {
        const result = await ctx.runAction(api.elementActions.generateElementTextSheetForApi, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          elementId,
          referenceAssetIds: body.referenceAssetIds,
          expiresUnix,
        });
        const element = await ctx.runQuery(internal.studioApiInternal.getElementForApi, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          elementId,
          expiresUnix,
        });
        return finish(jsonResponse({ ...result, element }, 201));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Text sheet generation failed";
        const status =
          message.includes("not found") || message.includes("Not found") ? 404 : 400;
        return finish(errorResponse(message, status));
      }
    }

    const elementSheetMatch = route.match(/^elements\/([^/]+)\/generate-sheet$/);
    if (request.method === "POST" && elementSheetMatch) {
      const auth = await authFor("generate", "write");
      if (auth instanceof Response) return finish(auth);
      const elementId = elementSheetMatch[1] as Id<"elements">;
      const body = await readJsonBody<{
        referenceAssetIds?: Id<"assets">[];
        referenceElementIds?: Id<"elements">[];
        sourceMode?: "photographic" | "designed";
        resolution?: "1K" | "2K";
        stylePresetSlug?: string;
      }>(request);
      try {
        const result = await ctx.runAction(api.elementActions.generateElementSheetForApi, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          elementId,
          referenceAssetIds: body.referenceAssetIds,
          referenceElementIds: body.referenceElementIds,
          sourceMode: body.sourceMode,
          resolution: body.resolution,
          stylePresetSlug: body.stylePresetSlug,
          expiresUnix,
        });
        const element = await ctx.runQuery(internal.studioApiInternal.getElementForApi, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          elementId,
          expiresUnix,
        });
        return finish(jsonResponse({ ...result, element }, 201));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sheet generation failed";
        const status =
          message.includes("not found") || message.includes("Not found") ? 404 : 400;
        return finish(errorResponse(message, status));
      }
    }

    const elementMatch = route.match(/^elements\/([^/]+)$/);
    if (elementMatch) {
      const elementId = elementMatch[1] as Id<"elements">;
      if (request.method === "GET") {
        const auth = await authFor("read", "read");
        if (auth instanceof Response) return finish(auth);
        try {
          const element = await ctx.runQuery(internal.studioApiInternal.getElementForApi, {
            userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
            elementId,
            expiresUnix,
          });
          return finish(jsonResponse({ element }));
        } catch {
          return finish(errorResponse("Element not found", 404));
        }
      }
      if (request.method === "PATCH") {
        const auth = await authFor("write", "write");
        if (auth instanceof Response) return finish(auth);
        const body = await readJsonBody<{
          name?: string;
          description?: string;
          folderId?: Id<"folders">;
          referenceAssetIds?: Id<"assets">[];
          sourceAssetIds?: Id<"assets">[];
          sourceDocumentId?: Id<"documents">;
        }>(request);
        try {
          await ctx.runMutation(internal.studioApiInternal.updateElementForApi, {
            userId: auth.userId,
            sandboxFolderId: auth.sandboxFolderId,
            elementId,
            name: body.name,
            description: body.description,
            folderId: body.folderId,
            referenceAssetIds: body.referenceAssetIds ?? body.sourceAssetIds,
            sourceAssetIds: body.sourceAssetIds,
            sourceDocumentId: body.sourceDocumentId,
          });
          const element = await ctx.runQuery(internal.studioApiInternal.getElementForApi, {
            userId: auth.userId,
            sandboxFolderId: auth.sandboxFolderId,
            elementId,
            expiresUnix,
          });
          return finish(jsonResponse({ element }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Update failed";
          const status = message.includes("not found") ? 404 : 400;
          return finish(errorResponse(message, status));
        }
      }
      if (request.method === "DELETE") {
        const auth = await authFor("write", "write");
        if (auth instanceof Response) return finish(auth);
        try {
          await ctx.runMutation(internal.studioApiInternal.trashItemForApi, {
            userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
            kind: "element",
            id: elementId,
          });
          return finish(jsonResponse({ ok: true, kind: "element", id: elementId }));
        } catch {
          return finish(errorResponse("Element not found", 404));
        }
      }
    }

    if (request.method === "GET" && route === "style-presets") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const kind = url.searchParams.get("kind") as "image" | "video" | "any" | null;
      const presets = await ctx.runQuery(internal.studioApiInternal.listStylePresets, {
        kind: kind ?? undefined,
      });
      return finish(jsonResponse({ presets }));
    }

    if (request.method === "GET" && route === "video-models") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const scope = url.searchParams.get("scope");
      const models =
        scope === "mcp"
          ? listVideoModelsForMcp()
          : listVideoModelsPublic({ uiOnly: true });
      return finish(jsonResponse({ models }));
    }

    if (request.method === "GET" && route === "generations") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const jobs = await ctx.runQuery(internal.studioApiInternal.listGenerationJobs, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        limit: Number.isFinite(limit) ? limit : 20,
        expiresUnix,
      });
      return finish(jsonResponse({ generations: jobs }));
    }

    const generationMatch = route.match(/^generations\/([^/]+)$/);
    if (request.method === "GET" && generationMatch) {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);
      const jobId = generationMatch[1] as Id<"generationJobs">;
      const job = await ctx.runQuery(internal.studioApiInternal.getGenerationJob, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        jobId,
        expiresUnix,
      });
      if (!job) {
        return finish(errorResponse("Generation not found", 404));
      }
      return finish(jsonResponse(job));
    }

    if (request.method === "POST" && route === "generations/estimate-batch") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);

      const body = await readJsonBody<{
        items?: Array<{
          label: string;
          mode: "image" | "video" | "script";
          resolution?: string;
          durationSeconds?: number;
          audioEnabled?: boolean;
          hasReferenceInput?: boolean;
          referenceAssetIds?: Id<"assets">[];
          maxRounds: number;
        }>;
        contingencyPercent?: number;
      }>(request);

      if (!body.items?.length) {
        return finish(errorResponse("items array is required"));
      }

      const estimate = await ctx.runQuery(internal.studioApiInternal.estimateBatchProduction, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        items: body.items,
        contingencyPercent: body.contingencyPercent,
      });
      return finish(jsonResponse(estimate));
    }

    if (request.method === "POST" && route === "generations/estimate") {
      const auth = await authFor("read", "read");
      if (auth instanceof Response) return finish(auth);

      const body = await readJsonBody<{
        mode?: "image" | "video" | "script";
        resolution?: string;
        durationSeconds?: number;
        audioEnabled?: boolean;
        referenceAssetIds?: Id<"assets">[];
        referenceElementIds?: Id<"elements">[];
        startFrameAssetId?: Id<"assets">;
        videoModel?: string;
      }>(request);

      const mode = body.mode ?? "image";
      if (mode !== "image" && mode !== "video" && mode !== "script") {
        return finish(errorResponse("mode must be image, video, or script"));
      }

      let estimateAssetIds = body.referenceAssetIds ?? [];
      if (body.referenceElementIds?.length) {
        try {
          const resolved = await ctx.runQuery(internal.studioApiInternal.resolveReferenceElementIds, {
            userId: auth.userId,
            sandboxFolderId: auth.sandboxFolderId,
            elementIds: body.referenceElementIds,
            generationMode: mode === "video" ? "video" : mode === "image" ? "image" : undefined,
          });
          estimateAssetIds = [...new Set([...estimateAssetIds, ...resolved.referenceAssetIds])];
        } catch (error) {
          const message = error instanceof Error ? error.message : "Element resolution failed";
          return finish(errorResponse(message, message.includes("not found") ? 404 : 400));
        }
      }

      let estimateVideoModel: string | undefined;
      if (mode === "video") {
        try {
          estimateVideoModel = resolvePublicVideoModel(body.videoModel).slug;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid video model";
          return finish(errorResponse(message));
        }
      }

      const estimate = await ctx.runQuery(internal.studioApiInternal.estimateGenerationCost, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        mode,
        resolution: body.resolution,
        durationSeconds: body.durationSeconds,
        audioEnabled: body.audioEnabled,
        referenceAssetIds: estimateAssetIds.length ? estimateAssetIds : undefined,
        videoModel: estimateVideoModel,
      });
      return finish(jsonResponse(estimate));
    }

    if (request.method === "POST" && route === "generations") {
      const auth = await authFor("generate", "write");
      if (auth instanceof Response) return finish(auth);

      const body = await readJsonBody<{
        mode?: "image" | "video" | "script";
        prompt?: string;
        folderId?: Id<"folders">;
        stylePreset?: string;
        aspectRatio?: string;
        resolution?: string;
        durationSeconds?: number;
        audioEnabled?: boolean;
        referenceAssetIds?: Id<"assets">[];
        referenceElementIds?: Id<"elements">[];
        /** Storyboard / opening still for video — Seedance first_frame. Characters live here, not in face-sheet refs. */
        startFrameAssetId?: Id<"assets">;
        wait?: boolean;
        skipPromptEnhancement?: boolean;
        videoModel?: string;
        scriptType?: string;
        referenceIntent?: string;
      }>(request);

      if (!body.prompt?.trim()) {
        return finish(errorResponse("prompt is required"));
      }
      const mode = body.mode ?? "image";
      if (mode !== "image" && mode !== "video" && mode !== "script") {
        return finish(errorResponse("mode must be image, video, or script"));
      }

      const folderId = await resolveFolderId(ctx, auth, body.folderId);
      const presetSlug = body.stylePreset ?? "toon-prime";
      const preset = await ctx.runQuery(internal.studioApiInternal.resolveStylePresetBySlug, {
        slug: presetSlug,
      });
      if (!preset) {
        return finish(errorResponse(`Style preset not found: ${presetSlug}`, 404));
      }

      let userPrompt = body.prompt.trim();
      const creativePrompt = userPrompt;
      let mergedReferenceAssetIds = [...(body.referenceAssetIds ?? [])];
      let referenceImageLabels: Array<{ tag: string; label: string }> = [];

      let resolvedVideoModel;
      if (mode === "video") {
        try {
          resolvedVideoModel = resolvePublicVideoModel(body.videoModel);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid video model";
          return finish(errorResponse(message));
        }
      }

      const klingVideo =
        mode === "video" && resolvedVideoModel?.slug === "kling-3.0-i2v";

      if (body.referenceElementIds?.length) {
        try {
          const resolved = await ctx.runQuery(internal.studioApiInternal.resolveReferenceElementIds, {
            userId: auth.userId,
            sandboxFolderId: auth.sandboxFolderId,
            elementIds: body.referenceElementIds,
            generationMode: mode === "video" ? "video" : mode === "image" ? "image" : undefined,
            promptAppendStyle: klingVideo ? "gateway_kling" : "full",
            hasStartFrame: Boolean(body.startFrameAssetId),
          });
          mergedReferenceAssetIds = [
            ...new Set([...mergedReferenceAssetIds, ...resolved.referenceAssetIds]),
          ];
          referenceImageLabels = resolved.referenceImageLabels;
          if (resolved.promptLines.length) {
            userPrompt = `${userPrompt}\n\nElement references:\n${resolved.promptLines.join("\n\n")}`;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Element resolution failed";
          return finish(errorResponse(message, message.includes("not found") ? 404 : 400));
        }
      }

      let startFrameUrl: string | undefined;
      if (body.startFrameAssetId) {
        if (mode !== "video") {
          return finish(errorResponse("startFrameAssetId is only valid for video mode"));
        }
        const startRefs = await ctx.runQuery(internal.studioApiInternal.getAssetReferenceUrls, {
          userId: auth.userId,
          sandboxFolderId: auth.sandboxFolderId,
          assetIds: [body.startFrameAssetId],
          expiresUnix,
        });
        const startRef = startRefs[0];
        if (!startRef || startRef.kind !== "image") {
          return finish(errorResponse("startFrameAssetId must be an image asset"));
        }
        startFrameUrl = startRef.url;
        const directPrompt = isDirectPromptMode({
          skipPromptEnhancement: body.skipPromptEnhancement,
          presetSlug: preset.slug,
        });
        userPrompt = directPrompt
          ? appendVideoReferenceTags(userPrompt, referenceImageLabels)
          : `${startFramePromptPrefix()}\n\n${appendVideoReferenceTags(userPrompt, referenceImageLabels)}`;
      } else if (mode === "video" && referenceImageLabels.length) {
        userPrompt = appendVideoReferenceTags(userPrompt, referenceImageLabels);
      }

      if (mode === "video" && resolvedVideoModel) {
        if (resolvedVideoModel.requiresStartFrame && !startFrameUrl) {
          return finish(
            errorResponse(
              `${resolvedVideoModel.label} requires startFrameAssetId (storyboard opening still).`,
            ),
          );
        }
      }

      if (klingVideo) {
        try {
          assertKlingGatewayPromptLength({ prompt: userPrompt, creativePrompt });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Kling prompt too long";
          return finish(errorResponse(message));
        }
      }

      if (mergedReferenceAssetIds.length > MAX_GENERATION_REFERENCE_ASSETS) {
        return finish(
          errorResponse(
            `At most ${MAX_GENERATION_REFERENCE_ASSETS} reference assets per generation`,
          ),
        );
      }

      let referenceUrls: string[] | undefined;
      let referenceInputs:
        | Array<{ kind: "image" | "video" | "audio"; url: string; mimeType?: string }>
        | undefined;
      if (mergedReferenceAssetIds.length) {
        const refs: Array<{
          assetId: Id<"assets">;
          kind: "image" | "video" | "audio" | "document";
          mimeType: string;
          url: string;
        }> = await ctx.runQuery(internal.studioApiInternal.getAssetReferenceUrls, {
          userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
          assetIds: mergedReferenceAssetIds,
          expiresUnix,
        });
        if (mode === "image") {
          const imageRefs = refs.filter((ref) => ref.kind === "image");
          if (refs.length > 0 && imageRefs.length === 0) {
            return finish(
              errorResponse(
                "Image generation requires at least one image reference asset. Video/audio/document refs cannot be used as image references.",
              ),
            );
          }
          referenceUrls = imageRefs.map((ref) => ref.url);
        } else {
          referenceInputs = refs.map((ref) => ({
            kind: ref.kind === "document" ? "image" : ref.kind,
            url: ref.url,
            mimeType: ref.mimeType,
          }));
        }
      }

      const hasElementReference = Boolean(body.referenceElementIds?.length);
      const hasRawImageReference = Boolean(body.referenceAssetIds?.length);

      if (mode === "script") {
        const result = await ctx.runAction(api.generationActions.runScriptForApi, {
          userId: auth.userId,
          folderId,
          apiKeyId: auth.apiKeyId,
          stylePresetId: preset.id,
          userPrompt,
          referenceInputs,
          skipScriptEnhancement: body.skipPromptEnhancement,
          scriptType: body.scriptType,
          referenceIntent: body.referenceIntent,
          hasRawImageReference,
          hasElementReference,
        });
        const document = await ctx.runQuery(internal.studioApiInternal.getDocument, {
          userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
          documentId: result.documentId,
          expiresUnix,
        });
        return finish(
          jsonResponse(
            {
              documentId: result.documentId,
              title: result.title,
              creditsSpent: result.creditsSpent,
              folderId,
              mode: "script",
              document,
            },
            201,
          ),
        );
      }

      if (mode === "image" && preset.kind === "video") {
        return finish(errorResponse("Selected preset is video-only"));
      }
      if (mode === "video" && preset.kind === "image") {
        return finish(errorResponse("Selected preset is image-only"));
      }

      const activeJobs = await ctx.runQuery(internal.studioApiInternal.countActiveApiGenerations, {
        apiKeyId: auth.apiKeyId,
      });
      if (activeJobs >= 10) {
        return finish(errorResponse("Too many concurrent generations for this API key", 429));
      }

      const tier = mode === "video" ? ("pro_video" as const) : ("image" as const);
      const resolution =
        body.resolution ?? (mode === "image" ? "2K" : "1280x720");
      const aspectRatio = body.aspectRatio ?? "16:9";
      const referenceInputsList = referenceInputs ?? [];
      const generationArgs = {
        userId: auth.userId,
        folderId,
        apiKeyId: auth.apiKeyId,
        mode,
        tier,
        resolvedModel:
          mode === "video"
            ? resolvedVideoModel!.gatewayModelId
            : (process.env.GATEWAY_IMAGE_MODEL_ID ?? "openai/gpt-image-2"),
        stylePresetId: preset.id,
        userPrompt,
        title: userPrompt.slice(0, 64) || "API generation",
        audioEnabled: body.audioEnabled,
        aspectRatio,
        resolution,
        durationSeconds: body.durationSeconds,
        hasReferenceInput:
          mode === "video"
            ? Boolean(referenceInputsList.length || startFrameUrl)
            : Boolean(referenceUrls?.length),
        hasVideoReferenceInput:
          mode === "video" && referenceInputsList.some((input) => input.kind === "video"),
        hasNonVideoReferenceInput:
          mode === "video" &&
          referenceInputsList.some((input) => input.kind === "image" || input.kind === "audio"),
        skipPromptEnhancement: body.skipPromptEnhancement,
      };

      if (body.wait === false) {
        const prepared = await ctx.runMutation(internal.generation.prepareApiGeneration, generationArgs);
        await ctx.scheduler.runAfter(0, api.generationActions.executeApiJob, {
          jobId: prepared.jobId,
          mode,
          aspectRatio,
          resolution,
          durationSeconds: body.durationSeconds,
          audioEnabled: body.audioEnabled,
          referenceUrls,
          referenceInputs,
          startFrameUrl,
          referenceIntent: body.referenceIntent,
          hasRawImageReference,
          hasElementReference,
        });
        return finish(
          jsonResponse(
            {
              id: prepared.jobId,
              threadId: prepared.threadId,
              status: "queued",
              folderId,
              mode,
              videoModel: resolvedVideoModel?.slug,
            },
            202,
          ),
        );
      }

      const result = await ctx.runAction(api.generationActions.runGenerationForApi, {
        userId: auth.userId,
        folderId,
        apiKeyId: auth.apiKeyId,
        mode,
        tier,
        stylePresetId: preset.id,
        userPrompt,
        audioEnabled: body.audioEnabled,
        aspectRatio,
        resolution,
        durationSeconds: body.durationSeconds,
        referenceUrls,
        referenceInputs,
        startFrameUrl,
        skipPromptEnhancement: body.skipPromptEnhancement,
        videoModel: resolvedVideoModel?.slug,
        referenceIntent: body.referenceIntent,
        hasRawImageReference,
        hasElementReference,
      });

      const job = await ctx.runQuery(internal.studioApiInternal.getGenerationJob, {
        userId: auth.userId,
        sandboxFolderId: auth.sandboxFolderId,
        jobId: result.jobId,
        expiresUnix,
      });

      return finish(
        jsonResponse(
          {
            id: result.jobId,
            threadId: result.threadId,
            status: job?.status ?? "done",
            mode,
            folderId,
            stylePresetSlug: job?.stylePresetSlug,
            creditsSpent: job?.creditsSpent,
            assets: job?.assets ?? [],
            error: job?.error ?? null,
          },
          201,
        ),
      );
    }

    return finish(errorResponse("Not found", 404));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = message.includes("not found") || message.includes("Not found") ? 404 : 400;
    return finish(errorResponse(message, status));
  }
});

export const studioApiV1Options = httpAction(async () => optionsResponse());
