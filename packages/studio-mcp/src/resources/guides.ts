import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type Guide = {
  name: string;
  uri: string;
  description: string;
  text: string;
};

function guide(name: string, slug: string, description: string, text: string): Guide {
  return {
    name,
    uri: `studio://guides/${slug}`,
    description,
    text: text.trim() + "\n",
  };
}

const INDEX = guide(
  "index",
  "index",
  "Catalog of Studio MCP agent guides — read this first, then open the lane you need.",
  `# Studio MCP — guide index

Read **these resources** before exploring dozens of tools. Prefer tools marked \`[preferred]\`. Deprecated aliases still work but are not the first choice.

## Start every job

1. Open **studio://guides/start**
2. Call \`studio_bootstrap\` (optional \`path\` / \`folderId\`)
3. Open the lane guide that matches the user ask

## Lanes

| Need | Resource |
|------|----------|
| Session start / orientation | \`studio://guides/start\` |
| Find/create folders, search, move | \`studio://guides/workspace\` |
| Generate image/video/script/audio | \`studio://guides/generation\` |
| Characters / props / style sheets | \`studio://guides/elements\` |
| Cut / timeline / export video | \`studio://guides/editing\` |
| Pull stills from MP4s | \`studio://guides/pull-frames\` |
| Studio Assistance briefs (UI) | \`studio://guides/assistance\` |
| Assets, upload, docs, trash | \`studio://guides/media\` |
| Voices / VO library | \`studio://guides/voices\` |
| DMs / messaging | \`studio://guides/messages\` |
| Feed / profiles / social | \`studio://guides/social\` |
| Creative Network marketplace | \`studio://guides/network\` |
| Credits / health / billing extras | \`studio://guides/account\` |

## Rules of thumb

- **Do not** BFS with repeated \`studio_list_folders\` — use tree / search / ensure_path.
- **Images:** \`studio_view_media\` + Cursor Read \`preferredViewUrl\`.
- **Video:** cannot scrub MP4 via Read → \`studio_pull_frames\` then Read stills.
- **Credits:** \`studio_estimate_*\` before expensive generate / export.
- **Assistance lane** only when the user wants Studio Assistance UI briefs — default is **direct** \`studio_generate_*\`.
`,
);

const START = guide(
  "start",
  "start",
  "Session start: bootstrap, preferred tools, what not to do.",
  `# Session start

## Preferred first call

\`studio_bootstrap\` — credits + workspace tree + agent start-here hints. Pass \`path\` or \`folderId\` when the job is already in a project.

Then open the matching lane from \`studio://guides/index\`.

## Preferred orientation tools

- \`studio_ensure_path\` — create nested folders in one call (not loop \`studio_create_folder\`)
- \`studio_workspace_tree\` / \`studio_search\` / \`studio_resolve_path\` — find things
- \`studio_project_context\` — pack for an existing project folder

## Avoid

- Blind \`studio_list_folders\` BFS
- One-by-one \`studio_create_folder\` for deep paths
- Exploring every tool schema when a lane guide already names the sequence
`,
);

const WORKSPACE = guide(
  "workspace",
  "workspace",
  "Folders, paths, search, project context, bulk move.",
  `# Workspace & files navigation

## Preferred

| Tool | Use |
|------|-----|
| \`studio_bootstrap\` | Start + optional project focus |
| \`studio_ensure_path\` | Create \`Clients/Foo/Bar\` in one shot |
| \`studio_workspace_tree\` | Compact tree |
| \`studio_search\` | Find by name |
| \`studio_resolve_path\` | Path → folder/asset ids |
| \`studio_project_context\` | One pack for a project folder |
| \`studio_bulk_move\` | Move many items |

## Fine for single-level browse

\`studio_list_folders\`, \`studio_get_folder\`, \`studio_folder_contents\`, \`studio_create_folder\`, \`studio_update_folder\`

## Tip

After creating structure, keep the \`folderId\` and pass it to generate / edit / upload calls so assets land in the right place.
`,
);

