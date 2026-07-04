export const STUDIO_API_OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Yatishara Studio API",
    version: "1.0.0",
    description:
      "REST API for folders, assets, documents, elements, and AI generation. Authenticate with Bearer ysk_live_… keys.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Studio API key (ysk_live_…)",
      },
    },
  },
  paths: {
    "/": {
      get: { summary: "API root and capability list" },
    },
    "/account": { get: { summary: "Credit balance and subscription" } },
    "/trash": { get: { summary: "List trashed items (?kind=folder|asset|document|element)" } },
    "/folders": {
      get: { summary: "List folders" },
      post: { summary: "Create folder" },
    },
    "/folders/{id}": {
      get: { summary: "Get folder" },
      patch: { summary: "Rename or move folder" },
      delete: { summary: "Move folder to trash" },
    },
    "/folders/{id}/restore": { post: { summary: "Restore folder from trash" } },
    "/folders/{id}/contents": { get: { summary: "Folder contents" } },
    "/assets/{id}": {
      get: { summary: "Get asset with signed URL" },
      patch: { summary: "Rename or move asset" },
      delete: { summary: "Move asset to trash" },
    },
    "/assets/{id}/restore": { post: { summary: "Restore asset from trash" } },
    "/assets/upload": { post: { summary: "Reserve upload URL (two-step)" } },
    "/assets/upload-inline": { post: { summary: "Upload base64 file in one step" } },
    "/documents": {
      post: { summary: "Create document" },
    },
    "/documents/{id}": {
      get: { summary: "Get document" },
      patch: { summary: "Update document" },
      delete: { summary: "Move document to trash" },
    },
    "/documents/{id}/restore": { post: { summary: "Restore document from trash" } },
    "/elements": {
      get: { summary: "List elements" },
      post: { summary: "Create element" },
    },
    "/elements/sheet-guide": {
      get: { summary: "Agent guide: ref counts, fidelity rules, sheet workflow" },
    },
    "/elements/{id}": {
      get: { summary: "Get element" },
      patch: { summary: "Rename, move, or update element" },
      delete: { summary: "Move element to trash" },
    },
    "/elements/{id}/restore": { post: { summary: "Restore element from trash" } },
    "/style-presets": { get: { summary: "List style presets" } },
    "/generations": {
      get: { summary: "List generation jobs" },
      post: { summary: "Generate image, video, or script" },
    },
    "/generations/estimate": { post: { summary: "Estimate credit cost" } },
    "/generations/{id}": { get: { summary: "Get generation job" } },
  },
} as const;

export const STUDIO_API_ROOT = {
  name: "Yatishara Studio API",
  version: "1.0.0",
  documentation: "/api/v1/openapi.json",
  scopes: ["read", "write", "generate"],
  endpoints: [
    "GET /account",
    "GET /trash",
    "GET|POST /folders",
    "GET|PATCH|DELETE /folders/:id",
    "POST /folders/:id/restore",
    "GET /folders/:id/contents",
    "GET|PATCH|DELETE /assets/:id",
    "POST /assets/:id/restore",
    "POST /assets/upload",
    "POST /assets/upload-inline",
    "GET|POST /documents",
    "GET|PATCH|DELETE /documents/:id",
    "POST /documents/:id/restore",
    "GET|POST /elements",
    "GET /elements/sheet-guide",
    "GET|PATCH|DELETE /elements/:id",
    "POST /elements/:id/restore",
    "GET /style-presets",
    "GET|POST /generations",
    "POST /generations/estimate",
    "GET /generations/:id",
  ],
};
