# Packet schemas

JSON-shaped blocks for handoffs. Orchestrator accumulates these; no runtime parser required.

## Builder block

```json
{
  "mode": "build",
  "role": "dp",
  "phase": "C",
  "shot_id": "S04",
  "scene_id": "SC02",
  "choices": {
    "lens": "50mm",
    "height": "counter_level",
    "movement": "static_observe_push_last_0.5s"
  },
  "rationale": "Intimate observation of hands; push only at pause beat.",
  "repertoire_refs": ["lens:50mm-intimate", "move:static-observe", "move:push-in-slow"]
}
```

## Scrutiny block

```json
{
  "mode": "scrutiny",
  "role": "sound-designer",
  "shot_id": "S04",
  "approve": false,
  "conflicts": [
    {
      "with_role": "dp",
      "issue": "Low angle buries ceramic slide SFX under table surface.",
      "severity": "blocking",
      "fix": "Raise to counter height; keep push-in on pause."
    }
  ],
  "notes": []
}
```

## story_packet

```json
{
  "packet_type": "story",
  "version": 1,
  "director_route": "joe",
  "logline": "",
  "human_truth": "",
  "witness_object": "",
  "character_arc": null,
  "duration_sec": 90,
  "scenes": [
    {
      "scene_id": "SC01",
      "title": "",
      "duration_sec": 18,
      "beats": [],
      "dialogue": [],
      "narrator": null,
      "observable_actions": []
    }
  ],
  "closing_line": "",
  "narrator_close": "",
  "transportation_hooks": [],
  "peak_beat": {
    "scene_id": "",
    "observable_action": "",
    "research_ref": "research:peak-end-rule"
  },
  "end_anchor": {
    "scene_id": "",
    "closing_line": "",
    "research_ref": "research:peak-end-rule"
  },
  "inference_chain": [],
  "audience_projection_prompt": "",
  "research_refs": []
}
```

## world_packet

```json
{
  "packet_type": "world",
  "version": 1,
  "sets": [
    {
      "scene_id": "SC01",
      "location_type": "interior_kitchen_morning",
      "era": "contemporary_lived_in",
      "props": [],
      "textures": [],
      "hero_object_placement": ""
    }
  ],
  "characters": [
    {
      "character_id": "C01",
      "description": "",
      "wardrobe": "",
      "age_range": "",
      "continuity_locks": []
    }
  ],
  "locations": [
    {
      "location_id": "LOC01",
      "scene_ids": ["SC01"],
      "interior_exterior": "interior",
      "architectural_character": "",
      "weather_time": ""
    }
  ]
}
```

## shot_packet