const GENERATION = guide(
  "generation",
  "generation",
  "Direct generation lane: estimate → generate / batch; models, scripts, refs.",
  `# Generation (direct lane — default)

Default for production skills. Agent owns the prompt. Do **not** force Assistance briefs unless the user asks.

## Sequence

1. \`studio_estimate_generation\` or \`studio_estimate_batch\` (credits)
2. \`studio_generate_image\` | \`studio_generate_video\` | \`studio_generate_script\` | \`studio_generate_audio\`
   - or \`studio_generate_batch\` (≤8 jobs; videos spaced ≥65s)
3. Poll via returned job / \`studio_get_generation\` / \`studio_list_generations\`
4. Inspect: images → \`studio_view_media\`; video → \`studio://guides/pull-frames\`

## Always pass \`folderId\` when you have one

Studio folders are the source of truth for outputs.

## Style

- **Direct / verbatim:** omit \`styleSheetElementId\` (default unstyled)
- **Styled:** pass built \`styleSheetElementId\` (see \`studio://guides/elements\`)
- \`studio_list_presets\` is **deprecated** (Style Sheets replace presets)

## Video helpers

- \`studio_list_video_models\` before exotic models (default Seedance 2.0)
- People on camera: generate a start frame image first, pass \`startFrameAssetId\`
- \`audioEnabled\` = Seedance native audio bed with the video

## Script

\`studio_list_script_types\` / \`scriptType\` (production, storyboard, shot_list, image_prompt, video_prompt, scene_split, vo_script, …)

## Optional

\`studio_validate_production_gates\` — only when using archived production-state.json gates; not required for normal Studio gen.
`,
);

const ELEMENTS = guide(
  "elements",
  "elements",
  "Elements, character/prop sheets, style sheets.",
  `# Elements & style sheets

## Before building sheets

1. \`studio_production_guide\`
2. \`studio_element_sheet_guide\` when generating sheets

## CRUD

\`studio_list_elements\`, \`studio_get_element\`, \`studio_create_element\`, \`studio_update_element\`

## Sheets

- \`studio_generate_element_text_sheet\` — text lock / bible-style
- \`studio_generate_element_sheet\` — visual sheet

## Style sheets

- \`studio_create_style_sheet\` / \`studio_build_style_sheet\`
- \`studio_set_active_style_sheet\`
- \`studio_list_style_sheets\`

Pass the built style sheet element id into \`studio_generate_*\` as \`styleSheetElementId\` when you want enhancement to stick look + context.
`,
);

const EDITING = guide(
  "editing",
  "editing",
  "Video edit projects: create, timeline ops, export, live-sync notes.",
  `# Video editing

## Sequence

1. \`studio_pull_frames\` on sources — see \`studio://guides/pull-frames\`
2. Cursor **Read** stills; skip bad windows
3. \`studio_create_edit\` (\`assetIds\`, \`folderId\`, \`frameRatio\`)
4. Trim / order with granular tools **or** full \`studio_update_edit\` replace
5. Verify with \`studio_pull_frame\` (timeline) or another \`studio_pull_frames\`
6. \`studio_export_edit\` → Studio asset

## Preferred timeline tools

\`studio_edit_append_clips\`, \`studio_edit_update_clips\`, \`studio_edit_remove_clips\`, \`studio_edit_reorder_clips\`, \`studio_edit_split_clip\`, \`studio_edit_set_transition\`, text/presets helpers, \`studio_edit_set_frame_ratio\`, \`studio_edit_set_track_muted\`

## Escape hatch

\`studio_update_edit\` with full \`project\` JSON when granular ops race or mute/timeline is stuck.

## Live sync

Open editor adopts newer Convex \`updatedAt\`. Still prefer \`studio_get_edit\` after big replaces; export soon after MCP writes if the UI tab is open.

## Audio

Keep source audio unless the user asks to mute. Do **not** set \`effects.volume: 0\` by default. Tracks \`muted: false\`.

## Export / package

- \`studio_export_edit\` — \`exportKind\` video|audio, resolution, optional name
- \`studio_download_edit_package\` — portable \`.studio\` package
- \`studio_download_clip_segment\` — trimmed segment download URL

Do not shell-ffmpeg when these tools exist.
`,
);

