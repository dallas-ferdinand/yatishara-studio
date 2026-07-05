# Phase 0 — Planning intake

Runs in **`plan` mode only**. Collect everything needed before budget and automated run.

## From user message / uploads

Extract when present:

- Creative intent and product/brand
- Reference images, audio, video
- Duration preference
- Aspect ratio
- Goal (brand affinity vs conversion)

## Required Q&A (ask if missing)

1. **Duration:** 15 / 30 / 60 / 90 / 180 seconds — see [timing-foundation.md](timing-foundation.md) §10
2. **Aspect ratio:** 16:9 / 9:16 / 1:1
3. **Style family:** `toon-prime` | `toon-adult` | `toon-surreal` | `toon-family` | `toon-cgi` | `toon-neon-idol` — see [cartoon-style-families.md](cartoon-style-families.md)
4. **Tone:** `serious_animated` (default) | `lighter` — still not photoreal
5. **Goal:** brand_affinity (Joe) / conversion (Ernesto)
6. **Witness object OR character arc** — which narrative engine
7. **Music in generative clips:** none / underscore
8. **Titles in clips:** yes / no
9. **Max credit budget** (optional ceiling)
10. **Must-match refs** — product photo, logo, pack shot (stylized in sheets, not photoreal)
11. **Reference mood** — describe palette/staging generically; no trademark show names in prompts

## Inference rules

- Product photo upload → default `must_match_refs: true` for hero prop
- Logo upload → register as separate flat-mark asset requirement
- No duration stated → ask; do not assume 60s or 90s
- "Short" / "social" / "bumper" without seconds → default **15s** or **30s**, confirm with user
- Conversion language ("buy", "CTA", "offer") → route Ernesto
- Witness-object language ("memory", "ritual", "object") → route Joe

## Studio actions (orchestrator)

1. `studio_health` — verify key and credit balance
2. `studio_create_folder` — `{slug}-cartoon-ad`
3. `studio_upload_asset` — each user attachment
4. `studio_create_document` — write `planning-intake.md` from [../templates/planning-intake.template.md](../templates/planning-intake.template.md)

## Output

Structured planning packet in project folder. Proceed to Phase 0.5 budget proposal.

Do **not** start Phase A until budget is approved.
