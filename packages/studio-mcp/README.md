# @yatishara/studio-mcp

stdio MCP server for [Yatishara Studio](https://studio.yatishara.com). Browse folders, generate images/videos/audio/scripts (including batches), run assisted production, and export video edits.

## Setup

1. Create an API key in Studio **Settings → API keys** (`read` + `write` + `generate`).
2. Add to your Cursor MCP config:

```json
{
  "mcpServers": {
    "yatishara-studio": {
      "command": "npx",
      "args": ["-y", "@yatishara/studio-mcp"],
      "env": {
        "STUDIO_API_KEY": "ysk_live_...",
        "STUDIO_API_URL": "https://your-convex-site.example.com",
        "STUDIO_MCP_COMPACT": "1"
      }
    }
  }
}
```

`STUDIO_API_URL` is your Convex site URL (`NEXT_PUBLIC_CONVEX_SITE_URL`).
`STUDIO_MCP_COMPACT=1` trims bulky JSON by default (override per call with `compact: false`).

## Agent start here

1. **`studio_bootstrap`** — credits + folder tree + start-here hints (optional `path` / `folderId`)
2. **`studio_ensure_path`** — create nested folders in one call
3. **`studio_estimate_generation`** / **`studio_estimate_batch`** then **`studio_generate_*`** / **`studio_generate_batch`**
4. **`studio_view_media`** — inspect outputs before the next round
5. **Edit timeline:** `studio_create_edit` → `studio_edit_append_clips` → `studio_pull_frame` → trim/reorder/transition → `studio_export_edit`

Prefer `studio_workspace_tree` / `studio_search` / `studio_project_context` over blind `studio_list_folders` BFS.

Tools marked **`[preferred]`** in descriptions are the default path. **`[deprecated]`** = keep for compatibility only (`studio_list_presets`). Nothing else was removed — list/get CRUD tools are still valid, just not the first choice.

## Tools

### Orientation (preferred)
- `studio_bootstrap`, `studio_ensure_path`
- `studio_workspace_tree`, `studio_resolve_path`, `studio_search`, `studio_project_context`
- `studio_bulk_move`

### Account
- `studio_health` / `studio_credit_balance` (alias)

### Folders & files
- `studio_list_folders`, `studio_get_folder`, `studio_folder_contents`, `studio_create_folder`, `studio_update_folder`
- `studio_get_asset`, `studio_view_media`, `studio_upload_asset`, `studio_reserve_upload`, `studio_complete_upload`, `studio_update_asset`, `studio_duplicate_asset`
- `studio_get_document`, `studio_create_document`, `studio_update_document`
- `studio_list_trash`, `studio_trash`, `studio_restore`

### Elements & style sheets
- `studio_production_guide`, `studio_element_sheet_guide`
- `studio_list_elements`, `studio_get_element`, `studio_create_element`, `studio_update_element`
- `studio_generate_element_text_sheet`, `studio_generate_element_sheet`
- `studio_create_style_sheet`, `studio_build_style_sheet`, `studio_set_active_style_sheet`

### Generation
- `studio_estimate_generation`, `studio_estimate_batch`
- `studio_generate_batch` — queue ≤8 jobs, poll together (videos spaced ≥65s)
- `studio_list_generations`, `studio_get_generation`
- `studio_generate_image`, `studio_generate_video`, `studio_generate_script`, `studio_generate_audio`
- `studio_list_video_models`, `studio_list_script_types`, `studio_list_reference_intents`
- `studio_list_style_sheets`, `studio_list_presets` (deprecated)
- `studio_validate_production_gates`

### Voices
- `studio_explore_voices`, `studio_list_saved_voices`, `studio_save_voice`, `studio_remove_voice`

### Assisted production (UI lane — optional)
- `studio_ensure_brief`, `studio_get_brief`, `studio_patch_brief_production`
- `studio_list_pending_approvals`, `studio_approve_brief`, `studio_reject_brief`
- `studio_decide_assistance_approval`, `studio_list_threads`, `studio_get_thread_history`

### Video edits
- `studio_create_edit`, `studio_list_edits`, `studio_get_edit`, `studio_update_edit` (full JSON escape hatch)
- **Timeline ops (preferred):** `studio_edit_append_clips`, `studio_edit_update_clips`, `studio_edit_remove_clips`, `studio_edit_reorder_clips`, `studio_edit_split_clip`, `studio_edit_set_transition`
- `studio_pull_frame` — ffmpeg still → image asset (then `studio_view_media`)
- `studio_export_edit` — ffmpeg render → video asset

## VPS install

See [docs/studio-mcp.md](../../docs/studio-mcp.md). Launcher: `_system/mcp/run-studio-mcp.sh`.

## Local development

```bash
cd packages/studio-mcp
npm install
npm run build
STUDIO_API_KEY=ysk_live_... STUDIO_API_URL=https://... node dist/index.js
```
