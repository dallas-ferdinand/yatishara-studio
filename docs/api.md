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
| `read` | Account, folders, assets, documents, elements, presets, catalogs, voices browse, list/get generations, briefs, edits |
| `write` | Create/update folders, assets, documents, elements, edits, briefs, saved voices; trash/restore |
| `generate` | Image, video, script, audio generation; brief approve; edit export (uses credits / compute) |

## Discovery

- `GET /api/v1` — API name, version, scope list, endpoint index
- `GET /api/v1/openapi.json` — OpenAPI 3.1 document
- `GET /api/v1/catalog/script-types` — scriptType values for script generation
- `GET /api/v1/catalog/reference-intents` — referenceIntent values (`auto`, `stylize`, `match_reference`, `element_lock`)
- `GET /api/v1/video-models?scope=mcp` — video model catalog (includes MCP-only models)

## Account

```http
GET /api/v1/account
```

Returns credit balance, subscription status, and plan info.

## Workspace context (agent-oriented)

```http
GET /api/v1/workspace/tree?folderId=&maxDepth=&maxNodes=
GET /api/v1/workspace/resolve-path?path=&rootFolderId=
GET /api/v1/workspace/search?q=&kinds=folder,asset,document,element&folderId=&limit=
GET /api/v1/workspace/project-context?folderId=&recentGenerationLimit=
POST /api/v1/workspace/ensure-path
POST /api/v1/workspace/bulk-move
```

`ensure-path` body: `{ "path": "Clients/JAV/refs", "rootFolderId?" }` — creates missing segments (case-insensitive reuse).
`bulk-move` body: `{ "targetFolderId", "items": [{ "kind": "asset"|"document"|"element"|"folder", "id" }] }` (max 50).

`GET /api/v1/assets/:id/media` returns signed `url` / `thumbnailUrl` / `preferredViewUrl` for the **host client** to view (no Studio AI credits).

```http
GET /api/v1/assistance/threads?limit=
GET /api/v1/assistance/threads/:id/history?limit=&beforeOrder=
POST /api/v1/assets/:id/duplicate
```

## Folders

```http
GET /api/v1/folders?parentId=
GET /api/v1/folders/:id
GET /api/v1/folders/:id/contents
POST /api/v1/folders
PATCH /api/v1/folders/:id
```

`contents` includes `breadcrumb`, `folders`, `assets`, `documents`, and `elements` (buildStatus / sheetAssetId).

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

1. `POST` with `{ folderId?, name, kind, mimeType }` → `{ assetId, uploadUrl, bunnyPath }`
2. `POST` the file bytes to `uploadUrl` (Convex staging; response includes `storageId`)
3. `POST` with `{ complete: true, assetId, storageId, byteSize? }` → `{ asset }`

The Bunny storage zone key is never returned to clients.

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
GET /api/v1/style-sheets
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

Pass `referenceElementIds` to `POST /generations` (and `/generations/estimate`). Each element must be **built**. The API appends each element's description to the prompt. Unbuilt elements return `400`. Max 10 total reference assets per generation.

**Video mode:** pass **`startFrameAssetId`** when people are on camera (storyboard still → Seedance `first_frame`). Only **prop** and **location** element sheets attach as `[Image N]` video refs. **Character** elements: description in prompt + identity in start frame — never attach character sheets to video (Seedance real-person filter). **Image mode:** all built element sheets attach as references.

See `GET /elements/production-guide` and [start-frame-workflow.md](../.cursor/skills/cartoon-ad-production/references/start-frame-workflow.md).

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

Use the `slug` field as `stylePreset` when generating. Prefer **Style Sheet elements** (`styleSheetElementId`) for styled work. Use `unstyled`/`raw` with `skipPromptEnhancement: true` for Direct (verbatim) prompts.

## Voices (audio)

```http
GET /api/v1/voices
GET /api/v1/voices/saved
POST /api/v1/voices/saved
DELETE /api/v1/voices/saved/:voiceId
```

`GET /voices` explores ElevenLabs voices (query: `search`, `language`, `accent`, `gender`, `age`, `category`, `sort`, `page`, `pageSize`).

`POST /voices/saved` body: `{ "voiceId", "name", "publicOwnerId?", …metadata }`.

Use `voice_id` / saved `voiceId` as `elevenVoiceId` when generating voiceover.

## Generation

### Estimate cost

```http
POST /api/v1/generations/estimate
```

Body:

```json
{
  "mode": "image|video|script|audio",
  "resolution": "2K",
  "durationSeconds": 6,
  "audioEnabled": true,
  "audioType": "voiceover",
  "characterCount": 120,
  "prompt": "…",
  "referenceAssetIds": [],
  "referenceElementIds": [],
  "startFrameAssetId": null,
  "videoModel": "seedance-2.0"
}
```

For `mode: "audio"`: set `audioType` to `voiceover` or `sfx` (music blocked). Voiceover cost uses `characterCount` or `prompt` length. SFX uses `durationSeconds` (omit = Auto ~5s).

### Estimate batch (production budget)

```http
POST /api/v1/generations/estimate-batch
```

