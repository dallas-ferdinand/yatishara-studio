# Camera bodies and stability (generative)

No physical camera on AI video — these are **look + stability families** for prompts.

Full grammar: [../../../references/camera-grammar-for-gen.md](../../../references/camera-grammar-for-gen.md).

| ID | Character | Prompt phrase | Use when |
|----|-----------|---------------|----------|
| `body:observational` | Neutral documentary | observational documentary camera | Default story lens personality |
| `body:locked-tripod` | Tripod truth | locked-off tripod, stable static camera | Tableaus, inserts, CTA |
| `body:gimbal-slow` | Slow gimbal | smooth slow gimbal motion | Push, pull, track, pan |
| `body:documentary-handheld` | Subtle handheld | subtle documentary handheld, gentle breathe | Ernesto friction scenes |
| `body:cinema-large-format` | Large format falloff | large format shallow depth of field | Premium witness, product |

## Stability constraints (every video prompt)

Director merge appends one line from this set:

- `stable tripod motion, no sudden zoom`
- `smooth slow gimbal, no spatial warping`
- `subtle handheld only, no shaky-cam`

**Never:** unstabilized + fast move in same shot.

## Default pairing

| Movement | Body |
|----------|------|
| `move:locked`, `move:static-observe` | `body:locked-tripod` |
| `move:push-in-slow`, `move:pull-out-slow`, `move:pan-*`, `move:track-*` | `body:gimbal-slow` |
| `move:handheld-subtle` | `body:documentary-handheld` |
