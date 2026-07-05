# Seedance translator — scrutiny checklist

Per-shot pass after director merge. Cite `shot_id` on every finding.

## storyboard_prompt (cast on camera)

- [ ] FULL look prefix from [cartoon-look-foundation.md](../../../references/cartoon-look-foundation.md) (~55 words)
- [ ] `FRAME:` with shot_size, rule-of-thirds position, head room, lead room direction
- [ ] `FOREGROUND` / `MIDGROUND` / `BACKGROUND` (or FG/MG/BG) — at least MG sharp
- [ ] `LIGHT:` one motivated cel line (direction, key/fill — no Kelvin photoreal language)
- [ ] `PROP LOCK:` when `referenceElementIds` non-empty
- [ ] No travel verbs (`dolly`, `track`, `pan`, `push`, `pull`, `crane`, `orbit`)
- [ ] No motion blur / no on-screen text
- [ ] `shot_size_open` matches wider-than-end when shot pushes in
- [ ] Photographic cast: MWS+ only; face ≤25% frame

## generation_prompt

- [ ] Abbreviated PRESERVE line (~12 words) — **not** full Alexa block
- [ ] `SCENE:` micro-action verbs only (1–2 clauses)
- [ ] `CAMERA:` `shot_size_open`→`shot_size_end`, lens, height, **ONE** spatial move + speed
- [ ] Timing beats when move ≠ locked (`0.0–0.6s settle` pattern)
- [ ] Stability line (`Stable gimbal through space; no optical zoom`)
- [ ] `SOUND:` diegetic + silence ms (or composer-specified music clause)
- [ ] `CONSTRAINTS:` preserve start frame; prop lock; no wardrobe change; no ink flicker; no photoreal drift
- [ ] Total word count ≤100
- [ ] No `zoom` synonyms — use dolly/track per [camera-grammar-for-gen.md](../../../references/camera-grammar-for-gen.md)
- [ ] No emotion adjectives — observable behavior only
- [ ] Prop refs named once if `referenceElementIds` attach

## Cross-shot

- [ ] `rhythm.role_in_scene` reflected in CAMERA scale ([micro-pacing-foundation.md](../../../references/micro-pacing-foundation.md))
- [ ] Editorial `duration_sec` stated in CAMERA or CONSTRAINTS (`Editorial N.Ns`)
- [ ] `staccato_beat` / `punch_beat` → locked-off, no long travel
- [ ] `deceleration_hold` → slow-motion weight language, extended breathe
- [ ] `camera.movement` field matches generation_prompt move phrase (not second invented move)

## MCP mirror

Findings should align with `studio_validate_production_gates` G-C seedance translation rules ([gate-validation.md](../../../references/gate-validation.md)).
