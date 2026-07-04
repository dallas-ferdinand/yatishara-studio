---
name: character-continuity
description: >-
  Character and continuity specialist for cinema ad production. Builds cast
  look, wardrobe, aging, sourceMode, and Seedance start-frame rules. Scrutinizes
  cast clarity and photographic vs designed framing. Use in Phase A scrutiny,
  Phase B build, Phase C cast scrutiny. Explicit invocation only.
disable-model-invocation: true
---

# Character / Continuity

Owns **who is on screen** — cast bible, wardrobe, aging, **`sourceMode`** (photographic vs designed), and **Seedance start-frame framing rules**.

**Spatial continuity** (eyeline, axis, match-action) → **continuity-supervisor** (Phase C scrutiny).

## Active phases

- **Phase A scrutiny** — cast count, clarity per scene, **personal home nursing context** (no facility/speakerphone beats)
- **Phase B build** — world_packet `characters[]` + continuity locks
- **Phase C scrutiny** — cast/wardrobe/sourceMode/storyboard framing only
- **Phase D handoff** — every on-camera character must have `element_id` in manifest before Phase C

## Mandatory read

1. [../../references/start-frame-workflow.md](../../references/start-frame-workflow.md)
2. [../../references/element-source-modes.md](../../references/element-source-modes.md)
3. [references/character-archetypes.md](references/character-archetypes.md)
4. [references/wardrobe-rules.md](references/wardrobe-rules.md)

## Builder mode (Phase B)

Input: story_packet + production-designer sets

Output: character entries with `continuity_locks[]`, `sourceMode` per [element-source-modes.md](../../references/element-source-modes.md).

### Continuity lock format

```
"mug_color_blue_SC01_onward"
"window_camera_left_all_kitchen_shots"
"character_C01_cardigan_grey_SC02_SC04"
```

### sourceMode output

| Mode | Storyboard rule | Video refs |
|------|-----------------|------------|
| `photographic` | MWS+ only; OTS/3/4; face ≤25% frame | No character sheet on video |
| `designed` | MCU acceptable | No character sheet on video |

## Scrutiny mode

### Phase A

- Flag blocking if >3 speaking-age characters in 60s
- Flag if character age jumps without time-passage scene

### Phase C (cast only — not spatial)

- Wardrobe drift across shots
- `sourceMode: photographic` but storyboard has ECU face-forward language
- Character sheet referenced as video image ref (forbidden)
- Missing `sourceMode` on on-camera character

## References

- [references/character-archetypes.md](references/character-archetypes.md)
- [references/wardrobe-rules.md](references/wardrobe-rules.md)
- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
