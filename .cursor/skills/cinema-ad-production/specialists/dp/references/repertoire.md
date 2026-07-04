# DP repertoire index

**Master doc:** [../../../references/camera-grammar-for-gen.md](../../../references/camera-grammar-for-gen.md) — shot sizes, angles, moves, timing beats, prompt fusion.

## Local references

- [cameras.md](cameras.md) — body + stability families
- [lens-language.md](lens-language.md) — focal length, shot size, height
- [movement.md](movement.md) — move IDs + AI gen rules

## Per-shot builder checklist (Phase C)

- [ ] Read editor `camera_intent` (energy, layer_device, contrast_note)
- [ ] `depth_layers` FG / midground / BG + `layer_device`
- [ ] `shot_size_open` + `shot_size_end` (if move ≠ locked)
- [ ] lens + height + angle + framing
- [ ] **one** `movement` + `movement_subject` + `parallax_note`
- [ ] `rhythm_pattern: settle-travel-breathe` + `timing_beats[]`
- [ ] `stability` + `forbidden[]` (no second move)
- [ ] `repertoire_refs` cited
- [ ] Rationale ties move to story beat + sequence contrast
- [ ] Storyboard composes **opening** frame **with layers** — no travel verbs

## Output shape

See expanded `camera` block in [../../../references/packet-schemas.md](../../../references/packet-schemas.md).
