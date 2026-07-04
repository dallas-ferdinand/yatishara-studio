import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { studioApiV1, studioApiV1Options } from "./studioApiHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

const exactGetPost = [
  "/api/v1",
  "/api/v1/openapi.json",
  "/api/v1/account",
  "/api/v1/trash",
  "/api/v1/folders",
  "/api/v1/assets/upload",
  "/api/v1/assets/upload-inline",
  "/api/v1/documents",
  "/api/v1/elements",
  "/api/v1/style-presets",
  "/api/v1/video-models",
  "/api/v1/generations/estimate",
  "/api/v1/generations",
] as const;

for (const path of exactGetPost) {
  http.route({ path, method: "GET", handler: studioApiV1 });
  http.route({ path, method: "POST", handler: studioApiV1 });
}

http.route({ pathPrefix: "/api/v1/folders/", method: "GET", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/folders/", method: "POST", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/folders/", method: "PATCH", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/folders/", method: "DELETE", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/assets/", method: "GET", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/assets/", method: "POST", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/assets/", method: "PATCH", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/assets/", method: "DELETE", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/documents/", method: "GET", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/documents/", method: "PATCH", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/documents/", method: "POST", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/documents/", method: "DELETE", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/elements/", method: "GET", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/elements/", method: "POST", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/elements/", method: "PATCH", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/elements/", method: "DELETE", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/generations/", method: "GET", handler: studioApiV1 });
http.route({ pathPrefix: "/api/v1/generations/", method: "POST", handler: studioApiV1 });

http.route({
  pathPrefix: "/api/v1/",
  method: "OPTIONS",
  handler: studioApiV1Options,
});

export default http;
