# Studio handoff

Orchestrator calls Studio MCP directly (not a separate skill).

## Pipeline order (automated run)

1. **Phase D** — `studio_generate_element_sheet` or raw `studio_generate_image` for custom grids
2. **Phase C** — shot_packets reference approved assets
3. **Bible** — `studio_create_document` → `production-bible.md` (internal artifact, not a gate)
4. **Phase E** — `studio_generate_video` per shot (automatic, no human stop)

## Prerequisites

- Approved budget in thread (`approved_budget_credits`)
- Studio MCP configured per [docs/studio-mcp.md](../../../../docs/studio-mcp.md)
- `STUDIO_API_KEY` in `_system/env/studio-mcp.env`

## MCP defaults (cinema)

All image and video generation:

```json
{
  "stylePreset": "raw",
  "skipPromptEnhancement": true
}
```

Models (via API env): GPT Image 2 (images), Seedance 2.0 (video).

## Phase D — Prop / character sheets

### Preferred: element sheet API

```
studio_create_element({ type: "prop", name, folderId, referenceAssetIds })   // unbuilt
studio_generate_element_text_sheet({ elementId })                            // optional bible
studio_generate_element_sheet({ elementId, resolution: "2K" })               // built
```

Returns `sheetUrl` + full element (`buildStatus: "built"`, `sheetAssetId`) — orchestrator **Read**s image for visual scrutiny.

### Fallback: 3×3 cinema grid

When standard 2-panel sheet is insufficient:

```
studio_generate_image({
  prompt: prop_sheet_prompt,  // from prop-master 3×3 spec
  stylePreset: "raw",
  skipPromptEnhancement: true,
  resolution: "2K",
  referenceAssetIds: [...]
})
```

Record `studio_asset_id` in `approved_asset_registry`.

## Phase E — Video gen

### Per shot

```
studio_estimate_generation({ mode: "video", resolution: "1280x720", durationSeconds, referenceElementIds })
studio_generate_video({
  prompt: shot_packet.generation_prompt,
  stylePreset: "raw",
  skipPromptEnhancement: true,
  referenceElementIds: [built element ids],   // resolves to sheet + appends bible to prompt
  durationSeconds: shot_packet.duration_sec,
  aspectRatio: brief aspect ratio
})
```

### Reference rules

- Prefer `referenceElementIds` for elements built via `studio_generate_element_sheet` — the API attaches the sheet and rejects unbuilt elements
- Custom 3×3 grid assets (no element) → `referenceAssetIds` with the registry `studio_asset_id`
- Never attach raw upload photos of a built element — only the sheet
- Never attach unapproved Phase D assets

## Visual scrutiny (Phase E)

After each clip:

1. `studio_get_generation` → asset URL
2. **View the clip** (browser/CDP frame capture)
3. prop-master + dp + style-supervisor visual_scrutiny
4. Revise prompt or refs; regen (max 3 rounds)

## Budget tools

- Single call: `studio_estimate_generation`
- Production budget: `studio_estimate_production` (batch + contingency + TT$)

## Cost ledger

Before each generate: check cap per [cost-ledger.md](cost-ledger.md).

Persist `cost-ledger.json` in project folder.

## Failure handling

| Failure | Action |
|---------|--------|
| Prop drift in clip | Re-attach prop sheet; tighten prompt; regen |
| Wrong material | Return to Phase D prop revision |
| Style mismatch | style-supervisor revises bible line; regen |
| Over budget | Skip optional assets or abort with partial deliverable |