```json
{
  "packet_type": "shot",
  "shot_id": "S04",
  "scene_id": "SC02",
  "duration_sec": 2.5,
  "generation_duration_sec": 4,
  "editorial_trim_sec": 1.5,
  "rhythm": {
    "pattern_id": "slow_fast_fast",
    "role_in_scene": "opener_anchor",
    "position_in_scene": 1,
    "shots_in_scene": 3,
    "perceived_pace_register": "legato",
    "cut_cue": "breathe_end",
    "opener_ratio": 0.5
  },
  "action": "Hands reach for second mug; pause mid-reach.",
  "camera": {
    "shot_size_open": "mws",
    "shot_size_end": "cu",
    "lens": "50mm",
    "height": "counter_level",
    "angle": "neutral",
    "framing": "medium_close_hands",
    "movement": "push_in_slow",
    "movement_subject": "prop:witness-chair",
    "speed": "slow",
    "stability": "gimbal",
    "spatial_motion": true,
    "layer_device": "foreground-wipe",
    "depth_layers": {
      "foreground": "soft mug rim entering frame left",
      "midground": "hands and witness mug on counter",
      "background": "kitchen window soft depth"
    },
    "parallax_note": "FG mug rim slides faster on push",
    "rhythm_pattern": "settle-travel-breathe",
    "timing_beats": ["0.0-0.6s settle", "0.6-3.2s push-in + parallax", "3.2-4.0s breathe"],
    "angle_psychology_rationale": "eye-level peer observation — embodied witness posture",
    "gaze_resonance": "observational_third_person",
    "proxemic_zone": "social",
    "forbidden": ["pan", "tilt", "zoom"],
    "repertoire_refs": ["lens:50mm-intimate", "move:push-in-slow"]
  },
  "lighting": {
    "key": "soft_window_left",
    "fill": "ambient_bounce",
    "contrast": "low_warm",
    "key_fill_ratio": "2:1",
    "contrast_register": "high_key_comfort",
    "lighting_setup_id": "light-setup:2-45-rembrandt",
    "color_temp_k": 5600,
    "motivation_psychology": "window side key — ordinary truthful morning",
    "light_planes": ["fg_soft", "mg_window_key", "bg_fill"],
    "research_refs": ["research:key-fill-empathy", "research:huttunen-face-setups"],
    "repertoire_refs": ["light:window-key-soft"]
  },
  "sound": {
    "primary_sound": "soft ceramic mug base contact on wooden table",
    "secondary_sound": "cotton cloth fold off-screen",
    "ambience": "quiet_kitchen_room_tone",
    "bed": "quiet_kitchen_room_tone",
    "sfx": ["ceramic_mug_slide"],
    "silence_beats": ["0.8-1.2s after slide"],
    "sound_sphere": "foley_primary",
    "point_of_audition": "object_intimate",
    "diegetic_class": "on_screen",
    "synchresis_lock": true,
    "stream_priority": "primary_foley",
    "rendering": "close_dry",
    "listening_mode_primary": "causal",
    "synchresis_pair": "mug on visible counter — ceramic slide",
    "research_refs": ["research:chion-synchresis", "research:murch-dense-clarity"],
    "repertoire_refs": ["sfx:ceramic-mug-base-contact"]
  },
  "music": {
    "presence": "none",
    "entry": null,
    "ducking": null,
    "repertoire_refs": []
  },
  "color": {
    "grade": "warm_morning_natural",
    "repertoire_refs": []
  },
  "motion_graphics": {
    "presence": "none"
  },
  "dialogue": null,
  "narrator": null,
  "continuity_locks": ["mug_color_matches_S02", "window_light_direction_consistent"],
  "reference_assets": ["PROP_honey_jar_v2"],
  "referenceElementIds": ["ks7xxxxxxxx"],
  "reference_element_map": { "PROP_honey_jar_v2": "ks7xxxxxxxx" },
  "generation_duration_sec": 4,
  "editorial_trim_sec": null,
  "emotional_temperature": {
    "register": "quiet_hold",
    "behavior_proof": "",
    "sonic_register": "",
    "light_register": "",
    "repertoire_refs": []
  },
  "cast_on_camera": true,
  "storyboard_prompt": "",
  "startFrameAssetId": null,
  "generation_prompt": ""
}
```

`cast_on_camera` — true when any character appears in frame; drives E.5 requirement.

`storyboard_prompt` — **required when `cast_on_camera: true`**. Single still for `studio_generate_image` (Phase E.5). Composition, light, who is in frame — not motion. See [start-frame-workflow.md](start-frame-workflow.md).

`startFrameAssetId` — Studio asset ID from E.5 storyboard output. **Required before video** when `cast_on_camera: true`.

`generation_prompt` is **60–100 words**, **Seedance I2V-ready** per [cartoon-translation-foundation.md](cartoon-translation-foundation.md): abbreviated PRESERVE line + `SCENE:` / `CAMERA:` / `SOUND:` / `CONSTRAINTS:` — **motion only** when `startFrameAssetId` set (people in start frame). **Must be complete** — production uses direct handoff (`unstyled` + `skipPromptEnhancement: true`); no Flash rewrite ([direct-prompt-handoff.md](direct-prompt-handoff.md)). One spatial camera move + timing beats + stability line per [camera-grammar-for-gen.md](camera-grammar-for-gen.md). Use `## Generation prompt` heading when embedded in markdown bible.