const PULL_FRAMES = guide(
  "pull-frames",
  "pull-frames",
  "Pull N video stills between two times into Pulled Frames; Cursor Read URLs.",
  `# Pull frames from Studio videos

Use when you need to *see* what's in an MP4 before trimming or after a cut. Cursor cannot scrub video via Read — pull stills, then Read the image URLs.

## Tool

**\`studio_pull_frames\`** (preferred). Alias: \`studio_sample_video_frames\` (deprecated).

### Range + count (usual)

\`\`\`json
{
  "assetId": "<video asset id>",
  "startSec": 6,
  "endSec": 10,
  "count": 4
}
\`\`\`

Evenly spaced samples in \`[startSec, endSec]\` (inclusive endpoints when count ≥ 2). Default window = full duration; default count = 3; max count = 12.

### Exact times

\`\`\`json
{ "assetId": "...", "timesSec": [0.5, 7.5, 14] }
\`\`\`

\`timesSec\` overrides start/end/count when set.

## Where files go

Stills are named \`Frame · {clip} · {time}.jpg\` and saved in a **sibling** folder **\`Pulled Frames\`** under the same parent as the source folder (not next to the clips). Response includes \`folderId\` + \`folderPath\`.

Single-frame edit pulls (\`studio_pull_frame\`) use the same folder. Trash Pulled Frames when done (optional).

Full edit lane: \`studio://guides/editing\`.
`,
);

const ASSISTANCE = guide(
  "assistance",
  "assistance",
  "Studio Assistance UI brief lane — only when user wants assisted briefs.",
  `# Assistance (optional UI lane)

Use **only** when the user wants Studio Assistance briefs in the product UI. Default production path is **direct** generation (\`studio://guides/generation\`).

## Sequence

1. \`studio_ensure_brief\`
2. \`studio_get_brief\` / \`studio_patch_brief_production\` / \`studio_edit_brief\` as needed
3. \`studio_list_pending_approvals\`
4. \`studio_approve_brief\` or \`studio_reject_brief\`
5. \`studio_decide_assistance_approval\` for tool-call approvals
6. Threads: \`studio_list_threads\`, \`studio_get_thread_history\`

Do not mix Assistance and direct generate in the same turn without a clear user preference.
`,
);

const MEDIA = guide(
  "media",
  "media",
  "Assets, view media, upload, documents, trash.",
  `# Media, documents, trash

## Inspect

- \`studio_get_asset\` — metadata + signed URLs
- \`studio_view_media\` — preferred for images (Cursor Read \`preferredViewUrl\`)
- Video stills → \`studio://guides/pull-frames\`

## Upload

- Small: \`studio_upload_asset\` (base64, max ~50MB)
- Large: \`studio_reserve_upload\` → PUT bytes → \`studio_complete_upload\`

## Mutate

\`studio_update_asset\` (rename/move), \`studio_duplicate_asset\`

## Documents

\`studio_get_document\`, \`studio_create_document\`, \`studio_update_document\`

## Trash

\`studio_list_trash\`, \`studio_trash\`, \`studio_restore\`

Agent-pulled stills live in **Pulled Frames** — trash that folder's contents when finished cleaning up.
`,
);

const VOICES = guide(
  "voices",
  "voices",
  "Explore and save Studio voices for audio / VO.",
  `# Voices

- \`studio_explore_voices\` — browse catalog
- \`studio_list_saved_voices\` — user's library
- \`studio_save_voice\` / \`studio_remove_voice\`

Generate spoken audio with \`studio_generate_audio\` (see \`studio://guides/generation\`). Confirm cost via estimate when spending credits.
`,
);

