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

1. **MCP resource `studio://guides/index`** — then the lane guide for the job (avoid spelunking every tool)
2. **`studio_bootstrap`** — credits + folder tree + start-here hints (optional `path` / `folderId`)
3. **`studio_ensure_path`** — create nested folders in one call
4. **`studio_estimate_generation`** / **`studio_estimate_batch`** then **`studio_generate_*`** / **`studio_generate_batch`**
5. **Inspect:** images → `studio_view_media`; video → `studio_pull_frames` (`studio://guides/pull-frames`)
6. **Edit:** `studio://guides/editing`

Prefer `studio_workspace_tree` / `studio_search` / `studio_project_context` over blind `studio_list_folders` BFS.

Tools marked **`[preferred]`** in descriptions are the default path. **`[deprecated]`** = keep for compatibility only (`studio_list_presets`, `studio_sample_video_frames`). Nothing else was removed — list/get CRUD tools are still valid, just not the first choice.

## Resources (read before exploring tools)

Agents should open **`studio://guides/index`** first, then the lane guide for the job. Bootstrap also lists these under `AGENT_START_HERE.guides`.

| URI | Lane |
|-----|------|
| `studio://guides/index` | Catalog |
| `studio://guides/start` | Session start |
| `studio://guides/workspace` | Folders / search / paths |
| `studio://guides/generation` | Direct image/video/script/audio |
| `studio://guides/elements` | Sheets + style sheets |
| `studio://guides/editing` | Timeline + export |
| `studio://guides/pull-frames` | N stills between times → Pulled Frames |
| `studio://guides/assistance` | Assistance UI briefs (optional) |
| `studio://guides/media` | Assets / upload / docs / trash |
| `studio://guides/voices` | Voice library |
| `studio://guides/messages` | DMs |
| `studio://guides/social` | Feed / profiles |
| `studio://guides/network` | Creative Network |
| `studio://guides/academy` | Academy |
| `studio://guides/account` | Credits / health |

## Tools

### Orientation (preferred)
- `studio_bootstrap`, `studio_ensure_path`
- `studio_workspace_tree`, `studio_resolve_path`, `studio_search`, `studio_project_context`
- `studio_bulk_move`

### Account
- `studio_health` / `studio_credit_balance` (alias)

### Folders & files
- `studio_list_folders`, `studio_get_folder`, `studio_folder_contents`, `studio_create_folder`, `studio_update_folder`
- `studio_get_asset`, `studio_view_media`, `studio_pull_frames` (video stills → Pulled Frames), `studio_sample_video_frames` (deprecated alias), `studio_upload_asset`, `studio_reserve_upload`, `studio_complete_upload`, `studio_update_asset`, `studio_duplicate_asset`
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
- `studio_edit_add_text`, `studio_edit_duplicate_clip`, `studio_edit_detach_audio`, `studio_edit_set_track_muted`, `studio_edit_set_frame_ratio`
- `studio_list_text_presets`, `studio_edit_apply_text_preset`
- `studio_pull_frames` — N stills from a source video (`startSec`/`endSec`/`count` or `timesSec`); saves into sibling **Pulled Frames**; Cursor Read returned URLs
- `studio_sample_video_frames` — deprecated alias of `studio_pull_frames`
- `studio_pull_frame` — one ffmpeg still from an open edit (also → Pulled Frames)
- `studio_export_edit` — video or audio render → Studio asset (`exportKind`, `exportResolution`, `audioFormat`)
- `studio_download_edit_package` — portable `.studio` package manifest (signed media + project JSON)
- `studio_download_clip_segment` — trimmed Save as video/audio download URL

### Academy & billing
- `studio_list_academy_courses`, `studio_get_academy_course`, `studio_list_my_academy_courses`
- `studio_purchase_academy_course` (credits) / `studio_start_checkout` (Wam)
- `studio_get_academy_intro`, `studio_get_academy_lesson`
- `studio_separate_music_stems` — split a music asset into stems

## VPS install

See [docs/studio-mcp.md](../../docs/studio-mcp.md). Launcher: `_system/mcp/run-studio-mcp.sh`.

## Local development

```bash
cd packages/studio-mcp
npm install
npm run build
STUDIO_API_KEY=ysk_live_... STUDIO_API_URL=https://... node dist/index.js
```
