# Studio handoff

Orchestrator calls Studio MCP directly (not a separate skill).

**Start frames:** [start-frame-workflow.md](start-frame-workflow.md) — no `scene` element type.

## Pipeline order (automated run)

1. **Phase D** — `studio_generate_element_sheet` or raw `studio_generate_image` for custom grids
2. **Phase C** — shot_packets reference approved assets + `storyboard_prompt` per shot with cast
3. **Bible** — `studio_create_document` → `production-bible.md` (internal artifact, not a gate)
4. **Phase E.5** — `studio_generate_image` per shot → `startFrameAssetId` (when people on camera)
5. **Phase E** — `studio_generate_video` per shot with `startFrameAssetId`

## Prerequisites

- Approved budget in thread (`approved_budget_credits`)
- **From MercuryOS or Studio workspace:** MCP server `yatishara-studio` enabled (`~/.cursor/mcp.json`)
- Launcher: `/opt/yatishara-studio/_system/mcp/run-studio-mcp.sh`
- Docs: `/opt/yatishara-studio/docs/studio-mcp.md`, `/opt/yatishara-studio/docs/api.md`
- API key: `/opt/yatishara-studio/_system/env/studio-mcp.env` (`STUDIO_API_KEY`)
- Generated assets land in **Yatishara Studio** folders (`{slug}-cinema-ad/`); copy to MercuryOS client tree via `yatishara-ad-production` if needed

## MCP defaults (cinema)

All image and video generation:

```json
{
  "skipPromptEnhancement": true,
  "stylePreset": "story-ad"
}
```

Models (via API env): GPT Image 2 (images), Seedance 2.0 (video).

## Phase D — Prop / character sheets

### Preferred: element sheet API

```
studio_create_element({ type: "prop", name, folderId, sourceAssetIds })
studio_generate_element_sheet({ elementId, resolution: "2K" })
```

Returns `sheetUrl` — orchestrator **Read**s image for visual scrutiny.

Character sheets are for **storyboard** composition and prompt text — **not** video face refs.

## Phase E.5 — Storyboard (start frame)

When any character is on camera in the shot:

```
studio_generate_image({
  prompt: shot_packet.storyboard_prompt,
  referenceElementIds: shot_packet.referenceElementIds,
  stylePreset: "story-ad",
  skipPromptEnhancement: true,
  aspectRatio: brief aspect ratio,
  resolution: "2K",
  folderId: "..."
})
```

Record `assets[0].id` as `shot_packet.startFrameAssetId`.

## Phase E — Video gen

### Per shot

```
studio_estimate_generation({ mode: "video", resolution: "1280x720", durationSeconds: shot_packet.generation_duration_sec, referenceElementIds, startFrameAssetId })
studio_generate_video({
  prompt: shot_packet.generation_prompt,
  startFrameAssetId: shot_packet.startFrameAssetId,
  stylePreset: "story-ad",
  skipPromptEnhancement: true,
  referenceElementIds: shot_packet.referenceElementIds,
  durationSeconds: shot_packet.generation_duration_sec,
  aspectRatio: brief aspect ratio,
  folderId: "..."
})
```

`generation_duration_sec` — Studio min **4**. When editorial `duration_sec` < 4, generate at 4 and set `editorial_trim_sec` on shot_packet.

### referenceElementIds rules (mandatory)

- Pass **full** `referenceElementIds` per shot (characters + props + locations) for audit and prompt append
- **Storyboard (image):** all built sheets attach as refs
- **Video mode (Studio automatic):**
  - `startFrameAssetId` → opening frame (people baked in)
  - attaches **prop + location** sheets as `[Image N]` refs only
  - **character** sheets **not** sent as video images — identity via start frame + prompt
- Cross-check `generation/shot-reference-allocation.json` before every generate call
- **Never** raw upload `referenceAssetIds` for cast/locations/props in Phase E
- **Wait ≥65s** between `studio_generate_video` calls (1 req/min gateway quota)

## Visual scrutiny (Phase E)

After each clip:

1. `studio_get_generation` → asset URL
2. **View the clip** (browser/CDP frame capture)
3. prop-master + dp + style-supervisor visual_scrutiny
4. Revise prompt or refs; regen (max 3 rounds)

## Budget tools

- Single call: `studio_estimate_generation`
- Production budget: `studio_estimate_production` (batch + contingency + TT$)

## Failure handling

| Failure | Action |
|---------|--------|
| Real person filter | Missing start frame — run E.5 storyboard; do not attach character sheets to video |
| Prop drift in clip | Re-attach prop sheet; tighten prompt; regen |
| Wrong material | Return to Phase D prop revision |
| Style mismatch | style-supervisor revises bible line; regen |
| Over budget | Skip optional assets or abort with partial deliverable |
