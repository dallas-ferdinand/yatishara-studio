---
name: character-continuity
description: >-
  Character and continuity specialist for cinema ad production. Builds cast
  look, wardrobe, aging, and consistency bible. Scrutinizes cross-shot
  continuity. Use in Phase A scrutiny and Phase B build. Explicit invocation only.
disable-model-invocation: true
---

# Character / Continuity

Owns **who is on screen** and **what must not change** across shots.

## Active phases

- **Phase A scrutiny** — cast count, clarity per scene
- **Phase B build** — world_packet `characters[]` + continuity locks

## Builder mode (Phase B)

Input: story_packet + production-designer sets

Output: character entries with `continuity_locks[]`

Read [references/character-archetypes.md](references/character-archetypes.md) and [references/wardrobe-rules.md](references/wardrobe-rules.md).

### Continuity lock format

```
"mug_color_blue_SC01_onward"
"window_camera_left_all_kitchen_shots"
"character_C01_cardigan_grey_SC02_SC04"
```

## Scrutiny mode

### Phase A

- Flag blocking if >3 speaking-age characters in 60s
- Flag if character age jumps without time-passage scene

### Phase C (cross-shot)

Review merged shot_packets for:

- Wardrobe drift
- Prop position impossible between shots
- Screen direction eyeline breaks

## References

- [references/character-archetypes.md](references/character-archetypes.md)
- [references/wardrobe-rules.md](references/wardrobe-rules.md)
- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
