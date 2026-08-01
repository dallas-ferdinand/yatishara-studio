# Scene rhythm patterns — quick picker

Full theory: [../../../references/micro-pacing-foundation.md](../../../references/micro-pacing-foundation.md).

## 3-shot scene templates (5s example)

| pattern_id | Split (s) | Feels like |
|------------|-----------|------------|
| `legato_opener` / `slow_fast_fast` | 3 + 1 + 1 | Slow scene (long opener) |
| `staccato_equal` | 1.67 + 1.67 + 1.67 | Fast, metronomic |
| `fast_fast_slow` | 1 + 1 + 3 | Action → dramatic hold / slow-mo |
| `accelerate_3` | 2 + 1.5 + 1 | Rising tension |
| `decelerate_3` | 1 + 1.5 + 2.5 | Settling / witness |
| `breathe_punch_breathe` | 2 + 1 + 2 | Glance → object → hold |

## 4-shot scene (8s example)

| pattern_id | Split (s) |
|------------|-----------|
| `staccato_equal` | 2 + 2 + 2 + 2 |
| `legato_opener` | 4 + 1.5 + 1.5 + 1 |
| `accelerate_4` | 2.5 + 2 + 1.5 + 1 |
| `fast_fast_slow` | 1 + 1 + 1 + 5 (hold) |

## Opener ratio cheat sheet

| First shot % of scene | Register |
|-----------------------|----------|
| ≥55% | legato |
| 35–54% | mixed |
| ≤34% | staccato / accelerate |

## Cross-scene rule

Adjacent scenes: **same `pattern_id`** OR explicit `pace_shift_intent` in `scene_rhythms[]`.

## Prompt bias by role

| role_in_scene | CAMERA default |
|---------------|----------------|
| `opener_anchor` | slow dolly; full settle-travel-breathe |
| `staccato_beat` | locked-off; trim hard |
| `deceleration_hold` | slow-motion weight; extended breathe |
| `punch_beat` | locked or short track; match-action |