const MESSAGES = guide(
  "messages",
  "messages",
  "Studio DMs: conversations, send text/image/voice, labels, notes.",
  `# Messages (DMs)

## Browse / read

\`studio_list_conversations\`, \`studio_search_messages\`, \`studio_unread_count\`, \`studio_open_conversation\`, \`studio_list_messages\`, \`studio_mark_conversation_read\`

## Send

\`studio_send_message\`, \`studio_send_image_message\`, \`studio_send_voice_message\`

## Edit / delete

\`studio_edit_message\`, \`studio_delete_message\`

## Labels & peer panel

\`studio_list_dm_labels\`, create/update/delete labels, \`studio_peer_panel\`, peer notes, block/unblock

Confirm with the user before outbound sends when the content is customer-facing or money-adjacent.
`,
);

const SOCIAL = guide(
  "social",
  "social",
  "Feed, profiles, posts, likes, follows.",
  `# Social / feed

- Profile: \`studio_get_my_profile\`, \`studio_update_my_profile\`, \`studio_get_profile\`, username claim/change
- Feed: \`studio_list_feed\`, \`studio_list_public_posts\`, \`studio_list_my_collection\`
- Share: \`studio_share_asset_post\`, \`studio_unshare_post\`, \`studio_update_post_caption\`, \`studio_is_asset_shared\`
- Engage: \`studio_toggle_like\`, \`studio_toggle_save\`, comments, \`studio_follow\` / \`studio_unfollow\`
- Discover: \`studio_list_platform_people\`, \`studio_suggest_hashtags\`, \`studio_suggest_people\`
`,
);

const NETWORK = guide(
  "network",
  "network",
  "Creative Network: offers, jobs, listings, seller admin.",
  `# Creative Network

## Offers / hire

\`studio_list_network_offers\`, \`studio_get_network_offer\`, \`studio_create_offer\`, \`studio_update_offer\`, \`studio_set_offer_status\`, \`studio_book_offer\`, jobs list/get/deliver/accept/cancel/review

## Asset store listings

\`studio_browse_network_listings\`, \`studio_list_on_network\`, purchase prepare/finalize flows, \`studio_unlist_from_network\`

## Seller

\`studio_request_seller_access\`, payout account, \`studio_get_my_seller_status\`

## Admin (privileged)

\`studio_admin_*\` seller/offer/job/payout/listing tools — only for approved admin actors.

Money moves need explicit user confirmation.
`,
);

const ACCOUNT = guide(
  "account",
  "account",
  "Health, credits, notifications, subscriptions/payments extras.",
  `# Account & billing extras

- \`studio_health\` — preferred health + credits snapshot
- \`studio_credit_balance\` — alias of health
- Notifications: \`studio_list_notifications\`, \`studio_mark_notification_read\`
- Also available via account extras: payments list/get, credit transactions, subscription plans/pricing/storage/subscription

Always estimate generation/export cost before large spends.
`,
);

export const STUDIO_GUIDES: Guide[] = [
  INDEX,
  START,
  WORKSPACE,
  GENERATION,
  ELEMENTS,
  EDITING,
  PULL_FRAMES,
  ASSISTANCE,
  MEDIA,
  VOICES,
  MESSAGES,
  SOCIAL,
  NETWORK,
  ACCOUNT,
];

/** URIs for bootstrap / AGENT_START_HERE. */
export const STUDIO_GUIDE_URIS = STUDIO_GUIDES.map((g) => g.uri);

export function registerGuideResources(server: McpServer) {
  for (const g of STUDIO_GUIDES) {
    server.resource(
      g.name,
      g.uri,
      {
        description: g.description,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: g.text,
          },
        ],
      }),
    );
  }
}
