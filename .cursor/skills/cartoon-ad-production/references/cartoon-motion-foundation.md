# Cartoon Motion Foundation

Timing and motion craft for stylized animation ads. Feeds editor micro-pacing and toon-translator scrutiny.

## Timing models

| Register | Use | Character |
|----------|-----|-----------|
| `sitcom_measured` | `toon-prime` default | Held poses, squash on reaction, return to model |
| `snappy_staccato` | `toon-adult` | Fast anticipations, sharp holds |
| `legato_warm` | `toon-family` | Gentle ease, soft overshoot |
| `cg_weighted` | `toon-cgi` | Slightly floaty but not rubber-hose |

## Squash and stretch

- Allowed on **reaction beats** — one clear squash, return to design proportions
- Forbidden: rubber-hose drift across entire spot unless bible explicitly allows
- Witness objects: minimal squash — object identity locked

## Held poses

- Emotional beats land on **held frame** 0.3–0.8s within clip (editor `rhythm` block)
- Dialogue-light ads: expression hold carries beat
- Do not stack multiple unrelated actions in short `generation_duration_sec`

## CAMERA scale vs editorial duration

Sync with [micro-pacing-foundation.md](micro-pacing-foundation.md):

- Editorial leg ≤1.5s → CAMERA: held or micro-push only
- Legato opener → following locked insert may use staccato CAMERA — pattern must match editor `rhythm.pattern`
- Blocking: long dolly/travel verb on 1s editorial leg

## Seedance / Kling notes

- Motion engines run under cartoon PRESERVE line — they do not imply photoreal physics
- Prefer observable verbs: "sets mug down", "turns toward window", "holds expression"
- SFX: snappier foley acceptable for `toon-adult`; gentle for `toon-family`

## Forbidden motion language

- Photoreal handheld shake as default
- Anime speed lines unless brief requests
- Hypermotion whip-pan unless spot is explicitly high-energy family override
