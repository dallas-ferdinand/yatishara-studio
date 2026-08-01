# Cartoon Staging Foundation

2D composition and readability for TV-scale animated ads.  
**Research depth:** [2d-depth-illusion-foundation.md](2d-depth-illusion-foundation.md) — multiplane, parallax, framing, volumetric 2D light.

## Composition goals

1. **Silhouette clarity** — cast readable against BG flat regions
2. **Negative space** — sitcom staging: room to breathe around witness object
3. **Eye-line triangles** — classic 2D screen direction; layered depth when camera travels
4. **Witness object placement** — MG anchor with optional soft FG device; never floating catalog center

## Camera grammar (2D / 2.5D)

- **Held camera** default for static emotional beats
- **Spatial travel** (dolly, track) when editor leg ≥2s — activates **parallax** across FG/MG/BG
- **One move per shot** — push, truck, or short orbit in cartoon space
- Depth = **FG/MG/BG layers** in storyboard + **unequal layer speeds** on move — not zoom
- Intercut: maintain screen direction and eyeline across cuts

## Depth cues (cartoon register)

| Cue | Cartoon application |
|-----|---------------------|
| Overlap | Character behind furniture — instant Z |
| Size on Z | Subject grows on push-in |
| Atmospheric BG | Softer value on far wall — not grey fog |
| Outline + value | Primary separation for flat TV |
| Soft FG wipe | Optional on spatial shots — MG stays sharp |
| Light rim | MG separation without photoreal bokeh |

## DP staging vs live-action

| Live-action (deprecated) | Cartoon |
|------------------------|---------|
| Shallow DOF separation | Outline + value contrast |
| Lens mm language | Framing scale: wide / medium / close |
| Documentary observational | Held pose + readable expression |
| Dolly on floor track | Stylized push across flat planes |

## Scene rhythm

Editor assigns `camera_intent` and energy; DP specifies `depth_layers` in shot packet. Staging must support [micro-pacing-foundation.md](micro-pacing-foundation.md) — short editorial legs need snappy CAMERA scale, not long travel verbs.

## Location plates

Environment sheets are **stylized establishing angles** — no documentary Caribbean realism language unless bible specifies cultural staging generically.

## Forbidden

- Photoreal depth-of-field as primary separation
- Cinematic anamorphic bokeh references
- "Observational documentary camera" staging language
