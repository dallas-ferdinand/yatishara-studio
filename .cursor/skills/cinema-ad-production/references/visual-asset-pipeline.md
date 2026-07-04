# Visual asset pipeline (AI-agentic)

Real film has prop makers on set. This pipeline has **text spec → image gen → visual scrutiny → revise**.

## Phase D — Visual assets (after Phase B, before Phase C)

```
world_packet prop specs
  → prop-master BUILD (generation prompts + prop sheet briefs)
  → EXECUTE (studio_generate_element_sheet or raw studio_generate_image)
  → prop-master VISUAL SCRUTINY (must view image)
  → revise prompt → re-execute (max 3 rounds per asset)
  → style-supervisor cross-asset pass
  → approved asset registry → Phase C references
```

## Roles

| Role | Job |
|------|-----|
| **production-designer** | Text spec: what prop exists, era, placement (Phase B) |
| **prop-master** | Visual definition, gen prompts, prop sheets, visual scrutiny |
| **Executor** | Orchestrator calls `studio_generate_element_sheet` / `studio_generate_image` |
| **style-supervisor** | Style bible; ensures props, characters, sets match one look |

## Asset types

| Type | Output | Use in video gen |
|------|--------|------------------|
| `hero_prop` | Prop sheet + hero angle | `referenceAssetIds` on witness shots |
| `supporting_prop` | Single ref or mini sheet | Scene-specific refs |
| `character_ref` | Turnaround or portrait sheet | Character continuity shots |
| `set_establishing` | Wide still of set | Master shot reference |
| `logo_brand` | Flat mark if needed | End card / signage only |

## Prop sheet spec

See `specialists/prop-master/references/prop-sheet-spec.md`.

Grid of angles, **no text, no colored backdrop, neutral gray or white seamless**, same object all cells.

## Visual scrutiny rule (non-negotiable)

**Never approve an asset from prompt text alone.** Prop-master scrutiny mode requires:

1. View the generated image (`Read` image path, or browser/screenshot)
2. Compare to `prop_spec` fields
3. Emit `visual_scrutiny` block with approve true/false

Same rule applies to **video clip scrutiny** in Phase E (post-Seedance).

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
5. Revise `generation_prompt` or re-attach refs; regen (max 3 rounds)

Orchestrator uses raw preset for all video gen: `{ stylePreset: "raw", skipPromptEnhancement: true }`.

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
