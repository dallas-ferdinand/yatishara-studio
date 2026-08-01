# Cartoon Color Foundation

Limited palette discipline for brand-consistent animated ads.

## Palette structure

1. **Base registers** — 4–6 flat hues for BG, skin tone family, accent
2. **Outline harmony** — stroke color derived from shadow register, not pure black always
3. **Witness object register** — object sits in muted domestic range, not neon hero
4. **Accent sparingly** — one accent hue per scene for story beat (e.g. honey gold)

## Rules

- No photographic color grading language (teal-orange documentary grade forbidden)
- Flat regions — no airbrush gradients except `toon-family` soft family
- Skin: **designed tone families** per cast — lock in character sheets
- Props share outline weight and shadow register with cast

## Colorist deliverables

- `palette_registers[]` in style bible with hex or named registers
- Per-scene override only when story demands (e.g. memory wash) — log in shot packet
- Scrutiny: blocking if photoreal skin tone drift or glossy product saturation

## Family defaults

| Family | Character |
|--------|-----------|
| `toon-prime` | Warm domestic muted |
| `toon-adult` | Saturated ironic, higher contrast |
| `toon-family` | Pastel warm, low contrast |
| `toon-cgi` | Matte shader palettes, no PBR metal unless stylized |

## Anti-patterns (blocking)

- Film grain as color texture
- Live-action LUT references
- Anime neon hair / eye gradient defaults
