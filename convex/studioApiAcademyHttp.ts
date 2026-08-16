/**
 * Academy HTTP surface for Studio MCP / API keys.
 *
 *   GET  /api/v1/academy/courses
 *   GET  /api/v1/academy/courses/mine
 *   GET  /api/v1/academy/courses/:idOrSlug
 *   POST /api/v1/academy/courses/:id/purchase
 *   GET  /api/v1/academy/courses/:id/intro
 *   GET  /api/v1/academy/lessons/:id/playback
 */

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  authenticateStudioRequest,
  type StudioHttpAuth,
} from "./lib/studioApi/requestAuth";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
} from "./lib/studioApi/httpHelpers";

type AuthContext = Pick<StudioHttpAuth, "userId" | "apiKeyId" | "scopes">;

function routePath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
}

function looksLikeId(value: string): boolean {
  return /^[a-z0-9]{20,}$/i.test(value) && !value.includes("-");
}

export const studioApiAcademy = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  const started = Date.now();
  const url = new URL(request.url);
  const route = routePath(url.pathname);
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
    const auth = await authenticateStudioRequest(ctx, request, scope);
    if (auth instanceof Response) return auth;
    audit = { apiKeyId: auth.apiKeyId, userId: auth.userId };
    return {
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      scopes: auth.scopes,
    };
  };

  try {
    if (request.method === "GET" && route === "academy/courses") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const courses = await ctx.runQuery(internal.academy.listPublishedCoursesForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ courses }));
    }

    if (request.method === "GET" && route === "academy/courses/mine") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const courses = await ctx.runQuery(internal.academy.listMyCoursesForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ courses }));
    }

    const introMatch = route.match(/^academy\/courses\/([^/]+)\/intro$/);
    if (request.method === "GET" && introMatch) {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const playback = await ctx.runAction(internal.academyActions.getIntroPlaybackForApi, {
        userId: auth.userId,
        courseId: introMatch[1] as Id<"academyCourses">,
      });
      return finish(jsonResponse(playback));
    }

    const purchaseMatch = route.match(/^academy\/courses\/([^/]+)\/purchase$/);
    if (request.method === "POST" && purchaseMatch) {
      const auth = await authFor("generate");
      if (auth instanceof Response) return finish(auth);
      const result = await ctx.runMutation(internal.academy.purchaseCourseForApi, {
        userId: auth.userId,
        courseId: purchaseMatch[1] as Id<"academyCourses">,
      });
      return finish(jsonResponse(result));
    }

    const lessonMatch = route.match(/^academy\/lessons\/([^/]+)\/playback$/);
    if (request.method === "GET" && lessonMatch) {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const playback = await ctx.runAction(internal.academyActions.getLessonPlaybackForApi, {
        userId: auth.userId,
        lessonId: lessonMatch[1] as Id<"academyLessons">,
      });
      return finish(jsonResponse(playback));
    }

    const courseMatch = route.match(/^academy\/courses\/([^/]+)$/);
    if (request.method === "GET" && courseMatch) {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const key = decodeURIComponent(courseMatch[1]);
      const course = await ctx.runQuery(internal.academy.getCourseForApi, {
        userId: auth.userId,
        ...(looksLikeId(key)
          ? { courseId: key as Id<"academyCourses"> }
          : { slug: key }),
      });
      if (!course) return finish(errorResponse("Course not found", 404));
      return finish(jsonResponse(course));
    }

    return finish(errorResponse("Not found", 404));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status =
      message.includes("not found") || message.includes("Not found")
        ? 404
        : message.includes("deposit in progress") ||
            message.includes("Not enough") ||
            message.includes("insufficient")
          ? 400
          : 400;
    return finish(errorResponse(message, status));
  }
});

export const studioApiAcademyOptions = httpAction(async () => optionsResponse());