```json
{
  "items": [
    { "label": "prop_honey_jar", "mode": "image", "resolution": "2K", "hasReferenceInput": true, "maxRounds": 3 },
    { "label": "shot_S01", "mode": "video", "resolution": "1280x720", "durationSeconds": 6, "maxRounds": 3 },
    { "label": "vo_hook", "mode": "audio", "audioType": "voiceover", "characterCount": 180, "maxRounds": 1 }
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
  "stylePreset": "unstyled",
  "skipPromptEnhancement": true,
  "resolution": "2K",
  "quality": "high",
  "aspectRatio": "16:9",
  "styleSheetElementId": null,
  "referenceAssetIds": [],
  "referenceElementIds": [],
  "referenceIntent": "auto",
  "wait": true
}
```

**Video** (use `wait: false` and poll `GET /generations/:id`):

```json
{
  "mode": "video",
  "prompt": "…",
  "stylePreset": "unstyled",
  "skipPromptEnhancement": true,
  "durationSeconds": 6,
  "resolution": "1280x720",
  "aspectRatio": "16:9",
  "audioEnabled": true,
  "videoModel": "seedance-2.0",
  "startFrameAssetId": null,
  "referenceElementIds": [],
  "wait": false
}
```

**Script** (creates a markdown document):

```json
{
  "mode": "script",
  "prompt": "Write a 30s ad script for…",
  "scriptType": "production",
  "stylePreset": "unstyled",
  "skipPromptEnhancement": true
}
```

**Audio** (voiceover / SFX; music not available):

```json
{
  "mode": "audio",
  "audioType": "voiceover",
  "prompt": "Spoken copy here…",
  "elevenVoiceId": "…",
  "elevenVoiceName": "Rachel",
  "wait": false
}
```

SFX example: `{ "mode": "audio", "audioType": "sfx", "prompt": "Soft whoosh", "durationSeconds": 2 }`.

Job responses include `threadId`, `stylePresetSlug`, and `creditsSpent` when available.

## Assisted production

Agent-friendly brief workflow (no chat streaming). Optimistic concurrency via `expectedRevision`.

```http
POST /api/v1/assistance/briefs
GET /api/v1/assistance/briefs/:briefId
GET /api/v1/assistance/threads/:threadId/brief
PATCH /api/v1/assistance/briefs/:briefId
PATCH /api/v1/assistance/briefs/:briefId/production
POST /api/v1/assistance/briefs/:briefId/approve
POST /api/v1/assistance/briefs/:briefId/reject
GET /api/v1/assistance/approvals?status=pending
POST /api/v1/assistance/approvals/:id/decide
```

Typical loop: `POST /assistance/briefs` → patch production until `status` is `review_ready` → `POST .../approve` → poll `GET /generations/:id`.

Approve requires `generate` scope. Reject / decide require `write`.

## Video edits

```http
POST /api/v1/edits
GET /api/v1/edits?folderId=
GET /api/v1/edits/:id
PUT /api/v1/edits/:id
PATCH /api/v1/edits/:id
POST /api/v1/edits/:id/clips
PATCH /api/v1/edits/:id/clips
DELETE /api/v1/edits/:id/clips
POST /api/v1/edits/:id/clips/reorder
POST /api/v1/edits/:id/clips/split
POST /api/v1/edits/:id/clips/transition
POST /api/v1/edits/:id/frame
POST /api/v1/edits/:id/export
```

`POST /edits` body: `{ "folderId?", "name?", "sourceAssetId?", "assetIds?", "frameRatio?" }`. When `assetIds` is set, clips are seeded on `track-v1` (video/image) and audio tracks.

`PUT` replaces full `project` JSON (escape hatch). Prefer clip routes for agent edits:

- `POST .../clips` — append (`assetIds` or `clips[]`, optional `atTime`)
- `PATCH .../clips` — `{ "clips": [{ "clipId", "trimIn?", "trimOut?", "startTime?", "transitionOut?", ... }] }`
- `DELETE .../clips` — `{ "clipIds", "ripple?" }`
- `POST .../clips/reorder` — `{ "trackId", "clipIds" }` (full track order)
- `POST .../clips/split` — `{ "clipId", "timeSec" }`
- `POST .../clips/transition` — `{ "clipId", "type?", "duration?", "clear?" }`
- `POST .../frame` — ffmpeg still → image asset (`timeSec` playhead, or `assetId` + `localTimeSec`); `generate` scope
- `POST .../export` — ffmpeg render → `{ "assetId" }` (`generate` scope); optional `{ "name" }`

Clip ops return compact timeline summaries by default (`compact: false` includes full `project`).

## Rate limits

**Disabled** for VPS agent / cinema batch operations (folder organize, multi-asset moves). Audit logging via `apiRequestLog` still runs.

Concurrent in-flight generation jobs (image/video/audio): **10 per API key**.

## MCP

Use `@yatishara/studio-mcp` **v0.6+** (or local `packages/studio-mcp`) with `STUDIO_API_KEY` and `STUDIO_API_URL`. See Settings → API keys and [`packages/studio-mcp/README.md`](../packages/studio-mcp/README.md). Preferred agent entry: `studio_bootstrap`, `studio_ensure_path`, `studio_generate_batch`, timeline edit tools (`studio_edit_*`, `studio_pull_frame`).

## Errors

JSON body: `{ "error": "message" }` with HTTP status `400`, `401`, `403`, `404`, `409`, or `429`.
