# @yatishara/studio-mcp

stdio MCP server for [Yatishara Studio](https://studio.yatishara.com). Browse folders, generate images/videos/audio/scripts, run assisted production, and export video edits.

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
        "STUDIO_API_URL": "https://your-convex-site.example.com"
      }
    }
  }
}
```

`STUDIO_API_URL` is your Convex site URL (`NEXT_PUBLIC_CONVEX_SITE_URL`).

## Tools

### Account & discovery
- `studio_health` / `studio_credit_balance`
- `studio_list_video_models`, `studio_list_presets`, `studio_list_style_sheets`
- `studio_list_script_types`, `studio_list_reference_intents`

### Folders & files
- `studio_list_folders`, `studio_get_folder`, `studio_folder_contents`, `studio_create_folder`, `studio_update_folder`
- `studio_get_asset`, `studio_upload_asset`, `studio_reserve_upload`, `studio_complete_upload`, `studio_update_asset`
- `studio_get_document`, `studio_create_document`, `studio_update_document`
- `studio_list_trash`, `studio_trash`, `studio_restore`

### Elements & style sheets
- `studio_production_guide`, `studio_element_sheet_guide`
- `studio_list_elements`, `studio_get_element`, `studio_create_element`, `studio_update_element`
- `studio_generate_element_text_sheet`, `studio_generate_element_sheet`
- `studio_create_style_sheet`, `studio_build_style_sheet`, `studio_set_active_style_sheet`

### Generation
- `studio_estimate_generation`, `studio_estimate_batch`
- `studio_list_generations`, `studio_get_generation`
- `studio_generate_image`, `studio_generate_video`, `studio_generate_script`, `studio_generate_audio`
- `studio_validate_production_gates`

### Voices (audio)
- `studio_explore_voices`, `studio_list_saved_voices`, `studio_save_voice`, `studio_remove_voice`

### Assisted production
- `studio_ensure_brief`, `studio_get_brief`, `studio_patch_brief_production`
- `studio_list_pending_approvals`, `studio_approve_brief`, `studio_reject_brief`
- `studio_decide_assistance_approval`

### Video edits
- `studio_create_edit`, `studio_list_edits`, `studio_get_edit`, `studio_update_edit`, `studio_export_edit`

## VPS install

See [docs/studio-mcp.md](../../docs/studio-mcp.md). Launcher: `_system/mcp/run-studio-mcp.sh`.

## Local development

```bash
cd packages/studio-mcp
npm install
npm run build
STUDIO_API_KEY=ysk_live_... STUDIO_API_URL=https://... node dist/index.js
```
