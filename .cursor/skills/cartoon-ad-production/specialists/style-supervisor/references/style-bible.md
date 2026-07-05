# Style bible template

Copy into Production Bible section **Style bible**.

## Core fields

| Field | Example (`toon-prime` domestic) |
|-------|--------------------------------|
| style_family | toon-prime |
| render_style | 2d_cel_animation |
| line_weight | medium_consistent |
| palette_id | warm_domestic_muted |
| shading_model | flat_cel_two_tone |
| expression_readability | high_sitcom |
| motion_timing | sitcom_measured |
| era | contemporary_stylized_domestic |
| product_treatment | witness_background |
| lighting_register | warm_domestic_cel |

## Forbidden list (always)

- photoreal_skin, film_grain, live_action_footage
- Catalog product hero lighting on witness object
- Anime/manga defaults unless brief explicitly requests
- Teal/orange documentary grade
- Mixed render styles without story reason
- Text baked into generative clips

## Per-asset injection

Every `storyboard_prompt` opens with FULL cartoon look prefix per [cartoon-look-foundation.md](../../references/cartoon-look-foundation.md).

Every `generation_prompt` opens with abbreviated PRESERVE line only.

## Phase D gate

No asset approved unless `style_bible_match: true` and `style_checks.no_photoreal_drift: true` in visual scrutiny.
