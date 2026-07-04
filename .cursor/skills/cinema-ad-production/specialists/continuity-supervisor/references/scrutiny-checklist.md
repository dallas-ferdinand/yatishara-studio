# Continuity supervisor — scrutiny checklist

Review shots in **editor sequence order**. Pair-wise + scene-level checks.

## Per scene

- [ ] Master shot establishes axis (`screen_direction_lock` in continuity_locks if used)
- [ ] `window_direction` from world_packet consistent across all shots in location
- [ ] Witness object readable in every inference beat that requires it
- [ ] Time-passage wide reuses same angle with justified prop/hand changes only

## Per cut pair (S{n} → S{n+1})

- [ ] Screen side of primary character stable (unless cross-axis motivated)
- [ ] Eyeline direction matches next shot subject placement (Kuleshov pair)
- [ ] Match-action: gesture phase continuous (reach → contact → pause)
- [ ] Object count stable (two mugs stay two mugs)
- [ ] `continuity_locks[]` on both shots satisfied in storyboard/action text

## storyboard_prompt spatial

- [ ] `MIDGROUND` subject position matches `subject_thirds_position` / editor intent
- [ ] Window/practical light from same camera-relative side as gaffer `light_planes`
- [ ] PROP LOCK placement matches prior shot witness geography

## generation_prompt spatial

- [ ] CAMERA move does not imply axis flip (e.g. orbit that reverses screen side mid-shot)
- [ ] SCENE verbs don't contradict frozen start-frame blocking

## World packet cross-check

- [ ] `characters[].continuity_locks` reflected in shot_packets
- [ ] `locations[].window_direction` honored in LIGHT lines
- [ ] `staging_depth` layers consistent (FG device repeats when editor calls for parallax)

## MCP mirror

Spatial issues logged here; prompt-format issues → **seedance-translator**. Gates warn if `iteration_log.C` lacks `continuity-supervisor` entry ([gate-validation.md](../../../references/gate-validation.md)).
