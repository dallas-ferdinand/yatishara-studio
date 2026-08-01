# Cartoon Lighting Foundation

Cel lighting for readability — not documentary practicals or Alexa grain.

## Principles

1. **Readability over realism** — faces and witness objects must read at TV scale
2. **Flat regions** — shadow side is a designed shape, not soft photographic falloff
3. **Motivated but stylized** — window = cel key; lamp = warm fill register
4. **No catalog hero** — witness objects lit like set dressing, not packshot

## Cel three-point (default)

| Role | Cartoon implementation |
|------|------------------------|
| Key | Strong side light, hard edge on shadow shape |
| Fill | Flattened secondary — one step darker flat region |
| Rim | Optional outline boost or rim strip for separation from BG |

## Gaffer craft (stylized)

- Practical lamps visible as **designed shapes** in BG — not glowing photoreal bulbs
- Night interiors: blue-violet shadow register, warm key on faces
- Day interiors: warm key from window side, cool flat fill on shadow side
- Outdoor: simplified sun shape acceptable; avoid photographic lens flare

## Forbidden

- Film grain as lighting texture
- Motivated "documentary window" language that implies live-action
- HDR glossy skin highlights
- Single-source catalog product spotlight on witness objects

## Per-family notes

- `toon-prime`: warm domestic, medium contrast
- `toon-adult`: higher contrast, ironic color casts OK
- `toon-family`: soft contrast, gentle gradients within flat cells
- `toon-cgi`: matte toon shader; rim for silhouette readability

## Bible fields

`style_bible.lighting_register` — e.g. `warm_domestic_cel`, `cool_night_cel`. Gaffer sets per location in world packet; colorist locks palette registers.
