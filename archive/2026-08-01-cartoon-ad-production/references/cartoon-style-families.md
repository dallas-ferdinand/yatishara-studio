# Cartoon Style Families

Maps Studio preset slugs to per-production `style_bible` fields. Generic families only — never trademark show names in generated prompts.

## Preset taxonomy

| Slug | UI name | Reference feel (describe generically) | Primary use |
|------|---------|--------------------------------------|-------------|
| `toon-prime` | Prime 2D | Thick outline, flat cel, sitcom staging, adult proportions | Default video/script |
| `toon-adult` | Adult 2D | Sharper deformation, snappier motion, edgier palette | Conversion, satire |
| `toon-surreal` | Surreal 2D | Thin-limbed adults, scribble pupils, suburban × cosmic environments | Adult alt-reality satire |
| `toon-family` | Family soft | Rounded forms, gentle color, warm domestic | Brand warmth |
| `toon-cgi` | Stylized 3D | Non-photoreal CG, soft forms | Optional 3D spots |
| `toon-neon-idol` | Neon Idol 3D | Polished CG, neon urban fantasy, idol-action groups | High-energy brand spots, fantasy action |

Deprecated slugs (`story-ad`, `realism`, `cinematic`, etc.) resolve to `toon-prime` with API warning.

## Bible fields per family

### `toon-prime` (default)

```json
{
  "style_family": "toon-prime",
  "render_style": "2d_cel_animation",
  "line_weight": "medium_consistent",
  "palette_id": "warm_domestic_muted",
  "shading_model": "flat_cel_two_tone",
  "expression_readability": "high_sitcom",
  "motion_timing": "sitcom_measured",
  "forbidden": ["photoreal_skin", "film_grain", "live_action_footage", "anime_manga"]
}
```

### `toon-adult`

- `line_weight`: `medium_sharp`
- `palette_id`: `saturated_ironic`
- `shading_model`: `flat_cel_hard_edge`
- `expression_readability`: `high_exaggerated`
- `motion_timing`: `snappy_staccato`
- Deformation allowed on reaction; return to model sheet after

### `toon-surreal`

- `line_weight`: `bold_uniform_black`
- `palette_id`: `muted_characters_cosmic_backdrops`
- `shading_model`: `flat_cel_minimal`
- `expression_readability`: `deadpan_adult_cynical`
- `motion_timing`: `snappy_staccato`
- `eye_style`: `white_circle_scribble_pupil`
- `proportion_style`: `thin_lanky_large_head`
- `mouth_style`: `simple_line_or_w_shape`
- `environment_contrast`: mundane suburban domestic (kitchen, entryway, beige walls) colliding with cosmic aurora skies, impossible scale, miniature landscapes
- Characters stay flat and muted; surrealism is in the **world around them**, not neon character gloss
- **Forbidden:** trademark characters, named IP, photoreal skin, environments-only psychedelia without readable cast

### `toon-family`

- `line_weight`: `soft_rounded`
- `palette_id`: `pastel_warm`
- `shading_model`: `flat_cel_soft`
- `expression_readability`: `gentle_clear`
- `motion_timing`: `legato_warm`
- Rounded silhouettes; no sharp satire deformation

### `toon-cgi`

- `render_style`: `stylized_3d`
- `line_weight`: `none_or_subtle_rim`
- `shading_model`: `matte_toon_shader`
- `palette_id`: per bible
- No PBR photoreal materials; no ray-traced skin

### `toon-neon-idol`

- `render_style`: `polished_stylized_3d`
- `line_weight`: `none_cinematic_rim`
- `shading_model`: `neon_backlit_cg`
- `palette_id`: `neon_urban_fantasy`
- `expression_readability`: `idol_stage_confident`
- `motion_timing`: `snappy_kinetic`
- `fashion_register`: `idol_tactical_streetwear`
- `environment`: neon-lit city nights, dramatic backlight, music-video staging
- **Forbidden:** trademark characters, named IP, photoreal skin, live-action

## Planning intake

Required at Phase 0:

1. **Style family** — one of the six slugs above (`toon-prime` | `toon-adult` | `toon-surreal` | `toon-family` | `toon-cgi` | `toon-neon-idol`)
2. **Tone** — `serious_animated` (default) vs `lighter` (still not photoreal)
3. **Reference mood** — describe palette/staging generically; mood boards OK, show names forbidden in prompts

## Studio defaults

| Entry point | Slug |
|-------------|------|
| Video/script UI | `toon-prime` |
| Image UI | `toon-prime` |
| HTTP API | `toon-prime` |
| MCP generate | `toon-prime` |

## Per-production fine-tuning

Preset sets family defaults; `style_bible` fine-tunes within family (palette registers, line weight, forbidden list). Style-supervisor owns drift detection.
