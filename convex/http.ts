import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { studioApiV1, studioApiV1Options } from "./studioApiHttp";
import { paywiseCallback, paywiseNotify } from "./paywiseHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/paywise/notify", method: "POST", handler: paywiseNotify });
http.route({ path: "/paywise/callback", method: "POST", handler: paywiseCallback });

const exactGetPost = [
  "/api/v1",
  "/api/v1/openapi.json",
  "/api/v1/account",
  "/api/v1/trash",
  "/api/v1/folders",
  "/api/v1/workspace/tree",
  "/api/v1/workspace/resolve-path",
  "/api/v1/workspace/search",
  "/api/v1/workspace/project-context",
  "/api/v1/workspace/bulk-move",
  "/api/v1/assets/upload",
  "/api/v1/assets/upload-inline",
  "/api/v1/documents",
  "/api/v1/elements",
  "/api/v1/style-sheets",
  "/api/v1/style-presets",
  "/api/v1/video-models",
  "/api/v1/catalog/script-types",
  "/api/v1/catalog/reference-intents",
  "/api/v1/voices",
  "/api/v1/voices/saved",
  "/api/v1/generations/estimate",
  "/api/v1/generations/estimate-batch",
  "/api/v1/generations",
  "/api/v1/assistance/threads",
  "/api/v1/assistance/briefs",
  "/api/v1/assistance/approvals",
  "/api/v1/edits",
] as const;

for (const path of exactGetPost) {
  http.route({ path, method: "GET", handler: studioApiV1 });
  http.route({ path, method: "POST", handler: studioApiV1 });
}

const prefixMethods = [
  ["GET", "POST", "PATCH", "DELETE"],
  ["GET", "POST"],
  ["GET", "POST", "PATCH", "DELETE"],
  ["GET", "PATCH", "POST", "DELETE"],
  ["GET", "POST", "PATCH", "DELETE"],
  ["GET", "POST"],
  ["GET", "POST", "DELETE"],
  ["GET", "POST", "PATCH"],
  ["GET", "POST"],
  ["GET", "POST", "PUT", "PATCH", "DELETE"],
] as const;

const prefixes = [
  "/api/v1/folders/",
  "/api/v1/workspace/",
  "/api/v1/assets/",
  "/api/v1/documents/",
  "/api/v1/elements/",
  "/api/v1/generations/",
  "/api/v1/voices/",
  "/api/v1/assistance/",
  "/api/v1/catalog/",
  "/api/v1/edits/",
] as const;

for (let i = 0; i < prefixes.length; i += 1) {
  const pathPrefix = prefixes[i];
  for (const method of prefixMethods[i]) {
    http.route({
      pathPrefix,
      method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      handler: studioApiV1,
    });
  }
}

http.route({
  pathPrefix: "/api/v1/",
  method: "OPTIONS",
  handler: studioApiV1Options,
});

export default http;
