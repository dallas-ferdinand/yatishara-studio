# Perceptual lighting — gaffer

**Deep canon:** [../../../references/lighting-foundation.md](../../../references/lighting-foundation.md) — face setups, Kelvin, Grodal affordance, light planes.  
Summary: [../../../references/perceptual-foundation.md](../../../references/perceptual-foundation.md) §3.

## Builder: extend `shot_packet.lighting`

```json
{
  "key": "soft_window_left",
  "fill": "ambient_bounce",
  "contrast": "low_warm",
  "key_fill_ratio": "2:1",
  "contrast_register": "high_key_comfort",
  "lighting_setup_id": "light-setup:2-45-rembrandt",
  "color_temp_k": 5600,
  "motivation_psychology": "window side key — viewer reads ordinary truthful morning, not studio gloss",
  "light_planes": ["fg_soft", "mg_window_key", "bg_fill"],
  "research_refs": ["research:key-fill-empathy", "research:huttunen-face-setups"]
}
```

## Ratio → perceptual register

| key_fill_ratio | contrast_register | Viewer reads |
|----------------|-------------------|--------------|
| `2:1` | `high_key_comfort` | Safety, domestic ordinary, Joe morning |
| `4:1` | `naturalistic` | Real room, readable truth |
| `6:1` | `dramatic_motivated` | Pressure, focus — Ernesto friction |
| `8:1+` | `low_key_tension` | Mystery, malice registers — rare, brief must ask |

## Direction psychology

| Setup | Effect | When |
|-------|--------|------|
| Window side key | Honesty, time-of-day | Joe default |
| Practical pool | Isolation, night interior | Late beat only |
| Flat overcast | Memory, grief distance | Time passage |
| Unmotivated rim on product | Ad distrust | **Forbidden Joe** |

## Cross-channel (gaffer scrutiny)

- `blocking`: 8:1 low-key on `temp:ordinary-morning`
- `blocking`: product hero rim — breaks witness trust
- `negotiate`: high contrast on designed cast face — empathy mimicry may over-intensify; prefer 4:1

## Empirical note (Projections 2020)

High-contrast lighting can **amplify** facial empathic mimicry — useful for Ernesto turn visibility; use softer ratios on Joe observation so viewer **completes** meaning themselves.
