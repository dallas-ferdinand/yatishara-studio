# Yatishara Studio MCP (VPS)

Local MCP install — same pattern as MercuryOS MCP launchers (`coolify`, `memory`, etc.).

## Install (already on this VPS)

```bash
cd /opt/yatishara-studio/packages/studio-mcp
npm install && npm run build
```

Launcher: `/opt/yatishara-studio/_system/mcp/run-studio-mcp.sh`

Cursor config: `~/.cursor/mcp.json` → `yatishara-studio` server.

## Credentials

1. Studio → **Settings → API keys** → create key with `read` + `generate` (and `write` if uploading).
2. Put the key in **`/opt/yatishara-studio/_system/env/studio-mcp.env`**:

```bash
STUDIO_API_KEY=ysk_live_...
```

`STUDIO_API_URL` is optional; the launcher reads `CONVEX_SITE_URL` from `.env.local` automatically.

## Element sheet playbook (agents)

**Call `studio_production_guide` and `studio_element_sheet_guide` before any character/prop/location sheet work.**

Elements have two states — **unbuilt** (upload refs only) and **built** (`sheetAssetId` set). Generation always uses the **built sheet + description**, never the raw upload refs.

| Type | Min refs | Recommended | Sheet output |
|------|----------|-------------|--------------|
| character | 3 images | 4–8 | 3-panel: front / back / face |
| prop | 2 images | 3–6 | 2-panel: front / 3-4 |
| location | 2 images | 3–6 | 1 wide plate |

**Fidelity:** Sheets must **capture features exactly** from reference photos — no restyling, beautifying, or changing hair, face, wardrobe, materials, or wear.

**Workflow:**
1. `studio_upload_asset` × N (real photos, not one image)
2. `studio_create_element` with `referenceAssetIds` — element is **unbuilt**
3. `studio_generate_element_text_sheet` — optional markdown production bible
4. `studio_generate_element_sheet` — **builds** the sheet image (`buildStatus: built`)
5. Inspect `sheetUrl`, then generate with `referenceElementIds: [elementId]` — the API attaches the sheet and appends the description to the prompt

Never pass raw upload refs to video/image generation for a built element — use `referenceElementIds` or the `sheetAssetId`.

## Tools (33)

| Tool | Purpose |
|------|---------|
| `studio_health` | Verify key + credit balance |
| `studio_credit_balance` | Same as health |
| `studio_list_folders` | Browse folders |
| `studio_get_folder` | Single folder by ID |
| `studio_folder_contents` | Assets/docs in a folder |
| `studio_create_folder` | New folder |
| `studio_update_folder` | Rename or move folder |
| `studio_get_asset` | Asset + signed URL |
| `studio_upload_asset` | Base64 upload |
| `studio_update_asset` | Rename or move image/video/audio |
| `studio_get_document` | Read markdown doc |
| `studio_create_document` | Create markdown doc |
| `studio_update_document` | Rename, edit, or move document |
| `studio_list_elements` | Characters, props, locations (filter by type/folder) |
| `studio_get_element` | Single element with buildStatus + sheetUrl |
| `studio_create_element` | New character/prop/location/doc (unbuilt) |
| `studio_update_element` | Rename, move, or update upload refs |
| `studio_production_guide` | **Read first** — build states + generation rules |
| `studio_element_sheet_guide` | Ref counts, fidelity rules, workflow per type |
| `studio_generate_element_text_sheet` | Markdown production bible → description |
| `studio_generate_element_sheet` | Build multi-panel reference sheet image |
| `studio_list_trash` | List soft-deleted items |
| `studio_trash` | Move item to trash |
| `studio_restore` | Restore from trash |
| `studio_list_presets` | Style presets (includes `raw`) |
| `studio_estimate_generation` | Single-call credit cost check (accepts `referenceElementIds`) |
| `studio_estimate_production` | Batch budget with credits + TT$ |
| `studio_list_generations` | Recent jobs |
| `studio_get_generation` | Poll job status |
| `studio_generate_image` | Sync image gen — **storyboard stills** with full `referenceElementIds` (characters included) |
| `studio_list_video_models` | Seedance 2.0 |
| `studio_generate_video` | Async video + poll — pass **`startFrameAssetId`** when people on camera; `referenceElementIds` for prop/location refs; optional `videoModel: "kling-3.0-i2v"` fallback |
| `studio_validate_production_gates` | Pre-flight cinema gate check — pass `production-state.json` body before `studio_generate_*` |
| `studio_generate_script` | Script → document |

## Cinema ad production defaults

For `@cinema-ad-production` automated runs, always pass:

```json
{ "stylePreset": "story-ad", "skipPromptEnhancement": true }
```

Use `raw` only for non-cinema ad-hoc tests. Call `studio_validate_production_gates` before phase generate batches.

Prop sheets: prefer `studio_generate_element_sheet` over ad-hoc image gen.

**Video with people:** two steps per shot — `studio_generate_image` (storyboard → `startFrameAssetId`) then `studio_generate_video` with that ID. No `scene` element type. See `.cursor/skills/cinema-ad-production/references/start-frame-workflow.md`.

Budget: `studio_estimate_production` before `plan` mode budget approval.

## vs Higgsfield

| Higgsfield CLI | Studio MCP |
|----------------|------------|
| `higgsfield account status` | `studio_health` |
| `higgsfield generate cost` | `studio_estimate_generation` |
| `higgsfield generate create` | `studio_generate_image` / `_video` |
| Saves to Higgsfield cloud | Saves to **your Studio folders** |

## Rebuild after code changes

```bash
cd /opt/yatishara-studio/packages/studio-mcp && npm run build
```

Restart Cursor MCP or reload the `yatishara-studio` server.
