# Consistency root causes — L2 deep canon

**Problem statement:** Generated clips look like different shows — line weight shifts, palette jumps, face morphs, props change shape. Element sheets + start frames alone do not guarantee consistency.

**L1 owners:** style-supervisor (look), character-continuity (identity), continuity-supervisor (spatial), toon-translator (prompt conditioning), dp (framing/motion).

Sources: [WaveSpeed Seedance consistency](https://wavespeed.ai/blog/posts/blog-character-consistency-seedance-2-0/), [Seedance reference guide](https://magichour.ai/blog/seedance-20-reference-guide), [arXiv visual anchoring](https://arxiv.org/html/2512.16954), [Elser AI anime comparison](https://www.elser.ai/blog/kling-vs-seedance-vs-veo-for-anime-videos), internal pipeline audit 2026-07.

---

## Identity drift

| Cause | Mechanism | Cartoon severity | Fix (ranked) |
|-------|-----------|------------------|--------------|
| **No visual anchor** | T2V or weak start frame → model invents face each clip | **Blocking** | E.5 start frame mandatory; never T2V with cast |
| **Prompt re-describes identity** | Outfit/lighting adjectives leak into face reconstruction | High | PRESERVE line only; 60–100 word motion-only I2V |
| **Conflicting refs** | Multiple expressions/lighting averaged into "midpoint face" | High | Neutral expression on all sheet angles; 3 stills max |
| **Aggressive motion** | Head turn, hair whip, occlusion → identity rebuild | **High for cel** | MWS+ for photographic; motion strength low; one action |
| **Character sheets on video refs** | Seedance filter + ref confusion | Blocking | Cast in start frame only; prop/loc refs on video |
| **Cross-session generation** | Grade/subtle face drift between API sessions | Medium | Style anchor still; same-session batch; shot ledger |
| **Temporal window** | Identity holds ~5–8s then degrades | Low for ads | Keep clips 5–10s; cut in post |

### Identity scrutiny (Phase E)

Freeze frame 1, midpoint, last frame. Compare: eye spacing, jaw angle, hair mass, outline weight. Thumbnail-scale drift = **regenerate video**, not prompt tweak.

---

## Style drift (cartoon look)

| Cause | Mechanism | Fix |
|-------|-----------|-----|
| **FULL look on I2V** | Model re-interprets style mid-clip | PRESERVE abbreviated line only |
| **Photoreal leakage** | Alexa/grain/skin language pulls toward realism | Regex gate + toon-translator block |
| **No style anchor** | Identity holds but saturation/contrast wanders | Approved still as reference role / color script page |
| **Per-shot style re-invention** | Different adjectives per shot | Fixed Character Block + locked palette_id from style_bible |
| **Ink-line temporal flicker** | High motion + thin outlines | Low motion; negative: "no ink outline flicker" |
| **Sheet ≠ storyboard mismatch** | E.5 still doesn't match element sheet line weight | Regenerate storyboard before video |

### Style scrutiny (Phase E)

Compare clip to: style_bible, element sheet, E.5 start frame. Check: line weight, cel step count, palette hue family, outline color. Any photoreal skin pore or lens bokeh = **fail**.

---

## Spatial drift

| Cause | Mechanism | Fix |
|-------|-----------|-----|
| **Spatial camera move on flat art** | Dolly/orbit warps walls and props | One slow move; stability line; prefer held frame |
| **FG invented at video step** | Model hallucinates new foreground | All FG in storyboard FRAME/FG block |
| **Depth_layers missing** | Model treats scene as flat paste | FG/MG/BG in storyboard; parallax_note on push |
| **Multi-action prompt** | Morphing mid-clip between poses | One observable action per generation_prompt |
| **Complex background** | Model spends capacity on env not cast | Simplify BG; calm style anchor |

### Spatial scrutiny (Phase E)

Scrub for: wall line bend, prop scale change, witness object teleport, window direction flip. dp + continuity-supervisor co-sign.

---

## Cross-shot drift (the "different show" problem)

| Cause | Mechanism | Fix |
|-------|-----------|-----|
| **Independent T2V per shot** | No shared anchor | Shared element IDs + per-shot start frames |
| **Shot-type mixing in one batch** | CU then WS changes lighting model | Batch by shot_size family in E |
| **No shot ledger** | Cannot reproduce or compare | Log seed, model, refs, prompt per approved clip |
| **No chain re-anchor** | Drift accumulates across sequence | Last good frame → next start frame (optional) |
| **Storyboard regen skipped** | Video regen when still is wrong | Fix E.5 before E; never "fix in video prompt" |

**Expect 30–50% rejection rate** on first E pass — budget for iteration ([04-multi-layer-consistency-system.md](04-multi-layer-consistency-system.md)).

---

## What element sheets + start frames do NOT solve

- Motion-time reconstruction of unseen angles
- Cross-session grade consistency without style anchor
- Ink-line stability under fast motion
- Logo/typography in motion (composite in post)
- Multi-character identity when 3+ faces compete

**Add when scaling:** style anchor still, color script reference, Character DNA text block, shot ledger, post LUT, LoRA for recurring mascot (10+ variants).

---

## Symptom → action table

| Symptom | Likely cause | First action |
|---------|--------------|--------------|
| Face slowly changes mid-clip | Motion too aggressive | Regenerate with held camera + simpler SCENE |
| Face different shot-to-shot | Weak E.5 or storyboard ≠ sheet | Regenerate E.5; verify referenceElementIds |
| Palette warmer/cooler per shot | No style anchor | Add color script ref; unify grade in post |
| Line weight thicker/thinner | Style drift / photoreal pull | Check PRESERVE line; regen with unstyled handoff |
| Walls breathe during dolly | Spatial warp | Reduce move; add stability line; try shorter clip |
| Seedance refuses generation | Photoreal face filter | Widen to MWS+; Kling 3.0 I2V fallback |
| Everything looks different | Multiple L1 failures | Run full stack audit [04-multi-layer-consistency-system.md](04-multi-layer-consistency-system.md) |
