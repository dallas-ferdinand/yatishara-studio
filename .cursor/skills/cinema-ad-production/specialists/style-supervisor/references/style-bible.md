# Style bible template

Copy into Production Bible section **Style bible**.

## Core fields

| Field | Example (Joe domestic) |
|-------|---------------------|
| photorealism | documentary_observational |
| era | contemporary_lived_in |
| color_world | warm_neutral, not saturated |
| lens_world | 35-50mm naturalistic |
| light_world | motivated window/practical |
| grain | subtle_film_optional |
| product_treatment | witness_background |
| cast_texture | real skin, no beauty filter |

## Forbidden list (always)

- Catalog product hero lighting on witness object
- Stock photo smiles at camera
- Teal/orange blockbuster grade unless brief demands
- Mixed eras without story reason
- Text baked into generative clips

## Per-asset injection

Every `generation_prompt` and `prop_sheet_prompt` opens with:

```
Style: {photorealism}, {era}, {color_world}. {product_treatment}.
```

## Phase D gate

No asset approved unless `style_bible_match: true` in visual scrutiny checks.
