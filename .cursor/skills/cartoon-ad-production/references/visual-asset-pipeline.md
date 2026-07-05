# Visual asset pipeline (AI-agentic)

Real film has prop makers on set. This pipeline has **text spec → image gen → visual scrutiny → revise**.

## Phase D — Visual assets (after Phase B, before Phase C)

```
world_packet + story_packet
  → asset-manifest-compute (ALL characters, locations, props) — see asset-manifest.md
  → style-supervisor style_bible (seedance cinematic)
  → prop-master + character-continuity + location-scout SPEC BUILD per manifest row
  → EXECUTE each row by sourceMode (see element-source-modes.md):
     photographic = refs → sheet | designed = description → ONE generate_element_sheet (no throwaway plates)
     location designed: prop sheets first → generate_element_sheet with referenceElementIds
  → VISUAL SCRUTINY (orchestrator Read image; parallel prop-master, style-supervisor, role owner)
  → revise → re-execute (max 3 rounds per asset)
  → approved_asset_registry[] (non-empty) → Phase C referenceElementIds
```

**Never skip:** parent/patient character sheet, daughter if on camera, each location plate, witness prop + hand props (meds, bag, tea cup, blanket).

## Roles

| Role | Job |
|------|-----|
| **production-designer** | Text spec: what prop exists, era, placement (Phase B) |
| **prop-master** | Visual definition, gen prompts, prop sheets, visual scrutiny |
| **Executor** | Orchestrator calls `studio_generate_element_sheet` only for designed assets (one call). Never `studio_generate_image` plates before sheet for fictional assets. |
| **style-supervisor** | Style bible; ensures props, characters, sets match one look |

## Asset types

| Type | Output | Use in video gen |
|------|--------|------------------|
| `hero_prop` | Prop sheet + hero angle | `referenceElementIds` on storyboard + video (prop attach) |
| `supporting_prop` | Single ref or mini sheet | Scene-specific refs |
| `character_ref` | Turnaround or portrait sheet | **E.5 storyboard only** — not video image ref |
| `set_establishing` | Wide still of set | `referenceElementIds` location attach on video |
| `logo_brand` | Flat mark if needed | End card / signage only |

## Prop sheet spec

See `specialists/prop-master/references/prop-sheet-spec.md`.

Grid of angles, **no text, no colored backdrop, neutral gray or white seamless**, same object all cells.

## Visual scrutiny rule (non-negotiable)

**Never approve an asset from prompt text alone.** Prop-master scrutiny mode requires:

1. View the generated image (`Read` image path, or browser/screenshot)
2. Compare to `prop_spec` fields
3. Emit `visual_scrutiny` block with approve true/false

Same rule applies to **start frame scrutiny** (Phase E.5) and **video clip scrutiny** in Phase E (post-Seedance).

## Phase E.5 — Start frame loop

When `cast_on_camera: true` on shot_packet:

```
storyboard_prompt + referenceElementIds
  → studio_generate_image (all element sheets attach)
  → VISUAL SCRUTINY (orchestrator Read still; prop-master + style-supervisor)
  → revise storyboard_prompt → re-execute (max 3 rounds)
  → startFrameAssetId saved on shot_packet → Phase E video
```

See [start-frame-workflow.md](start-frame-workflow.md). **No `scene` element type.**

## Phase E — Clip scrutiny checklist

After each `studio_generate_video` completes:

1. `studio_get_generation` → clip asset URL
2. View frames (browser/CDP or exported frame) — **not prompt text**
3. Check:
   - **Prop drift** — witness object matches approved sheet (material, proportion, label absence)
   - **Style match** — grade, contrast, lens feel vs style_bible
   - **Framing** — matches shot_packet camera intent (size, movement, headroom)
   - **Continuity** — character hair/wardrobe if applicable
4. Emit `visual_scrutiny` with `mode: "clip_scrutiny"` from prop-master, dp, style-supervisor
5. Revise `generation_prompt` or `storyboard_prompt`; regen (max 3 rounds)

Orchestrator uses `{ stylePreset: "unstyled", skipPromptEnhancement: true }` for all image and video gen ([direct-prompt-handoff.md](direct-prompt-handoff.md)). Pass `startFrameAssetId` on every video call when cast on camera.

## Approved asset registry

```json
{
  "asset_id": "PROP_honey_jar_v2",
  "studio_asset_id": "optional Studio asset id",
  "file_path": "generation/refs/prop-honey-jar-sheet.png",
  "prop_spec_id": "prop:witness-jar-honey",
  "approved_round": 2,
  "used_in_shots": ["S01", "S04", "S07"]
}
```

Phase C shot_packets include `reference_assets[]` pointing to approved registry entries.
