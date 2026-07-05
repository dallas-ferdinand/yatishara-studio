# Cartoon Look Foundation

Master visual contract for Yatishara cartoon production. Replaces photoreal cinema look. Every generated still and clip must read as **traditional stylized animation** — emotional realism inside a drawn world.

## Core belief

Animation sells human truth through **readable expression, held poses, and designed domestic space** — not documentary texture. The audience feels real because behavior is honest, not because skin pores are visible.

## Render model (default: 2D cel)

| Field | Default (`toon-prime`) | Notes |
|-------|------------------------|-------|
| `render_style` | `2d_cel_animation` | Flat regions + consistent outline |
| `line_weight` | `medium_consistent` | Same stroke across cast and props |
| `shading_model` | `flat_cel_two_tone` | Key side + shadow side, no airbrush |
| `palette_id` | `warm_domestic_muted` | Limited hues, outline harmony |
| `expression_readability` | `high_sitcom` | Eyes/mouth carry emotion at TV scale |

## Mandatory look prefix (FULL — storyboard only)

Use on `storyboard_prompt` when `cast_on_camera`. Never paste full block on I2V `generation_prompt`.

```
Traditional 2D cel animation, consistent medium line weight, flat two-tone shading, limited warm domestic palette, high sitcom expression readability, stylized domestic interior, no photoreal skin, no film grain, no live-action footage, no anime manga styling.
```

Abbreviated PRESERVE line for I2V (when start frame carries look):

```
Preserve start-frame cartoon look: consistent line weight, flat cel shading, locked palette — motion only.
```

## Forbidden (blocking)

- Photoreal skin, pores, photographic depth-of-field bokeh
- Film grain, Alexa/ARRI/Zeiss camera language
- Live-action documentary framing language
- Anime/manga eye highlights, speed lines, chibi proportions (unless brief explicitly requests — default forbidden)
- Catalog product gloss on witness objects

## Expression rules

- Emotion via **pose + face shape + held beat** — never caption labels
- Mouth shapes readable at 1080p; eyes carry intent
- Squash on reaction beats; return to design proportions after

## Prop and witness-object lock

Witness objects share **same line weight and palette register** as cast. No hero packshot lighting — object sits in domestic staging like a sitcom prop.

## Style bible linkage

`production_bible.style_bible` must set `style_family`, `render_style`, `line_weight`, `palette_id`, `shading_model`, `expression_readability`, and `forbidden[]`. Style-supervisor scrutiny blocks sign-off without these fields.

## References

- [cartoon-style-families.md](cartoon-style-families.md) — preset family tuning
- [cartoon-translation-foundation.md](cartoon-translation-foundation.md) — FULL vs PRESERVE split
- [cartoon-color-foundation.md](cartoon-color-foundation.md)
- [cartoon-lighting-foundation.md](cartoon-lighting-foundation.md)
