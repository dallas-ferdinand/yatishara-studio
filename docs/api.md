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
| `write` | Create/update folders, assets, documents, elements; trash/restore |
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
PATCH /api/v1/folders/:id
```

`POST` body: `{ "name", "parentId?", "icon?", "color?" }`

`PATCH` body: `{ "name?", "icon?", "color?", "parentId?" }` — rename or move folder. Cannot move the API key sandbox root or into its own subfolder.

If `folderId` is omitted on write/generate calls, the key’s default folder (or root Studio folder) is used.

## Assets

```http
GET /api/v1/assets/:id
PATCH /api/v1/assets/:id
POST /api/v1/assets/upload
POST /api/v1/assets/upload-inline
```

`PATCH` body: `{ "name?", "folderId?" }` — rename or move image/video/audio asset.

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

`PATCH` body: `{ "title?", "contentMarkdown?", "folderId?" }` — rename, edit content, or move document.

## Elements

Elements have two states:

- **Unbuilt** — `referenceAssetIds` (upload photos) only. Not usable in generation yet.
- **Built** — `sheetAssetId` set (generated reference sheet). Generation uses the **sheet image + description**, never the raw upload refs.

```http
GET /api/v1/elements?type=character|prop|location|doc&folderId=...
GET /api/v1/elements/:id
PATCH /api/v1/elements/:id
POST /api/v1/elements
POST /api/v1/elements/:id/generate-text-sheet
POST /api/v1/elements/:id/generate-sheet
DELETE /api/v1/elements/:id
POST /api/v1/elements/:id/restore
GET /api/v1/elements/production-guide
```

Element responses include `buildStatus` (`unbuilt`|`built`), `referenceAssetIds`, `referenceAssets`, `sheetAssetId`, `sheetAsset`, `sheetUrl`.

`PATCH` body: `{ "name?", "description?", "folderId?", "referenceAssetIds?", "sourceDocumentId?" }` — `referenceAssetIds` must be upload photos only (never the sheet asset). Max 10.

**Sheet guide** (`GET /elements/sheet-guide?type=character|prop|location`) — min/recommended reference photo counts, fidelity rules, and workflow for agents. **Production guide** (`GET /elements/production-guide`) — build states and generation rules.

**Generate text sheet** (`POST /elements/:id/generate-text-sheet`):

Requires `generate` + `write` scopes. Generates the markdown production write-up (identity locks, gen prompt) from reference photos and saves it as the element `description`. Same min-ref rules as the image sheet. Response: `{ "elementId", "description", "element" }`.

**Generate sheet** (`POST /elements/:id/generate-sheet`):

Requires `generate` + `write` scopes. Rejects `type: "doc"`. Minimum reference **images** before generate: character **3**, prop **2**, location **2** (recommended up to ~8 / 6 / 6). Captures features exactly from refs — no restyling. Sets `sheetAssetId` and `buildStatus: "built"`.

```json
{
  "referenceAssetIds": [],
  "resolution": "2K"
}
```

Response: `{ "assetId", "elementId", "sheetUrl", "creditsSpent", "buildStatus", "element" }`

Uses GPT Image 2 directly (no preset prompt enhancement).

### Using elements in generation

Pass `referenceElementIds` to `POST /generations` (and `/generations/estimate`). Each element must be **built**; the API attaches its sheet image as a reference and appends its description to the prompt. Unbuilt elements return `400`. Max 10 total reference assets per generation; image mode requires at least one image ref if any refs are passed.

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

Use the `slug` field as `stylePreset` when generating. Use `raw` with `skipPromptEnhancement: true` to pass prompts directly to the model without preset rewrite.

## Generation

### Estimate cost

```http
POST /api/v1/generations/estimate
```

Body: `{ mode: "image"|"video"|"script", resolution?, durationSeconds?, audioEnabled?, referenceAssetIds? }`

### Estimate batch (production budget)

```http
POST /api/v1/generations/estimate-batch
```

```json
{
  "items": [
    { "label": "prop_honey_jar", "mode": "image", "resolution": "2K", "hasReferenceInput": true, "maxRounds": 3 },
    { "label": "shot_S01", "mode": "video", "resolution": "1280x720", "durationSeconds": 6, "maxRounds": 3 }
  ],
  "contingencyPercent": 15
}
```

Response includes `subtotalCredits`, `contingencyCredits`, `totalCredits`, `totalTTD`, `creditPriceTTD` (0.5), `creditBalance`, `canGenerate`.

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
  "stylePreset": "raw",
  "skipPromptEnhancement": true,
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
  "stylePreset": "raw",
  "skipPromptEnhancement": true,
  "durationSeconds": 6,
  "wait": false
}
```

**Script** (creates a markdown document):

```json
{
  "mode": "script",
  "prompt": "Write a 30s ad script for…",
  "stylePreset": "raw",
  "skipPromptEnhancement": true
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
