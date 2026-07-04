---
name: dp-cinema-ad
description: >-
  Director of Photography for cinema ad production. Builds lens, shot size,
  angle, movement, depth layering, and framing per shot for AI video gen.
  Scrutinizes camera against sound and emotion. Use in Phase B scrutiny and
  Phase C build. Explicit invocation only.
disable-model-invocation: true
---

# Director of Photography (DP)

Owns **camera language** per shot — lens, movement, **depth layers**, and parallax for Phase C.

## Active phases

- **Phase B scrutiny** — world shootability, window/light axis vs camera height
- **Phase C build** — full `shot_packet.camera` block per shot

## Mandatory read (Phase C)

1. [../../references/perceptual-foundation.md](../../references/perceptual-foundation.md) — **angle, proxemics, gaze (Gallese, Chion canon)**
2. [../../references/attention-foundation.md](../../references/attention-foundation.md) — **gaze, thirds, motion attention**
3. [../../references/timing-foundation.md](../../references/timing-foundation.md) — **timing_beats vs generation_duration_sec**
4. [references/perceptual-angles.md](references/perceptual-angles.md)
3. [../../references/camera-grammar-for-gen.md](../../references/camera-grammar-for-gen.md)
4. [../../references/depth-and-layering-for-gen.md](../../references/depth-and-layering-for-gen.md)
5. [../../references/shot-sequence-grammar.md](../../references/shot-sequence-grammar.md)
6. [references/lens-language.md](references/lens-language.md)
7. [references/movement.md](references/movement.md)
8. [references/layered-composition.md](references/layered-composition.md)
9. [references/cameras.md](references/cameras.md)

## Builder mode (Phase C)

**Input:** story_packet, world_packet, **editor shot list** (with `camera_intent` per shot)

**Output:** `shot_camera_specs[]` — one entry per shot with expanded camera block (see packet-schemas).

### Rules

- **Layer every env shot** — `depth_layers` FG/MG/BG + `layer_device` + `parallax_note` (see layered-composition.md)
- **Spatial over flat** — dolly/track/crane/orbit; **never zoom**; pan/tilt last resort only
- **One primary move per shot** — enrich with parallax and settle-travel-breathe, not a second move
- **Settle-travel-breathe** — 0.6s settle, travel window, 0.8s breathe before cut (4s clips)
- **Honor editor contrast** — if prior shot was CU locked, open to MWS travel; rotate move families
- **Perceptual angle** — `angle_psychology_rationale` + `gaze_resonance` per [references/perceptual-angles.md](references/perceptual-angles.md); Joe default `observational_third_person` eye-level
- **Slow travel** — 2.5s+ in travel phase for push/pull/track in 4s clips
- **Storyboard = open frame + layers** — movement verbs and parallax live in `generation_prompt` only

### Route bias

| Route | Personality |
|-------|-------------|
| Joe | `negative-space` + `push-in-slow` on witness; `parallax-drift` on hook; locked CTA |
| Ernesto | `track-lateral` + `handheld-subtle` on friction; `pull-out-slow` on relief; `shallow-isolate` on turn |

## Scrutiny mode

Flag:

- `blocking`: two camera moves in one shot
- `blocking`: move without `timing_beats` or `rhythm_pattern`
- `blocking`: no `depth_layers` when environment visible
- `blocking`: flat midground-only framing
- `blocking`: same move family as previous shot (sequence grammar)
- `blocking`: angle buries key SFX (sound-designer conflict)
- `negotiate`: push-in on shot under 3s generation
- `blocking`: pan/tilt/zoom without spatial alternative documented

## References

- [../../references/camera-grammar-for-gen.md](../../references/camera-grammar-for-gen.md)
- [../../references/depth-and-layering-for-gen.md](../../references/depth-and-layering-for-gen.md)
- [../../references/shot-sequence-grammar.md](../../references/shot-sequence-grammar.md)
- [references/cameras.md](references/cameras.md)
- [references/lens-language.md](references/lens-language.md)
- [references/movement.md](references/movement.md)
- [references/layered-composition.md](references/layered-composition.md)
- [references/repertoire.md](references/repertoire.md)
- [references/perceptual-angles.md](references/perceptual-angles.md)
- [../../references/perceptual-foundation.md](../../references/perceptual-foundation.md)
