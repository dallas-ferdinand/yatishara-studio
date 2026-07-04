# Asset manifest — mandatory before Phase D execute

After Phase B signs off, orchestrator **must** compute a complete visual asset manifest. Generating only the hero character (e.g. Tricia) while leaving parent, daughter, locations, and props unbuilt is a **gate failure**.

**Read first:** [element-source-modes.md](element-source-modes.md) — photographic vs designed routing. **Never burn credits on designed throwaway plates.**

## Compute step (automatic)

Launch Task subagent `asset-manifest-compute` after director merges `world_packet`:

**Input:** `world_packet` + `story_packet` + `style_bible` draft  
**Output:** `generation/asset-manifest.json`

```json
{
  "characters": [
    {
      "id": "C01",
      "name": "Tricia",
      "sourceMode": "photographic",
      "existing_element_id": "ks713gg70jw018vrvrkwrgcegs89xcct",
      "sheet_required": false
    },
    {
      "id": "C02",
      "name": "Elderly mother",
      "sourceMode": "designed",
      "sheet_required": true,
      "description": "Full visual spec..."
    }
  ],
  "locations": [
    {
      "id": "loc:bedroom",
      "sourceMode": "designed",
      "referenceElementIds_for_compose": ["prop:witness-chair"],
      "sheet_required": true
    }
  ],
  "props": [
    { "id": "prop:witness-chair", "sourceMode": "designed", "hero": true, "build_order": 1 }
  ]
}
```

### Inclusion rules (non-negotiable)

| Asset | Include when |
|-------|----------------|
| **Character** | Any on-camera face/body — **all** cast, not just lead |
| **Location** | Any distinct set with 1+ generative shots |
| **Hero prop** | Witness object or story symbol |
| **Supporting prop** | 2+ shots OR hand-interacted |

### Personal home nursing context check

Scrutiny must flag **blocking** if story implies nursing facility, wall speakers, or speakerphone daughter beats.

## Phase D execute order

1. **style-supervisor** — `style_bible` + seedance look
2. **prop-master** — spec per manifest row with `sourceMode` + `description`
3. **BUILD ORDER** — props (designed) → characters (designed) → locations (designed, `referenceElementIds` for props in set)
4. **EXECUTE per row:**
   - `photographic`: reuse existing or upload refs → `generate_element_sheet`
   - `designed`: `studio_create_element { sourceMode: designed, description }` → **one** `studio_generate_element_sheet` — **no** `studio_generate_image` first
5. **VISUAL SCRUTINY** — Read every sheet; prop-master + style-supervisor + location-scout/character-continuity
6. **REGISTRY** — `approved_asset_registry[]` non-empty before Phase C

## Shot packet linkage (Phase C)

1. Orchestrator writes `generation/shot-reference-allocation.json` **before** director merge — see [shot-reference-allocation.md](shot-reference-allocation.md).
2. Every `shot_packet` lists `referenceElementIds[]` for all on-camera characters, **all** locations (including intercut), and visible props.
3. Every `shot_packet` lists matching `reference_assets[]` registry IDs and `reference_element_map`.
4. `generation_prompt` must echo each attached element role in plain English.
