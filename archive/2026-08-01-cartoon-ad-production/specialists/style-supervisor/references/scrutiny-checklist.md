# Style supervisor — scrutiny checklist

Cross-asset cartoon look. View files side-by-side — never approve from prompt text alone.

Canon: [../../../references/research-rounds/01-consistency-root-causes.md](../../../references/research-rounds/01-consistency-root-causes.md) §Style drift, [04-multi-layer-consistency-system.md](../../../references/research-rounds/04-multi-layer-consistency-system.md) Layer 5.

## Phase D — sheets & plates

- [ ] `style_bible` complete: style_family, render_style, line_weight, palette_id, shading_model, forbidden[]
- [ ] All sheets share line weight register (character = prop = location)
- [ ] Flat cel two-tone — no airbrush, no photoreal skin, no film grain
- [ ] Palette hues within `palette_id` family across assets
- [ ] Witness props: domestic staging, no catalog hero gloss
- [ ] `cartoon_checks.line_weight_consistent` true on every asset
- [ ] `cartoon_checks.no_photoreal_drift` true on every asset

## Phase E.5 — storyboard stills

- [ ] FULL cartoon look prefix present (not abbreviated PRESERVE)
- [ ] Line weight matches element sheets
- [ ] Palette matches style_bible + colorist plan
- [ ] Silhouette readable at thumbnail scale
- [ ] No photoreal bokeh, pores, or lens language in still
- [ ] `cartoon_checks.start_frame_match` vs element sheets — blocking if fail

## Phase E — video clips (Layer 5 style pass)

Compare clip to: style_bible, element sheet, E.5 start frame.

- [ ] Frame 1 matches start frame grade and line weight
- [ ] Mid/end frames: cel step count stable (not airbrush creep)
- [ ] Outline color/weight stable on scrub — no ink flicker
- [ ] Palette hue family unchanged (warm/cool drift = fail)
- [ ] No photoreal skin texture mid-clip
- [ ] No film grain or Alexa/documentary look
- [ ] Background style matches location sheet register

### Rejection actions

| Finding | Action |
|---------|--------|
| Frame 1 wrong | Regen E.5 storyboard — do not regen video |
| Mid-clip style drift only | Regen E with CONSTRAINTS: no color shift, no ink flicker |
| Persistent cross-shot drift | Add style anchor ref; batch by shot_size; post LUT |

## Cross-shot (campaign)

- [ ] Shot N and N+1 could air on same sitcom episode — same "show"
- [ ] No shot looks like a different render_style family
- [ ] Grade within one LUT family (colorist post plan noted if drift)
