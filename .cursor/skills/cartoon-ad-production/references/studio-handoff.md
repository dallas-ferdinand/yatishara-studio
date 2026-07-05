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
- Generated assets land in **Yatishara Studio** folders (`{slug}-cartoon-ad/`); copy to MercuryOS client tree via `yatishara-ad-production` if needed

## MCP defaults (direct handoff)

All image and video generation — **no GPT/Flash rewrite** ([direct-prompt-handoff.md](direct-prompt-handoff.md)):

```json
{
  "stylePreset": "unstyled",
  "skipPromptEnhancement": true
}
```

Models (via API env): GPT Image 2 (images). Video: **Seedance 2.0** default (Studio UI + MCP when `videoModel` omitted). MCP can **choose** `kling-3.0-i2v` per production or per shot — pass explicit `videoModel`; log choice in `production-state.json` overrides.

List models: `studio_list_video_models` — returns both slugs; pick one, pass it on estimate + generate.

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
  stylePreset: "unstyled",
  skipPromptEnhancement: true,
  aspectRatio: brief aspect ratio,
  resolution: "2K",
  folderId: "..."
})
```

Record `assets[0].id` as `shot_packet.startFrameAssetId`.

## Phase E — Video gen

**Default:** omit `videoModel` → Seedance 2.0 (same as Studio UI).

**Kling choice:** when production selects Kling (faces, start-frame I2V), pass `videoModel: "kling-3.0-i2v"` on **both** estimate and generate. Requires `startFrameAssetId`. Not a silent fallback — explicit per-run or per-shot choice.

### Per shot

```
studio_estimate_generation({ mode: "video", resolution: "1280x720", durationSeconds: shot_packet.generation_duration_sec, referenceElementIds, startFrameAssetId, videoModel: "kling-3.0-i2v" })
studio_generate_video({
  prompt: shot_packet.generation_prompt,
  startFrameAssetId: shot_packet.startFrameAssetId,
  stylePreset: "unstyled",
  skipPromptEnhancement: true,
  referenceElementIds: shot_packet.referenceElementIds,
  durationSeconds: shot_packet.generation_duration_sec,
  aspectRatio: brief aspect ratio,
  folderId: "...",
  videoModel: "kling-3.0-i2v"
})
```

Omit `videoModel` for Seedance. Poll response includes `resolvedModel` — verify `klingai/kling-v3.0-i2v` when Kling was chosen.

**Kling prompt length:** Vercel gateway 2500 chars on the assembled string — not Studio. Pass the **full** `shot_packet.generation_prompt`; Studio compacts element appendix only. If still over limit, iterate shot prose (C micro-round) — do not amputate the packet. See [kling-prompt-length.md](kling-prompt-length.md).

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
| Real person filter (no start frame) | Run E.5 storyboard; do not attach character sheets to video |
| Real person filter (start frame exists) | Widen `storyboard_prompt` per [start-frame-workflow.md](start-frame-workflow.md); regen E.5; then `videoModel: "kling-3.0-i2v"` if still blocked |
| Prop drift in clip | Re-attach prop sheet; tighten prompt; regen |
| Wrong material | Return to Phase D prop revision |
| Style mismatch | style-supervisor revises bible line; regen |
| Over budget | Skip optional assets or abort with partial deliverable |
