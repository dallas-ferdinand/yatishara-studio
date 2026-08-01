# Silence map

Deep canon: [../../../references/sound-foundation.md](../../../references/sound-foundation.md) §7.

Silence is **designed negative space** (Chion) — relational, not empty track.

## Silence types

| Type | Duration | Function | Camera align |
|------|----------|----------|--------------|
| **Pre-action** | 0.3–0.8s | Anticipation before witness touch | settle phase end |
| **Post-action** | 0.5–1.2s | Object lands emotionally | breathe phase |
| **Structural** | 1–3s | Time passage breath | WS hold |
| **Pre-narrator** | 1–3s | Post VO space | end card only |

## When silence wins

| Story beat | Silence duration | sound_register |
|------------|------------------|----------------|
| Pause before reach | 0.5–1.5s | `unfinished_ritual` |
| Witness object hold | 1–2s | `quiet_hold` |
| Post-friction | 0.8–1.2s | `friction_pressure` |
| Pre-narrator (end) | 1–3s before VO in post | `forward_relief` |

## silence_beats format

```json
{
  "type": "post-action",
  "duration_ms": 900,
  "align_camera_phase": "breathe",
  "duck_bed": true
}
```

Legacy string form still accepted: `"0.8-1.2s hold at pause"`.

## Chion / Murch alignment

- **Empathetic silence** — room tone ducks to near-zero; audience *feels* absence
- **Anempathetic bed** over grief — **blocking** unless ironic brief
- Murch: silence lets **eye-trace** complete before cut

## Joe route

At least one **full silence** shot or beat in 60–90s ad (`temp:quiet-hold`).

## vs composer

If `music:presence` not none in same shot, flag `negotiate` unless director approved.

## Scrutiny

- `blocking`: `silence_beats` shorter than camera breathe phase
- `blocking`: loud ambience fights designed silence
- `blocking`: stacked transients inside silence window
