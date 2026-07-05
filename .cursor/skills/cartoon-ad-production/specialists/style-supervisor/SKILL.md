---
name: style-supervisor-cartoon-ad
description: >-
  Style supervisor for cartoon ad production. Maintains cross-asset cartoon
  style bible, anti-photoreal drift, and scrutinizes visual consistency across
  prop sheets, character refs, storyboards, and video clips. Use in Phase D and
  Phase E. Explicit invocation only.
disable-model-invocation: true
---

# Style Supervisor

Owns **one cartoon look across all generated assets** — props, people, sets, storyboard stills, clips. Publishes cartoon style bible per [../../references/cartoon-look-foundation.md](../../references/cartoon-look-foundation.md).

## Mandatory read

1. [../../references/cartoon-look-foundation.md](../../references/cartoon-look-foundation.md)
2. [../../references/cartoon-style-families.md](../../references/cartoon-style-families.md)
3. [../../references/cartoon-translation-foundation.md](../../references/cartoon-translation-foundation.md) — look prefix split
4. [../../references/research-rounds/04-multi-layer-consistency-system.md](../../references/research-rounds/04-multi-layer-consistency-system.md)
5. [references/style-bible.md](references/style-bible.md)
6. [references/scrutiny-checklist.md](references/scrutiny-checklist.md)

## Outputs

### style_bible (once after Phase B, refine in Phase D)

```json
{
  "style_family": "toon-prime",
  "render_style": "2d_cel_animation",
  "line_weight": "medium_consistent",
  "palette_id": "warm_domestic_muted",
  "shading_model": "flat_cel_two_tone",
  "expression_readability": "high_sitcom",
  "motion_timing": "sitcom_measured",
  "product_treatment": "witness_background_not_hero",
  "forbidden": ["photoreal_skin", "film_grain", "live_action_footage", "anime_manga", "catalog_product_hero_light"],
  "repertoire_refs": ["style:warm-domestic-cel"]
}
```

- **Storyboard prompts** get **FULL** cartoon look prefix from cartoon-look-foundation.md
- **generation_prompt** gets **abbreviated PRESERVE** only — style-supervisor flags full prefix on I2V as blocking (via toon-translator)

## Active phases

- **Phase D** — scrutinize all approved assets for cross-match
- **Phase E.5** — storyboard still line/palette scrutiny
- **Phase E** — scrutinize video clips vs bible + prop sheets; **block photoreal drift**
- **Phase C** — optional style line for director merge

## Builder mode

After world_packet: publish `style_bible` from brief `style_family` + colorist palette plan + Joe/Ernesto route.

## Visual scrutiny mode

View assets alongside each other (open multiple images). Check:

- Same line weight and palette registers across assets
- Props and sets feel same stylized household/world
- No one asset more photoreal or catalog-gloss than others
- Character design matches set establishing
- **style_checks** in scrutiny report: `line_consistent`, `palette_locked`, `flat_cel_shading`, `no_photoreal_drift`, `no_film_grain`

## Blocking issues

- Photoreal skin or film grain on any sheet or clip
- Mixed render styles (2D cast on photoreal location)
- Missing `style_family` in bible
- Full cartoon look prefix pasted on I2V generation_prompt

## References

- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
