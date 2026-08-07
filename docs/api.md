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
| `messages` | Direct messages / inbox (user-level; not limited to the API key sandbox folder tree) |
| `social` | Social feed, follows, profile social actions (user-level; not sandbox-limited) |
| `marketplace` | Marketplace listings and offers (user-level; not sandbox-limited) |

## Discovery

- `GET /api/v1` — API name, version, scope list, endpoint index
- `GET /api/v1/openapi.json` — OpenAPI 3.1 document
- `GET /api/v1/catalog/script-types` — scriptType values for script generation
- `GET /api/v1/catalog/reference-intents` — referenceIntent values (`auto`, `stylize`, `match_reference`, `element_lock`)
- `GET /api/v1/video-models?scope=mcp` — video model catalog (includes MCP-only models)

## Account

```http
GET /api/v1/account
GET /api/v1/account/payments
GET /api/v1/account/payments/:id
GET /api/v1/account/credits?numItems=&cursor=
GET /api/v1/account/plans
GET /api/v1/account/pricing
GET /api/v1/account/storage
GET /api/v1/account/subscription
```

`GET /account` returns credit balance (and basic plan info). Deeper billing endpoints require `read` scope.
`GET /account/subscription` returns balance plus active subscription summary.
MCP: `studio_list_payments`, `studio_list_credit_transactions`, `studio_get_storage`, etc.

## Messages (DMs)

Requires `messages` scope. Not limited to the API key sandbox folder.

```http
GET /api/v1/messages/conversations?labelId=
POST /api/v1/messages/conversations
GET /api/v1/messages/search?q=
GET /api/v1/messages/unread-count
GET /api/v1/messages/conversations/:id/messages?limit=
POST /api/v1/messages/conversations/:id/messages
POST /api/v1/messages/conversations/:id/images
POST /api/v1/messages/conversations/:id/voice
POST /api/v1/messages/conversations/:id/media
POST /api/v1/messages/conversations/:id/share
POST /api/v1/messages/conversations/:id/read
GET|POST /api/v1/messages/labels
PATCH|DELETE /api/v1/messages/labels/:id
GET|PUT /api/v1/messages/peers/:userId/labels
GET /api/v1/messages/peers/:userId/panel
GET|POST /api/v1/messages/peers/:userId/notes
PATCH|DELETE /api/v1/messages/notes/:id
POST /api/v1/messages/peers/:userId/block
POST /api/v1/messages/peers/:userId/unblock
```

`POST /conversations` body: `{ "username" }`.

`POST .../messages` body: `{ "body", "replyToMessageId?" }`.

`POST .../images` body: `{ "assetId", "caption?", "replyToMessageId?" }` — billable Studio image asset (typically in the Messages folder).

`POST .../voice` body: `{ "assetId", "durationSec", "replyToMessageId?" }` — billable Studio audio asset in Messages.

`POST .../media` body: `{ "assetId?", "assetIds?", "items?", "note?", "delivery?", "permission?" }` — UI Choose/Share parity. Default `delivery=file` copies into the peer's Messages folder and posts image/video bubbles (supports video). `delivery=access` grants live Shared-with-me links. MCP: `studio_send_media_message`.

`POST .../share` body: `{ "postId", "commentId?", "note?" }`.

`POST /labels` body: `{ "name", "icon" }`. `PUT .../peers/:userId/labels` body: `{ "labelIds": [] }`.


## Social (feed / profiles)

Requires `social` scope. User-level (not limited to the API key sandbox folder).

