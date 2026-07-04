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
  "narrator_close": ""
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
  "action": "Hands reach for second mug; pause mid-reach.",
  "camera": {
    "lens": "50mm",
    "height": "counter_level",
    "framing": "medium_close_hands",
    "movement": "static_observe_push_last_0.5s",
    "repertoire_refs": []
  },
  "lighting": {
    "key": "soft_window_left",
    "fill": "ambient_bounce",
    "contrast": "low_warm",
    "repertoire_refs": []
  },
  "sound": {
    "bed": "quiet_kitchen_room_tone",
    "sfx": ["ceramic_mug_slide", "distant_bird"],
    "silence_beats": ["0.8-1.2s hold at pause"],
    "repertoire_refs": []
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
  "emotional_temperature": {
    "register": "quiet_hold",
    "behavior_proof": "",
    "sonic_register": "",
    "light_register": "",
    "repertoire_refs": []
  },
  "generation_prompt": ""
}
```

`generation_prompt` is 150–400 words, Seedance-ready, observable actions only. Use `## Generation prompt` heading when embedded in markdown bible.

`reference_assets` — IDs from `approved_asset_registry` (Phase D).

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
  "reviews": [],
  "blocking_count": 1,
  "negotiate_count": 0,
  "note_count": 2
}
```

Templates: [../templates/](../templates/)
