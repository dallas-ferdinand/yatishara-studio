# @yatishara/studio-mcp

stdio MCP server for [Yatishara Studio](https://studio.yatishara.com). Browse folders, generate images/videos, and save outputs to your workspace.

## Setup

1. Create an API key in Studio **Settings → API keys**.
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

- `studio_health` / `studio_credit_balance`
- `studio_list_folders`, `studio_folder_contents`, `studio_create_folder`, `studio_update_folder`
- `studio_get_asset`, `studio_upload_asset`, `studio_update_asset`
- `studio_get_document`, `studio_create_document`, `studio_update_document`
- `studio_list_elements`, `studio_get_element`, `studio_create_element`, `studio_update_element`
- `studio_list_trash`, `studio_trash`, `studio_restore`
- `studio_list_presets`, `studio_estimate_generation`
- `studio_list_generations`, `studio_get_generation`
- `studio_generate_image`, `studio_generate_video`, `studio_generate_script`

## VPS install

See [docs/studio-mcp.md](../../docs/studio-mcp.md). Launcher: `_system/mcp/run-studio-mcp.sh`.

## Local development

```bash
cd packages/studio-mcp
npm install
npm run build
STUDIO_API_KEY=ysk_live_... STUDIO_API_URL=https://... node dist/index.js
```