```http
GET|PATCH /api/v1/profiles/me
GET /api/v1/profiles/username-available?username=
POST /api/v1/profiles/claim-username
POST /api/v1/profiles/change-username
GET /api/v1/profiles/:username
POST|DELETE /api/v1/profiles/:profileId/follow
GET /api/v1/profiles/me/following
GET /api/v1/profiles/people
GET /api/v1/feed?mode=forYou|following&limit=&seedPostId=
GET|POST /api/v1/feed/posts
GET /api/v1/feed/collection?kind=saved|liked|shared
DELETE /api/v1/feed/posts/by-asset/:assetId
PATCH /api/v1/feed/posts/:postId
GET /api/v1/feed/assets/:assetId/shared
GET /api/v1/feed/shared-asset-ids
GET /api/v1/feed/posts/:postId/media
POST /api/v1/feed/posts/:postId/like
POST /api/v1/feed/posts/:postId/save
POST /api/v1/feed/posts/:postId/share
POST /api/v1/feed/posts/:postId/view
GET|POST /api/v1/feed/posts/:postId/comments
GET /api/v1/feed/comments/:parentId/replies
POST /api/v1/feed/comments/:commentId/like
DELETE /api/v1/feed/comments/:commentId
GET /api/v1/feed/suggest/hashtags?query=&limit=
GET /api/v1/feed/suggest/people?query=&limit=
```

`POST /feed/posts` body: `{ "assetId", "caption?", "hashtags?", "keywords?" }` (share owned image/video).
`PATCH /profiles/me` body: `{ "bio?", "isPublic?", "contactLinks?", "avatarAssetId?", "useSellerDisplayName?" }`.
MCP: `studio_list_feed`, `studio_share_asset_post`, `studio_toggle_like`, `studio_follow`, etc. (`packages/studio-mcp` social tools).

## Notifications

Requires `social` scope.

```http
GET /api/v1/notifications
POST /api/v1/notifications/:id/read
```

MCP: `studio_list_notifications`, `studio_mark_notification_read`.

## Creative Network (marketplace)

Requires `marketplace` scope. User-level (not sandbox-limited).

```http
GET /api/v1/network/offers?category=&limit=&expiresUnix=
GET /api/v1/network/offers/:slug?expiresUnix=
GET /api/v1/network/offers/:offerId/reviews
GET /api/v1/network/offers/:offerId/quote?packageIndex=
POST /api/v1/network/offers/:offerId/book
GET /api/v1/network/sellers/:username/offers
GET /api/v1/network/sellers/:username/hire
GET /api/v1/network/sellers/approved/:userId
GET /api/v1/network/me/seller
GET|POST /api/v1/network/me/offers
PATCH /api/v1/network/me/offers/:offerId
POST /api/v1/network/me/offers/:offerId/status
GET /api/v1/network/jobs/seller?offerId=
GET /api/v1/network/jobs/buyer
GET /api/v1/network/jobs/with/:peerUserId
GET /api/v1/network/jobs/:jobId
POST /api/v1/network/jobs/:jobId/deliver
POST /api/v1/network/jobs/:jobId/accept
POST /api/v1/network/jobs/:jobId/cancel
POST /api/v1/network/jobs/:jobId/review
GET|POST /api/v1/network/listings
GET /api/v1/network/listings/quote?assetId=
GET /api/v1/network/listings/:listingId
POST /api/v1/network/listings/:listingId/prepare-purchase
POST /api/v1/network/listings/:listingId/purchase
GET /api/v1/network/me/listings
GET /api/v1/network/me/listings/summary?nowMs=
GET /api/v1/network/me/listings/for-asset/:assetId
GET /api/v1/network/me/listings/:listingId
POST /api/v1/network/me/listings/prepare
POST /api/v1/network/me/listings/commit
POST /api/v1/network/me/listings/:listingId/unlist
POST /api/v1/network/purchases/:purchaseId/finalize
```

`POST /network/listings` body: `{ "assetId", "title", "description?" }` — orchestrates prepare → Bunny copy → commit (approved seller).
`POST /network/listings/:id/purchase` — orchestrates prepare → Bunny copy → finalize.
`POST .../book` body: `{ "packageIndex?" }`. Seller offer create/update bodies match marketplace offer fields.
MCP: `studio_list_network_offers`, `studio_book_offer`, `studio_list_on_network`, `studio_purchase_network_listing`, etc.

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

