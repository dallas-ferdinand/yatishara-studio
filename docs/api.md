# Yatishara Studio API

REST API at `/api/v1` on your Convex site URL (`NEXT_PUBLIC_CONVEX_SITE_URL`).

## Authentication

Send your API key on every request:

```http
Authorization: Bearer ysk_live_…
```

Create keys in Studio → Settings → API keys. Scopes:

| Scope | Allows |
|-------|--------|
| `read` | Account, folders, assets, documents, elements, presets, list/get generations |
| `write` | Create folders, upload assets, create/update documents and elements |
| `generate` | Image, video, and script generation (uses credits) |

## Discovery

- `GET /api/v1` — API name, version, scope list, endpoint index
- `GET /api/v1/openapi.json` — OpenAPI 3.1 document

## Account

```http
GET /api/v1/account
```

Returns credit balance, subscription status, and plan info.

## Folders

```http
GET /api/v1/folders?parentId=
GET /api/v1/folders/:id
GET /api/v1/folders/:id/contents
POST /api/v1/folders
```

`POST` body: `{ "name", "parentId?", "icon?", "color?" }`

If `folderId` is omitted on write/generate calls, the key’s default folder (or root Studio folder) is used.

## Assets

```http
GET /api/v1/assets/:id
POST /api/v1/assets/upload
POST /api/v1/assets/upload-inline
```

**Two-step upload** (`/assets/upload`):

1. `POST` with `{ folderId?, name, kind, mimeType }` → `{ assetId, putUrl, storageAccessKey, bunnyPath }`
2. `PUT` bytes to `putUrl` with header `AccessKey: storageAccessKey`
3. `POST` with `{ complete: true, assetId, byteSize? }` → `{ asset }`

**Inline upload** (`/assets/upload-inline`): `{ folderId?, name, kind, mimeType, dataBase64 }` (max 50 MB).

## Documents

```http
GET /api/v1/documents/:id
POST /api/v1/documents
PATCH /api/v1/documents/:id
DELETE /api/v1/documents/:id
POST /api/v1/documents/:id/restore
```

## Elements

```http
GET /api/v1/elements?type=character|prop|location|doc
GET /api/v1/elements/:id
POST /api/v1/elements
DELETE /api/v1/elements/:id
POST /api/v1/elements/:id/restore
```

## Trash

Soft delete (matches Studio UI trash). Hard delete is not exposed via API.

```http
GET /api/v1/trash?kind=folder|asset|document|element
DELETE /api/v1/folders/:id
DELETE /api/v1/assets/:id
DELETE /api/v1/documents/:id
DELETE /api/v1/elements/:id
POST /api/v1/folders/:id/restore
POST /api/v1/assets/:id/restore
POST /api/v1/documents/:id/restore
POST /api/v1/elements/:id/restore
```

## Style presets

```http
GET /api/v1/style-presets?kind=image|video|any
```

Use the `slug` field as `stylePreset` when generating.

## Generation

### Estimate cost

```http
POST /api/v1/generations/estimate
```

Body: `{ mode: "image"|"video"|"script", resolution?, durationSeconds?, audioEnabled?, referenceAssetIds? }`

### Generate

```http
POST /api/v1/generations
GET /api/v1/generations?limit=20
GET /api/v1/generations/:id
```

**Image** (sync by default):

```json
{
  "mode": "image",
  "prompt": "…",
  "stylePreset": "realism",
  "resolution": "2K",
  "aspectRatio": "16:9",
  "referenceAssetIds": [],
  "wait": true
}
```

**Video** (use `wait: false` and poll `GET /generations/:id`):

```json
{
  "mode": "video",
  "prompt": "…",
  "durationSeconds": 6,
  "wait": false
}
```

**Script** (creates a markdown document):

```json
{
  "mode": "script",
  "prompt": "Write a 30s ad script for…",
  "stylePreset": "realism"
}
```

Job responses include `threadId`, `stylePresetSlug`, and `creditsSpent` when available.

## Rate limits

Per API key, rolling 60-second window:

- Read routes: 120 requests
- Write/generate routes: 30 requests
- Concurrent in-flight image/video jobs: 10

`429` responses include `Retry-After`.

## MCP

Use the `@yatishara/studio-mcp` package (or local `packages/studio-mcp`) with `STUDIO_API_KEY` and `STUDIO_API_URL` env vars. See Settings → API keys for a copy-paste config.

## Errors

JSON body: `{ "error": "message" }` with HTTP status `400`, `401`, `403`, `404`, or `429`.
