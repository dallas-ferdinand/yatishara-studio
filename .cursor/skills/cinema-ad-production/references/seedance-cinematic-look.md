# Seedance cinematic look — mandatory for Phase C + E

All `generation_prompt` strings and `style_bible` entries must enforce **filmed-on-camera** aesthetics for Seedance 2.0 video. Default Studio output skews glossy/animated unless prompts explicitly forbid it.

## Style bible fields (required)

```json
{
  "photorealism": "seedance_cinematic_documentary",
  "camera_body": "body:observational",
  "lens_family": "35-50mm naturalistic",
  "grain": "subtle_35mm_film_grain_visible",
  "skin_texture": "natural_not_retouched",
  "lighting": "motivated_practical_natural_only",
  "motion": "real_time_human_pace_no_morph",
  "forbidden": [
    "cgi_gloss",
    "ai_plastic_skin",
    "catalog_product_hero_light",
    "teal_orange_blockbuster",
    "smooth_vector_animation",
    "ad_smile_at_lens",
    "beauty_filter",
    "hyper_sharp_digital"
  ]
}
```

## Mandatory prompt prefix (every shot_packet.generation_prompt)

Orchestrator and director merge **must** prepend look language — **split by prompt type**:

### `storyboard_prompt` (E.5 — FULL prefix, verbatim)

```
Seedance 2.0 cinematic. Shot on ARRI Alexa with Zeiss Supreme primes. Natural film grain visible in midtones. Motivated practical window light only — no beauty dish, no catalog gloss. Real human skin texture, subtle pores, no AI smoothing. Movement at real-time human pace; no morphing, no floaty drift. Documentary Caribbean domestic realism — filmed not generated, not illustrated, not animated.
```

The start frame must match the video look — **full prefix belongs here**.

### `generation_prompt` (E — ABBREVIATED preserve line only)

I2V attention budget is **60–100 words** ([seedance-translation-foundation.md](seedance-translation-foundation.md)). Do **not** repeat the full Alexa paragraph — the start frame already carries look.

```
Preserve start-frame composition, colors, and motivated light. Documentary film grain, natural skin texture, no AI gloss or morphing.
```

Then **SCENE / CAMERA / SOUND / CONSTRAINTS** slots — motion and camera only.

## Phase E gates

No `studio_generate_video` until:
- `style_bible.seedance_cinematic` is true
- every `shot_packet.generation_prompt` contains the mandatory prefix
- when cast on camera: `startFrameAssetId` is set from E.5 storyboard ([start-frame-workflow.md](start-frame-workflow.md))

Flag `blocking` if clip shows:

- Plastic/waxy skin
- Over-sharpened HDR gloss
- Smooth tweened motion between poses
- Product/catalog lighting on faces or props
- Missing grain — looks like mobile game cutscene
- Spatial warp, **flat optical zoom**, or pan-slideshow (no parallax) — see [camera-grammar-for-gen.md](camera-grammar-for-gen.md)

## Camera vs look (do not conflate)

- **This doc** = film grain, skin, light motivation, anti-gloss
- **Translation** = [seedance-translation-foundation.md](seedance-translation-foundation.md) — **how craft becomes Seedance prompts**
- **Camera moves, framing, angles** = [camera-grammar-for-gen.md](camera-grammar-for-gen.md)
- Full look on **storyboard**; abbreviated PRESERVE on **generation_prompt** (I2V word budget)

## Specialist ownership

| Role | Owns |
|------|------|
| style-supervisor | bible + anti-gloss forbidden list |
| gaffer | motivated practical light per shot — no unmotivated rim |
| dp | lens/shot size/angle/**one movement** — see [camera-grammar-for-gen.md](camera-grammar-for-gen.md) |
| colorist | warm_neutral_low_sat — no blockbuster grade |

## Anti-gloss scrutiny (style-supervisor Phase E)
