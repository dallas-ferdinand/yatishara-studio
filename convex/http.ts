import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { studioApiV1, studioApiV1Options } from "./studioApiHttp";
import { studioApiExtra, studioApiExtraOptions } from "./studioApiExtraHttp";
import {
  studioApiSocial,
  studioApiSocialOptions,
} from "./studioApiSocialHttp";
import {
  studioApiNetwork,
  studioApiNetworkOptions,
} from "./studioApiNetworkHttp";
import {
  studioApiAccountExtra,
  studioApiAccountExtraOptions,
} from "./studioApiAccountExtra";
import {
  studioApiAcademy,
  studioApiAcademyOptions,
} from "./studioApiAcademyHttp";
import { paywiseCallback, paywiseNotify } from "./paywiseHttp";
import { wamWebhook } from "./wamHttp";
import {
  agentWorkerCallback,
  agentWorkerCallbackOptions,
} from "./agentWorkerHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/paywise/notify", method: "POST", handler: paywiseNotify });
http.route({ path: "/paywise/callback", method: "POST", handler: paywiseCallback });
http.route({ path: "/wam/webhooks", method: "POST", handler: wamWebhook });

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
  "/api/v1/audio/stems",
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

const messagesExact = [
  "/api/v1/messages/conversations",
  "/api/v1/messages/search",
  "/api/v1/messages/unread-count",
  "/api/v1/messages/labels",
] as const;

for (const path of messagesExact) {
  http.route({ path, method: "GET", handler: studioApiExtra });
  http.route({ path, method: "POST", handler: studioApiExtra });
}

http.route({ path: "/api/v1/messages", method: "GET", handler: studioApiExtra });
http.route({ path: "/api/v1/messages", method: "POST", handler: studioApiExtra });

for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
  http.route({
    pathPrefix: "/api/v1/messages/",
    method,
    handler: studioApiExtra,
  });
}

http.route({
  pathPrefix: "/api/v1/messages/",
  method: "OPTIONS",
  handler: studioApiExtraOptions,
});

// —— Wave 2: social (feed + profiles) ——
const socialExact = [
  "/api/v1/feed",
  "/api/v1/feed/posts",
  "/api/v1/feed/collection",
  "/api/v1/feed/shared-asset-ids",
  "/api/v1/profiles/me",
  "/api/v1/profiles/username-available",
  "/api/v1/profiles/claim-username",
  "/api/v1/profiles/change-username",
  "/api/v1/profiles/me/following",
  "/api/v1/profiles/people",
] as const;

for (const path of socialExact) {
  http.route({ path, method: "GET", handler: studioApiSocial });
  http.route({ path, method: "POST", handler: studioApiSocial });
  http.route({ path, method: "PATCH", handler: studioApiSocial });
  http.route({ path, method: "DELETE", handler: studioApiSocial });
}

for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
  http.route({ pathPrefix: "/api/v1/feed/", method, handler: studioApiSocial });
  http.route({
    pathPrefix: "/api/v1/profiles/",
    method,
    handler: studioApiSocial,
  });
}

http.route({
  pathPrefix: "/api/v1/feed/",
  method: "OPTIONS",
  handler: studioApiSocialOptions,
});
http.route({
  pathPrefix: "/api/v1/profiles/",
  method: "OPTIONS",
  handler: studioApiSocialOptions,
});

// —— Wave 3: Creative Network ——
const networkExact = [
  "/api/v1/network/offers",
  "/api/v1/network/me/seller",
  "/api/v1/network/me/offers",
  "/api/v1/network/jobs/seller",
  "/api/v1/network/jobs/buyer",
  "/api/v1/network/listings",
  "/api/v1/network/listings/quote",
  "/api/v1/network/me/listings",
  "/api/v1/network/me/listings/summary",
  "/api/v1/network/me/listings/prepare",
  "/api/v1/network/me/listings/commit",
] as const;

for (const path of networkExact) {
  http.route({ path, method: "GET", handler: studioApiNetwork });
  http.route({ path, method: "POST", handler: studioApiNetwork });
  http.route({ path, method: "PATCH", handler: studioApiNetwork });
}

http.route({
  path: "/api/v1/network",
  method: "GET",
  handler: studioApiNetwork,
});
http.route({
  path: "/api/v1/network",
  method: "POST",
  handler: studioApiNetwork,
});

for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
  http.route({
    pathPrefix: "/api/v1/network/",
    method,
    handler: studioApiNetwork,
  });
}

http.route({
  pathPrefix: "/api/v1/network/",
  method: "OPTIONS",
  handler: studioApiNetworkOptions,
});

// —— Wave 4: account extras + notifications ——
// Exact /api/v1/account stays on studioApiV1 (credit balance).
const accountExtraExact = [
  "/api/v1/account/payments",
  "/api/v1/account/credits",
  "/api/v1/account/plans",
  "/api/v1/account/pricing",
  "/api/v1/account/storage",
  "/api/v1/account/subscription",
] as const;

for (const path of accountExtraExact) {
  http.route({ path, method: "GET", handler: studioApiAccountExtra });
}

http.route({
  pathPrefix: "/api/v1/account/",
  method: "GET",
  handler: studioApiAccountExtra,
});

http.route({
  path: "/api/v1/notifications",
  method: "GET",
  handler: studioApiAccountExtra,
});
http.route({
  pathPrefix: "/api/v1/notifications/",
  method: "POST",
  handler: studioApiAccountExtra,
});

http.route({
  pathPrefix: "/api/v1/account/",
  method: "OPTIONS",
  handler: studioApiAccountExtraOptions,
});
http.route({
  pathPrefix: "/api/v1/notifications/",
  method: "OPTIONS",
  handler: studioApiAccountExtraOptions,
});
http.route({
  path: "/api/v1/notifications",
  method: "OPTIONS",
  handler: studioApiAccountExtraOptions,
});

http.route({
  pathPrefix: "/api/v1/account/",
  method: "POST",
  handler: studioApiAccountExtra,
});

const academyExact = [
  "/api/v1/academy/courses",
  "/api/v1/academy/courses/mine",
] as const;
for (const path of academyExact) {
  http.route({ path, method: "GET", handler: studioApiAcademy });
  http.route({ path, method: "POST", handler: studioApiAcademy });
}
for (const method of ["GET", "POST"] as const) {
  http.route({
    pathPrefix: "/api/v1/academy/",
    method,
    handler: studioApiAcademy,
  });
}
http.route({
  pathPrefix: "/api/v1/academy/",
  method: "OPTIONS",
  handler: studioApiAcademyOptions,
});

http.route({
  pathPrefix: "/api/v1/",
  method: "OPTIONS",
  handler: studioApiV1Options,
});

for (const path of [
  "/api/agent-worker/tool-start",
  "/api/agent-worker/tool-result",
  "/api/agent-worker/approval",
  "/api/agent-worker/remember",
  "/api/agent-worker/plan-sync",
  "/api/agent-worker/ask",
  "/api/agent-worker/run-status",
] as const) {
  http.route({ path, method: "POST", handler: agentWorkerCallback });
  http.route({ path, method: "GET", handler: agentWorkerCallback });
  http.route({ path, method: "OPTIONS", handler: agentWorkerCallbackOptions });
}

export default http;
