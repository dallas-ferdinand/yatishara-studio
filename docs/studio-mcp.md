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

## Tools (21)

| Tool | Purpose |
|------|---------|
| `studio_health` | Verify key + credit balance |
| `studio_credit_balance` | Same as health |
| `studio_list_folders` | Browse folders |
| `studio_folder_contents` | Assets/docs in a folder |
| `studio_create_folder` | New folder |
| `studio_get_asset` | Asset + signed URL |
| `studio_upload_asset` | Base64 upload |
| `studio_get_document` | Read markdown doc |
| `studio_create_document` | Create markdown doc |
| `studio_update_document` | Update title/content/folder |
| `studio_list_elements` | Characters, props, locations |
| `studio_get_element` | Single element |
| `studio_create_element` | New character/prop/location/doc |
| `studio_list_trash` | List soft-deleted items |
| `studio_trash` | Move item to trash |
| `studio_restore` | Restore from trash |
| `studio_list_presets` | Style presets |
| `studio_estimate_generation` | Credit cost check |
| `studio_list_generations` | Recent jobs |
| `studio_get_generation` | Poll job status |
| `studio_generate_image` | Sync image gen |
| `studio_generate_video` | Async video + poll |
| `studio_generate_script` | Script → document |

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
