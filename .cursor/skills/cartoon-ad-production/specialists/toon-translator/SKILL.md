---
name: toon-translator
description: >-
  Cartoon prompt translation specialist for cartoon ad production. Scrutinizes
  merged storyboard_prompt and generation_prompt after director merge — word
  budget, SCENE/CAMERA headers, cartoon look-prefix split, anti-photoreal block.
  Use in Phase C scrutiny only. Explicit invocation only.
disable-model-invocation: true
---

# Toon Translator

Owns **craft → model conditioning text** — verifies director merge produced prompts Seedance/Kling obey under cartoon look. **No downstream GPT rewrite** — scrutiny must pass prompts that are final ([../../references/direct-prompt-handoff.md](../../references/direct-prompt-handoff.md)).

**Not a builder.** Read-only scrutiny after Phase C director merge.

## Active phases

- **Phase C scrutiny** — every `shot_packets[]` row with cast on camera (and env-only shots with `generation_prompt`)

## Mandatory read

1. [../../references/direct-prompt-handoff.md](../../references/direct-prompt-handoff.md) — **no Flash rewrite; prompts are final**
2. [../../references/cartoon-translation-foundation.md](../../references/cartoon-translation-foundation.md) — **master translation layer**
3. [../../references/cartoon-look-foundation.md](../../references/cartoon-look-foundation.md) — **FULL look on storyboard only**
4. [../../references/cartoon-staging-foundation.md](../../references/cartoon-staging-foundation.md) — **2D staging, no zoom**
5. [../../references/start-frame-workflow.md](../../references/start-frame-workflow.md) — **I2V path**
6. [../../references/micro-pacing-foundation.md](../../references/micro-pacing-foundation.md) — **editorial duration → CAMERA scale**
7. [references/scrutiny-checklist.md](references/scrutiny-checklist.md)

## Scrutiny mode

For each shot, return structured objections per [iteration-protocol.md](../../references/iteration-protocol.md).

### storyboard_prompt (when `cast_on_camera`)

| Check | Blocking if |
|-------|-------------|
| FULL cartoon look prefix present | Missing cel/line/palette block |
| `FRAME:` header | Missing |
| FG/MG/BG layers | Vague single-paragraph frame |
| No travel verbs | `dolly`, `track`, `pan`, `push-in`, `pull-out`, `crane`, `orbit` |
| Photoreal leakage | Alexa, film grain, natural skin, documentary language |
| Prop lock when refs attach | `referenceElementIds` set but no PROP LOCK clause |

### generation_prompt

| Check | Blocking if |
|-------|-------------|
| Word count | >100 words |
| Headers | Missing `SCENE:` or `CAMERA:` |
| Look prefix split | Full cartoon look paragraph on I2V (abbreviated PRESERVE only) |
| Photoreal leakage | Alexa, film grain, photoreal skin, live-action footage |
| Zoom language | `zoom in/out`, `snap zoom`, `optical zoom` |
| Camera moves | >1 spatial move or duplicate of `camera.movement` field |
| Emotion labels | "sad", "happy", "emotional" instead of observable verbs |
| Environment re-description | Long room/light re-state when start frame carries look |
| Timing overflow | `timing_beats` reference times beyond `generation_duration_sec` |
| Micro-pacing mismatch | editorial ≤1.5s but CAMERA has long travel |

### Env-only shots (no cast)

Same `generation_prompt` rules; `storyboard_prompt` optional.

## Output format

```json
{
  "role": "toon-translator",
  "phase": "C",
  "round": 1,
  "shot_id": "S03",
  "severity": "blocking",
  "issue": "generation_prompt contains film grain — photoreal leakage",
  "fix": "Remove grain; add PRESERVE cartoon line; keep SCENE verbs + one CAMERA move"
}
```

Zero blocking required before director Phase C sign-off.

## References

- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
