# Music arcs

## Presence modes

| ID | Description |
|----|-------------|
| `music:none` | Default Joe — SFX only in generative clip |
| `music:underscore-soft` | Piano/strings pad, low |
| `music:pulse-light` | Rhythmic forward — Ernesto turn |
| `music:swell-end` | Post only — not in Seedance gen |

## Entry/exit (when not none)

| ID | Pattern |
|----|---------|
| `music:enter-after-sc01` | Open on sound only |
| `music:duck-dialogue` | -12dB under lines |
| `music:cut-silence-beat` | Hard out before pause |
| `music:fade-last-5s` | End card approach |

## Duration guidance

| Ad length | Score recommendation |
|-----------|---------------------|
| 60s Joe | None or enter SC04 only |
| 90s Joe | Underscore SC03 onward max |
| 90s Ernesto | Pulse from turn scene |

## generation_prompt

If `music:none`, omit music from prompt. If underscore, one line: "no score in clip; post underscore noted."
