# Shot reference allocation — mandatory before director merge

Orchestrator **must** compute `referenceElementIds[]` and `reference_assets[]` per shot from `approved_asset_registry` + `world_packet` **before** director merge. Director merge **must not** invent refs — only fuse specialist craft into prompts.

See also: [start-frame-workflow.md](start-frame-workflow.md) — **no scene element type**; start frame is a per-shot image asset.

## Rules (non-negotiable)

1. **Use `referenceElementIds` only** for `studio_generate_image`, `studio_generate_video` in cinema runs — never raw `referenceAssetIds` from upload refs.
2. **Every on-camera character** in the shot → their built element ID (for **storyboard** composition and prompt text).
3. **Primary location** for the shot → location element ID.
4. **Every visible prop** (hand-held, beside bed, on table, in frame) → prop element ID.
5. **Intercut / dual-set shots** (e.g. kitchen + bedroom laugh) → **both** location element IDs + all characters in either beat.
6. **Hero witness prop** → include on every shot where `world_packet` places it in frame, even if static background.
7. **Registry cross-check** — every `referenceElementIds` entry must exist in `approved_asset_registry` with `buildStatus: built`.
8. **Prompt echo** — generation_prompt must name each attached element's role in plain English.
9. **Audit block** — each shot_packet includes `reference_element_map: { asset_id: element_id }` for human review.
10. **Start frame** — when people are on camera, orchestrator must produce `storyboard_prompt` + `startFrameAssetId` before video (Phase E.5 → E).

## Compute algorithm

```
FOR each shot in editor shot_list:
  refs = []
  assets = []
  FOR each character in shot (including intercut lists):
    ADD registry[character].element_id
  FOR primary scene location:
    ADD registry[location].element_id
  FOR each intercut location:
    ADD registry[location].element_id
  FOR each prop in world_packet.props_manifest where scene_id matches OR used_in_shots includes shot_id:
    IF prop visible in dp framing notes OR observable_actions:
      ADD registry[prop].element_id
  DEDUPE refs
  EMIT referenceElementIds, reference_assets, reference_element_map
  IF any character on camera:
    EMIT storyboard_prompt (single still — see start-frame-workflow.md)
```

## Gate failure (blocking)

| Failure | Fix |
|---------|-----|
| Character on camera missing from refs | Add element ID before merge |
| People on camera but no startFrameAssetId before video | Run storyboard image gen first |
| Location missing for generative set | Add loc element |
| Intercut bedroom without `loc_bedroom` | Add bedroom element to kitchen shot |
| Raw upload ref in video call | Replace with element ID |
| Character sheet expected as video ref | Use start frame instead |
| Prompt describes prop not in refs | Add prop or cut from prompt |

## Phase E handoff (two steps per shot)

**E.5 — Storyboard**

```json
studio_generate_image({
  "prompt": "shot_packet.storyboard_prompt",
  "referenceElementIds": "shot_packet.referenceElementIds",
  "stylePreset": "story-ad",
  "skipPromptEnhancement": true,
  "aspectRatio": "9:16",
  "resolution": "2K",
  "folderId": "..."
})
```

→ save `startFrameAssetId` on shot_packet.

**Storage:** asset is already in Studio folder from `studio_generate_image`. Rename to `{shot_id}-start-frame-storyboard.png`; register in Studio doc `phase-e-assets`. Do not treat MercuryOS local copy as source of truth.

**E — Video**

```json
studio_generate_video({
  "prompt": "shot_packet.generation_prompt",
  "startFrameAssetId": "shot_packet.startFrameAssetId",
  "referenceElementIds": "shot_packet.referenceElementIds",
  "stylePreset": "story-ad",
  "skipPromptEnhancement": true,
  "aspectRatio": "9:16",
  "durationSeconds": "shot_packet.generation_duration_sec",
  "folderId": "..."
})
```

`generation_duration_sec` — Studio min **4s**. If editorial `duration_sec` < 4, set `generation_duration_sec: 4` and `editorial_trim_sec` on shot_packet; trim in post.

## Video reference attach policy (Studio automatic)

Pass **full** `referenceElementIds[]` for audit and prompt append.

On `studio_generate_video`, Studio **automatically**:
- **`startFrameAssetId`** → Seedance `first_frame` (characters live here)
- **Attaches image refs** for `prop` and `location` sheets only, tagged `[Image 1]`, `[Image 2]`, …
- **Does not attach** `character` element sheets (Seedance real-person filter)
- **Still appends** every element's description to the prompt

**Rate limit:** wait **≥65 seconds** between video generation API calls (1 req/min gateway quota).

## Director merge checklist

- [ ] `referenceElementIds` computed by orchestrator, not drafted from memory
- [ ] `storyboard_prompt` present when cast on camera
- [ ] Matches `approved-asset-registry.json`
- [ ] Intercut shots include all locations
- [ ] Seedance mandatory prefix from `style_bible`
- [ ] `reference_element_map` present per shot
