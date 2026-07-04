# Lighting setups

Deep canon: [../../../references/lighting-foundation.md](../../../references/lighting-foundation.md).

## Motivated room setups

| ID | Key | Fill | Rim | Motivation | research_ref |
|----|-----|------|-----|------------|--------------|
| `light:window-key-soft` | Soft window side | Ambient bounce | None subtle | Morning kitchen | `research:huttunen-face-setups` (setup 2) |
| `light:practical-lamp-warm` | Table lamp 3200K | Dim room | None | Evening domestic | `research:color-temp-read` |
| `light:overhead-soft` | Diffused overhead | Walls | None | Dining neutral | — |
| `light:golden-hour` | Warm low sun | Sky fill | Hair optional | Exterior porch | `research:color-temp-read` |
| `light:overcast-flat` | Flat soft | Self | None | Grief/memory scenes | `research:grodal-affordance` |
| `light:fluorescent-mixed-window` | Cool overhead + window | Mixed | None | Workshop/office | — |
| `light:night-practical-only` | Lamp pool | Deep shadow | None | Late night beat | — |

## Face pattern setups (Huttunen 2022)

| ID | Pattern | key_fill | Joe faces | research_ref |
|----|---------|----------|-----------|--------------|
| `light-setup:1-front-soft` | Frontal soft | 2:1 | Safe, flat | `research:huttunen-face-setups` |
| `light-setup:2-45-rembrandt` | 45° Rembrandt triangle | 2:1–4:1 | **Default care** | `research:huttunen-face-setups` |
| `light-setup:3-90-split` | 90° split | 4:1 | Tension, readable | `research:huttunen-face-setups` |

### Negative setups — Ernesto brief only, never Joe domestic faces

| ID | Pattern | Effect | research_ref |
|----|---------|--------|--------------|
| `light-setup:4-under` | Underlight | Arousal↑ pleasantness↓↓ | `research:huttunen-face-setups` |
| `light-setup:5-overhead-hard` | Top hard / Godfather | Eye shadow, mistrust | `research:huttunen-face-setups` |
| `light-setup:6-underexposed` | Face too dark | Affordance break | `research:grodal-affordance` |
| `light-setup:8-silhouette` | Backlit contour | Intimidating | `research:huttunen-face-setups` |

## Shape vocabulary

soft, directional, motivated, single-source, bounced, diffused, negative-fill-left, Rembrandt-triangle, sculptural-shadow

## Product rule (Joe)

Never `light:product-spot-hero` — witness objects share room light.

## Outside-in default

Place key **through** window/door architecture before adding artificial sources — matches location-scout `window_direction`.