`storyboard_prompt` is **120–200 words**, **full frame spec** per [cartoon-translation-foundation.md](cartoon-translation-foundation.md): FULL look prefix + `FRAME:` / `FOREGROUND:` / `MIDGROUND:` / `BACKGROUND:` / `LIGHT:` — **no travel verbs**.

`reference_assets` — IDs from `approved_asset_registry` (Phase D).

`referenceElementIds` — **required** built Studio element IDs. Used for E.5 storyboard (`studio_generate_image` — all sheets attach) and E video (`studio_generate_video` — prop/location sheets attach; character sheets prompt-only). Computed by orchestrator per [shot-reference-allocation.md](shot-reference-allocation.md). Never raw upload refs.

`reference_element_map` — audit `{ asset_id: element_id }` per shot.

`generation_duration_sec` — Studio video min 4s; if editorial `duration_sec` < 4, set `generation_duration_sec: 4` and `editorial_trim_sec`.

## prop_packet

```json
{
  "packet_type": "prop",
  "prop_spec_id": "prop:witness-jar-honey",
  "visual_description": "",
  "generation_prompt": "",
  "prop_sheet_prompt": "",
  "prop_sheet_layout": "sheet:grid-3x3",
  "negative_prompt": "",
  "style_bible_refs": [],
  "round": 1,
  "approved": false,
  "file_path": null
}
```

## visual_scrutiny (image or clip)

```json
{
  "mode": "visual_scrutiny",
  "role": "prop-master",
  "asset_id": "PROP_honey_jar_v1",
  "file_path": "generation/refs/prop-honey-jar-v1.png",
  "approve": false,
  "checks": {
    "matches_material": true,
    "no_text": true,
    "no_wrong_background": true,
    "angles_complete": true,
    "style_bible_match": true
  },
  "cartoon_checks": {
    "line_weight_consistent": true,
    "flat_cel_shading": true,
    "palette_locked": true,
    "no_photoreal_drift": true,
    "no_film_grain": true,
    "no_catalog_hero_light": true,
    "start_frame_match": true
  },
  "revision_prompt_delta": "",
  "severity": "blocking"
}
```

**Must view file** before setting `approve: true`.

## approved_asset_registry entry

```json
{
  "asset_id": "PROP_honey_jar_v2",
  "prop_spec_id": "prop:witness-jar-honey",
  "type": "prop_sheet",
  "file_path": "",
  "studio_asset_id": null,
  "approved_round": 2,
  "used_in_shots": ["S01", "S04"]
}
```

## scrutiny_report (per round)

```json
{
  "packet_type": "scrutiny_report",
  "phase": "C",
  "round": 2,
  "step": "round_summary",
  "blocking_count": 1,
  "negotiate_count": 0,
  "note_count": 2,
  "rebuild_scope": ["S04"]
}
```

## iteration_log entry (per subagent step)

Append to `production-state.json` → `iteration_log.{phase}[]`:

```json
{
  "round": 1,
  "phase": "B",
  "step": "scrutiny",
  "role": "gaffer",
  "mode": "scrutiny",
  "subagent_artifact": "generation/iterations/B-r1-gaffer-scrutiny.json",
  "blocking_count": 0
}
```

**Gate rule:** signed-off phases require every build/merge/scrutiny role for that phase, `subagent_artifact` on each step, and final `round_summary.blocking_count === 0` for `signed_off_clean`. See [iteration-protocol.md](iteration-protocol.md).

Templates: [../templates/iteration-log-entry.template.json](../templates/iteration-log-entry.template.json), [../templates/iteration-round-summary.template.json](../templates/iteration-round-summary.template.json)
