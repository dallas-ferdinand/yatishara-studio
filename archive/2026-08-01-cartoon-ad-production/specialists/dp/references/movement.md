# Camera movement — DP repertoire

Full grammar: [../../../references/camera-grammar-for-gen.md](../../../references/camera-grammar-for-gen.md).

Layering: [../../../references/depth-and-layering-for-gen.md](../../../references/depth-and-layering-for-gen.md).

## Dallas default: 3D space + layered planes

| Do | Don't |
|----|-------|
| Name FG / midground / BG in every env shot | Subject floating on blank wall |
| Dolly forward/back **through** the room | Optical zoom in/out |
| Track lateral — camera travels beside subject | Pan across room on fixed tripod |
| **Parallax per plane** on every travel move | "Cinematic" with no layer speeds |
| Settle-travel-breathe timing | Move starts at frame 0 with no read beat |
| Prompt **parallax** (FG fast, BG slow) | Flat slideshow |

## Spatial moves (default)

| ID | Prompt stem |
|----|-------------|
| `move:push-in-slow` | slow dolly forward **through space** toward [subject]; FG slides faster, BG slower |
| `move:pull-out-slow` | slow dolly backward **through space** revealing [environment]; geography opens |
| `move:track-lateral` | slow lateral tracking — camera **travels** left/right; FG wipe, BG counter-slide |
| `move:track-forward` | slow forward tracking — camera **walks into** room following [subject] |
| `move:track-backward` | slow backward tracking — camera retreats through space |
| `move:orbit-short` | slow 20–30° orbit **through** room around [subject] |
| `move:arc-tighten` | slow 15–25° orbit that ends closer to [subject] — single arc |
| `move:crane-up-short` / `move:crane-down-short` | slow vertical travel through space |
| `move:handheld-subtle` | subtle handheld **traveling with** [subject]; gentle parallax |
| `move:parallax-drift` | slow lateral drift — minimal travel; **layer speed difference** is the move |
| `move:reveal-past-fg` | dolly/track **past** soft foreground [object] revealing midground [subject] |
| `move:locked` | locked-off — tableau settle or CTA only |

## Rotational (last resort)

`move:pan-*`, `move:tilt-*` — only if spatial move cannot match action; DP must document why in rationale.

## Forbidden (blocking)

- `move:zoom-in-slow`, `move:zoom-out-slow`, any optical zoom
- Pan when track/dolly works
- Two moves per shot
- Midground-only composition with no layer clauses

## Timing template (4s shot) — settle-travel-breathe

```
0.0–0.6s locked settle — FG/MG/BG composition readable
0.6–3.2s slow [move] through space — [parallax per plane]
3.2–4.0s breathe hold on end frame
```

## Layer devices (pick one)

See [layered-composition.md](layered-composition.md): `frame-in-frame`, `foreground-wipe`, `leading-lines`, `negative-space`, `depth-stack`, `shallow-isolate`.
