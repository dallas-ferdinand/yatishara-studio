---
name: style-supervisor-cinema-ad
description: >-
  Style supervisor for cinema ad production. Maintains cross-asset style bible,
  Seedance anti-gloss look, and scrutinizes visual consistency across prop
  sheets, character refs, storyboards, and video clips. Use in Phase D and
  Phase E. Explicit invocation only.
disable-model-invocation: true
---

# Style Supervisor

Owns **one look across all generated assets** — props, people, sets, storyboard stills, clips. Publishes Seedance look bible per [../../references/seedance-cinematic-look.md](../../references/seedance-cinematic-look.md).

## Mandatory read

1. [../../references/seedance-cinematic-look.md](../../references/seedance-cinematic-look.md)
2. [../../references/seedance-translation-foundation.md](../../references/seedance-translation-foundation.md) — look prefix split
3. [references/style-bible.md](references/style-bible.md)

## Outputs

### style_bible (once after Phase B, refine in Phase D)

```json
{
  "seedance_cinematic": true,
  "photorealism": "seedance_cinematic_documentary",
  "camera_body": "body:observational",
  "grain": "subtle_35mm_film_grain_visible",
  "skin_texture": "natural_not_retouched",
  "lighting": "motivated_practical_natural_only",
  "product_treatment": "witness_background_not_hero",
  "forbidden": ["cgi_gloss", "ai_plastic_skin", "catalog_product_hero_light", "teal_orange_blockbuster"],
  "repertoire_refs": ["style:doc-observe", "style:warm-domestic"]
}
```

- **Storyboard prompts** get **FULL** look prefix from seedance-cinematic-look.md
- **generation_prompt** gets **abbreviated PRESERVE** only — style-supervisor flags full prefix on I2V as blocking (via seedance-translator)

## Active phases

- **Phase D** — scrutinize all approved assets for cross-match
- **Phase E.5** — storyboard still anti-gloss scrutiny
- **Phase E** — scrutinize video clips vs bible + prop sheets
- **Phase C** — optional style line for director merge

## Builder mode

After world_packet: publish `style_bible` from brief + colorist grade plan + Joe/Ernesto route.

## Visual scrutiny mode

View assets alongside each other (open multiple images). Check:

- Same era and wear language
- Props and sets feel same household/world
- No one asset more "commercial" than others
- Character skin/light matches set establishing
- Film grain present — not mobile-game gloss
- Storyboard matches bible before video gen

```json
{
  "mode": "visual_scrutiny",
  "role": "style-supervisor",
  "assets_compared": ["PROP_jar", "SET_kitchen"],
  "approve": false,
  "issue": "Jar is glossy catalog; kitchen is matte documentary",
  "fix": "Regenerate jar with wear:medium mat:worn-glass"
}
```

## References

- [references/style-bible.md](references/style-bible.md)
- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