See `GET /elements/production-guide` and [start-frame-workflow.md](../archive/2026-08-01-cartoon-ad-production/references/start-frame-workflow.md) (archived multi-specialist skill; live path is Assistance / direct gen).

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
  "videoModel": "seedance-2.5"
}
```

For `mode: "audio"`: set `audioType` to `voiceover`, `sfx`, or `music`. Voiceover cost uses `characterCount` or `prompt` length. SFX uses `durationSeconds` (omit = Auto ~5s). Music uses `durationSeconds` 3–300 (default 30s); optional `forceInstrumental` (default true).

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
  "videoModel": "seedance-2.5",
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

**Audio** (voiceover / SFX / music):

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

Music example: `{ "mode": "audio", "audioType": "music", "prompt": "Upbeat Caribbean soca bed, instrumental", "durationSeconds": 30, "forceInstrumental": true }`.

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
POST /api/v1/edits/:id/package
POST /api/v1/edits/:id/clips/download
POST /api/v1/edits/:id/text
POST /api/v1/edits/:id/clips/duplicate
POST /api/v1/edits/:id/clips/detach-audio
PATCH /api/v1/edits/:id/tracks/:trackId
POST /api/v1/edits/:id/frame-ratio
```

`POST /edits` body: `{ "folderId?", "name?", "sourceAssetId?", "assetIds?", "frameRatio?" }`. When `assetIds` is set, clips are seeded on `track-v1` (video/image) and audio tracks.

`PUT` replaces full `project` JSON (escape hatch). Prefer clip routes for agent edits:

- `POST .../clips` — append (`assetIds` or `clips[]`, optional `atTime`)
- `PATCH .../clips` — `{ "clips": [{ "clipId", "trimIn?", "trimOut?", "startTime?", "effects?", "transitionOut?", ... }] }`
- `DELETE .../clips` — `{ "clipIds", "ripple?" }`
- `POST .../clips/reorder` — `{ "trackId", "clipIds" }` (full track order)
- `POST .../clips/split` — `{ "clipId", "timeSec" }`
- `POST .../clips/transition` — `{ "clipId", "type?", "duration?", "clear?" }`
- `POST .../frame` — ffmpeg still → image asset (`timeSec` playhead, or `assetId` + `localTimeSec`); `generate` scope
- `POST .../export` — ffmpeg render → `{ "assetId" }` (`generate` scope); body `{ "name?", "exportKind?": "video"|"audio", "exportResolution?": "720p"|"1080p"|"4K", "audioFormat?": "mp3"|"wav"|"m4a" }`
- `GET|POST .../package` — portable `.studio` package manifest (`read` scope); optional `expiresUnix`
- `POST .../clips/download` — trimmed clip download URL (`generate` scope); prefer `{ "clipId" }` or `{ "assetId", "trimIn", "trimOut", "mode?" }`

Clip ops return compact timeline summaries by default (`compact: false` includes full `project`).

## Rate limits

**Disabled** for VPS agent / cinema batch operations (folder organize, multi-asset moves). Audit logging via `apiRequestLog` still runs.

Concurrent in-flight generation jobs (image/video/audio): **10 per API key**.

## MCP

Use `@yatishara/studio-mcp` **v0.8+** (or local `packages/studio-mcp`) with `STUDIO_API_KEY` and `STUDIO_API_URL`. See Settings → API keys and [`packages/studio-mcp/README.md`](../packages/studio-mcp/README.md). Preferred agent entry: `studio_bootstrap`, `studio_ensure_path`, `studio_generate_batch`, timeline edit tools (`studio_edit_*`, `studio_pull_frame`, `studio_export_edit`, `studio_download_edit_package`, `studio_download_clip_segment`).

## Errors

JSON body: `{ "error": "message" }` with HTTP status `400`, `401`, `403`, `404`, `409`, or `429`.
