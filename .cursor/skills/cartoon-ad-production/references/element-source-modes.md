# Element source modes — credit-safe sheet generation

Every visual asset in Phase D must declare **how** it is sourced before any `studio_generate_*` call.

## Two modes (Studio `sourceMode`)

| Mode | When | Flow | Credits |
|------|------|------|---------|
| **photographic** | Real person (Tricia), real product photo, real location photo | `upload refs` → `create_element` → `generate_element_sheet` | refs + 1 sheet |
| **designed** | Fictional character (elderly mother, Keisha), witness chair, kitchen set, meds props | `create_element { description }` → **one** `generate_element_sheet` | **1 sheet only** |

### FORBIDDEN for designed assets

- `studio_generate_image` “reference plates” before the sheet call
- Multiple angle generations to satisfy min ref count
- Attaching AI plates as `referenceAssetIds` then generating sheet again

**The first sheet generation IS the asset.** Revise the sheet prompt/description and regenerate — do not pre-generate throwaway images.

## Routing rules (orchestrator + prop-master)

```
IF real_person_with_client_photos (e.g. Tricia):
  sourceMode = photographic
  use existing element + refs

ELSE fictional_character OR prop OR location:
  sourceMode = designed
  rich description on create_element (40+ chars)
  studio_generate_element_sheet once
```

## Location + prop dependency order

When a location must contain specific props (bedroom with witness chair, kitchen with tea cup):

1. Build **prop sheets first** (designed, one call each)
2. `studio_create_element { type: location, sourceMode: designed, description }`
3. `studio_generate_element_sheet { referenceElementIds: [built prop element ids] }`

Props attach as built sheets — not throwaway plates.

## Asset manifest field

Each row in `generation/asset-manifest.json`:

```json
{
  "id": "C02",
  "type": "character",
  "sourceMode": "designed",
  "sheet_required": true,
  "description": "Afro-Trinidadian woman 70s, nightgown, grey hair...",
  "referenceElementIds_for_compose": []
}
```

## Visual scrutiny (unchanged)

Orchestrator **Read** every sheet image. Check film grain, anti-gloss, spec match — not prompt text alone.

## Phase E — character sheet use

| Phase | Character element sheet |
|-------|-------------------------|
| E.5 storyboard (`studio_generate_image`) | **Attach** — full cast composition |
| E video (`studio_generate_video`) | **Do not attach** — identity via `startFrameAssetId` + prompt text |

See [start-frame-workflow.md](start-frame-workflow.md).

## Real-person lock

Tricia (`ks713gg70jw018vrvrkwrgcegs89xcct`) stays **photographic** — never regenerate from description alone.
