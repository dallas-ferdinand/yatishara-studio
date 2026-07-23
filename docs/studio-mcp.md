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

## Agent start here

1. `studio_bootstrap` — credits + tree + hints (optional `path` / `folderId` / `ensurePath`)
2. `studio_ensure_path` — nested folders in one call
3. `studio_estimate_*` → `studio_generate_*` or `studio_generate_batch`
4. `studio_view_media` before the next round

Prefer `studio_workspace_tree` / `studio_search` / `studio_project_context` over BFS `studio_list_folders`.

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

## Tools (highlights)

| Tool | Purpose |
|------|---------|
| `studio_bootstrap` | **Start here** — account + tree + hints |
| `studio_ensure_path` | Create nested folders (`Clients/X/refs`) |
| `studio_workspace_tree` / `studio_search` / `studio_project_context` | Orient without BFS |
| `studio_bulk_move` | Move up to 50 items |
| `studio_health` | Verify key + credit balance |
| `studio_list_folders` | One-level browse (prefer tree/search) |
| `studio_get_folder` | Single folder by ID |
| `studio_folder_contents` | Assets/docs in a folder |
| `studio_create_folder` | New folder (prefer `ensure_path` for nests) |
| `studio_update_folder` | Rename or move folder |
| `studio_get_asset` | Asset + signed URL |
| `studio_view_media` | Signed URLs for host viewing |
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
| `studio_list_style_sheets` | Built Style Sheet elements |
| `studio_create_style_sheet` | New Style Sheet (unbuilt) |
| `studio_build_style_sheet` | Build visual style board |
| `studio_set_active_style_sheet` | Doc-only — pass `styleSheetElementId` on generate |
| `studio_list_presets` | Deprecated — Direct/unstyled only |
| `studio_estimate_generation` | Single-call credit cost check |
| `studio_estimate_batch` | Batch budget with credits + TT$ |
| `studio_generate_batch` | Queue ≤8 gens + poll (videos spaced ≥65s) |
| `studio_list_generations` | Recent jobs |
| `studio_get_generation` | Poll job status |
| `studio_generate_image` | Sync image gen |
| `studio_list_video_models` | seedance-2.0 + MCP-only models |
| `studio_generate_video` | Async video + poll |
| `studio_generate_audio` | Voiceover / SFX |
| `studio_validate_production_gates` | Pre-flight cartoon gate check |
| `studio_generate_script` | Script → document |

## Style Sheets + direct handoff

**Direct (default for cartoon-ad-production):**

```json
{ "skipPromptEnhancement": true }
```

Prompts reach Seedance/GPT Image 2 verbatim — no GPT rewrite.

**Styled generation:** create a Style Sheet element first:

1. `studio_create_style_sheet` — name + `styleRules` (+ optional mood refs)
2. `studio_build_style_sheet` — visual style board image
3. `studio_generate_image|video|script` with `styleSheetElementId` and `skipPromptEnhancement: false`

`studio_list_style_sheets` lists built sheets. `studio_list_presets` is deprecated (Direct/unstyled only). Legacy `toon-*` stylePreset slugs return HTTP 410.

Element sheets: `stylePresetSlug: unstyled` on `studio_generate_element_sheet`.

Prop sheets: prefer `studio_generate_element_sheet` over ad-hoc image gen.

**Video with people:** two steps per shot — `studio_generate_image` (storyboard → `startFrameAssetId`) then `studio_generate_video` with that ID. No `scene` element type. See `.cursor/skills/cartoon-ad-production/references/start-frame-workflow.md`.

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
