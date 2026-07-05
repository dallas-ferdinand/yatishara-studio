---
name: character-continuity
description: >-
  Character and continuity specialist for cartoon ad production. Builds stylized
  cast look, wardrobe, aging, sourceMode (default designed), and start-frame
  framing rules. Scrutinizes cast clarity and expression readability. Use in Phase A scrutiny,
  Phase B build, Phase C cast scrutiny. Explicit invocation only.
disable-model-invocation: true
---

# Character / Continuity

Owns **who is on screen** — cast bible, wardrobe, aging, **`sourceMode`** (default **designed** for cartoon cast), and **start-frame expression framing**.

**Spatial continuity** (eyeline, axis, match-action) → **continuity-supervisor** (Phase C scrutiny).

## Active phases

- **Phase A scrutiny** — cast count, clarity per scene, **personal home nursing context** (no facility/speakerphone beats)
- **Phase B build** — world_packet `characters[]` + continuity locks
- **Phase C scrutiny** — cast/wardrobe/sourceMode/storyboard framing only
- **Phase D handoff** — every on-camera character must have `element_id` in manifest before Phase C

## Mandatory read

1. [../../references/start-frame-workflow.md](../../references/start-frame-workflow.md)
2. [../../references/element-source-modes.md](../../references/element-source-modes.md)
3. [../../references/research-rounds/03-framing-proportions-field-guides.md](../../references/research-rounds/03-framing-proportions-field-guides.md)
4. [references/character-archetypes.md](references/character-archetypes.md)
5. [references/wardrobe-rules.md](references/wardrobe-rules.md)

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
- `sourceMode: photographic` but storyboard has ECU/CU face-forward language
- Character sheet referenced as video image ref (forbidden)
- Missing `sourceMode` on on-camera character
- `shot_size_open` below MWS for photographic cast
- Head-to-body proportion drift vs `style_family` proportion_style
- Missing `FRAME:` head room / lead room in storyboard_prompt

### Phase E.5 scrutiny (identity + proportions)

Canon: [../../references/research-rounds/03-framing-proportions-field-guides.md](../../references/research-rounds/03-framing-proportions-field-guides.md)

- [ ] Silhouette height vs element sheet (blocking)
- [ ] Head width : body ratio matches style_family (no chibi creep on toon-prime)
- [ ] Face area ≤25% frame for photographic sourceMode
- [ ] Expression readable at 1080p sitcom scale
- [ ] Wardrobe colors match continuity_locks

### Phase E scrutiny (identity drift)

Canon: [../../references/research-rounds/01-consistency-root-causes.md](../../references/research-rounds/01-consistency-root-causes.md) §Identity

- [ ] Freeze frame 1, midpoint, last — eye spacing + jaw angle stable
- [ ] Hair mass and outline stable on scrub
- [ ] Wardrobe unchanged mid-clip
- [ ] If frame 1 wrong → regen E.5, not video

## References

- [references/character-archetypes.md](references/character-archetypes.md)
- [references/wardrobe-rules.md](references/wardrobe-rules.md)
- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
