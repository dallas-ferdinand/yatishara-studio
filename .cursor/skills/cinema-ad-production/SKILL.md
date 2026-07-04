---
name: cinema-ad-production
description: >-
  Orchestrates fully automated multi-specialist cinema ad production for 60-180
  second ads. Plan mode: planning intake + budget proposal (sole human gate).
  Run mode: automated Phases A→B→D→C→bible→E with visual scrutiny, cost ledger,
  and parallel subagents. Use when Dallas invokes @cinema-ad-production plan|run,
  cinema ad production, production bible, or multi-specialist ad workflow.
  Explicit invocation only.
disable-model-invocation: true
argument-hint: "plan | run {slug}"
---

# Cinema Ad Production — Master Orchestrator

Stage director for the **creative department**. You run phases, iterations, packet handoffs, Studio MCP calls, and cost ledger. You do **not** substitute for specialist skills — load and follow them.

## Invocation modes

| Command | Behavior |
|---------|----------|
| `@cinema-ad-production plan` | Phase 0 + 0.5 only → planning packet + budget proposal → **STOP for approval** |
| `@cinema-ad-production run {slug}` | Requires approved budget in thread → full auto A→B→D→C→bible→E |
| `@cinema-ad-production` (no subcommand) | Infer: missing budget → plan; budget approved → run |

## Golden rules

1. **Never skip iteration rounds** unless Dallas/Shara explicitly says `fast-path` in the same thread after budget approval — see [references/phase-gates.md](references/phase-gates.md). **Orchestrator-drafted packets without specialist passes are forbidden.**
2. **Director merges; specialists build and scrutinize** — see [references/iteration-protocol.md](references/iteration-protocol.md). **Every subagent output must be saved to `generation/iterations/` and appended to `iteration_log` with `subagent_artifact`.** Gates block sign-off without round structure proof.
3. **Rounds 2–3 rebuild only items with `blocking` conflicts** from prior round.
4. **Auto-advance after bible** — Phase E runs automatically; no mid-pipeline human gates ([references/auto-approval.md](references/auto-approval.md)).
5. **Load specialist SKILL.md** from `specialists/` when executing that role's builder or scrutiny pass.
6. **Visual scrutiny requires viewing** — never approve props or clips from prompt text alone ([references/visual-asset-pipeline.md](references/visual-asset-pipeline.md)).
7. **Reference allocation is mandatory** — orchestrator computes `referenceElementIds[]` per shot from `approved_asset_registry` before director merge; intercut shots include all locations. Phase E uses `referenceElementIds` only — never raw upload refs. **People on camera:** storyboard still → `startFrameAssetId` before video ([references/start-frame-workflow.md](references/start-frame-workflow.md), [references/shot-reference-allocation.md](references/shot-reference-allocation.md)). **No `scene` element type.**
8. **All Studio generation uses direct prompts** — `{ skipPromptEnhancement: true, stylePreset: "story-ad" }` (or `"realism"` for sheet-only). Use slug `raw` only for non-cinema ad-hoc tests.
9. **Cost ledger** — enforce approved cap before each generate ([references/cost-ledger.md](references/cost-ledger.md)).
10. **Video: Seedance 2.0 default** — Phase E via `studio_generate_video` with no `videoModel`. Per-shot fallback only: `videoModel: "kling-3.0-i2v"` when Seedance blocks start frames — log in `compromises[]`.
11. **Gate validation** — call `studio_validate_production_gates` before each phase's first `studio_generate_*` ([references/gate-validation.md](references/gate-validation.md)).
12. **Resume** — persist `production-state.json` from [templates/production-state.template.json](templates/production-state.template.json); on interrupt resume per [references/resume-protocol.md](references/resume-protocol.md).

## First action

1. Read [references/pipeline.md](references/pipeline.md)
2. Determine mode: `plan` vs `run` (see table above)
3. **Plan:** [references/planning-intake.md](references/planning-intake.md) → [references/budget-proposal.md](references/budget-proposal.md)
4. **Run:** verify `approved_budget_credits` in thread; load planning-intake from Studio folder; load or create `generation/production-state.json` from [templates/production-state.template.json](templates/production-state.template.json); **run [references/phase-gates.md](references/phase-gates.md) + `studio_validate_production_gates` before any `studio_generate_*`**

### Run mode — mandatory order (no exceptions)

```
budget approved → Phase A (≤3 rounds, Task subagents + director merge) → sign off
               → Phase B (≤3 rounds, 3 parallel builds + scrutiny subagents) → sign off
               → Phase D (style bible w/ seedance look + visual scrutiny) → sign off
               → Phase C (editor first → parallel builds → director merge → seedance-translator + continuity-supervisor scrutiny) → sign off
               → Production Bible → Phase E.5 (start frames when cast on camera) → Phase E video (ONLY after all gates; film-grain scrutiny per clip; Kling fallback per shot if Seedance blocks)
```

**Orchestrator must launch `Task` subagents** — see [references/phase-gates.md](references/phase-gates.md) and [references/parallel-agents.md](references/parallel-agents.md). Writing packets yourself is forbidden.

**Visual look:** Every shot follows [references/seedance-cinematic-look.md](references/seedance-cinematic-look.md) + [references/seedance-translation-foundation.md](references/seedance-translation-foundation.md). **Storyboard** = full frame (FRAME/FG/MG/BG). **generation_prompt** = 60–100 word motion brief (SCENE/CAMERA/SOUND/CONSTRAINTS). No `studio_generate_video` until `style_bible.seedance_cinematic` is set.

**Camera / movement:** Phase C must follow [camera-grammar-for-gen.md](references/camera-grammar-for-gen.md), [depth-and-layering-for-gen.md](references/depth-and-layering-for-gen.md), and [shot-sequence-grammar.md](references/shot-sequence-grammar.md). Editor assigns `camera_intent` + energy curve; DP specifies full `camera` block with `depth_layers`; director merges SCENE + CAMERA blocks into prompts. **One move per shot; layered planes required.**

**If prior run skipped specialists or generated early:** reset `phase_signoffs.A/B/C` to `pending`, clear `approved_clips`, do **not** regenerate until full iteration completes.

## Specialist index

| Role | Path | Phases |
|------|------|--------|
| story-architect | specialists/story-architect/ | A build |
| production-designer | specialists/production-designer/ | A scrutiny, B build |
| character-continuity | specialists/character-continuity/ | A scrutiny, B build, C scrutiny (cast/framing) |
| location-scout | specialists/location-scout/ | B build |
| dp | specialists/dp/ | B scrutiny, C build |
| gaffer | specialists/gaffer/ | B scrutiny, C build |
| sound-designer | specialists/sound-designer/ | B scrutiny, C build |
| composer | specialists/composer/ | C build, scrutiny |
| editor | specialists/editor/ | C build, scrutiny |
| motion-designer | specialists/motion-designer/ | C build, scrutiny |
| colorist | specialists/colorist/ | C build, scrutiny |
| **seedance-translator** | specialists/seedance-translator/ | **C scrutiny** (post-merge prompt QA) |
| **continuity-supervisor** | specialists/continuity-supervisor/ | **C scrutiny** (spatial continuity) |
| prop-master | specialists/prop-master/ | D spec, execute, visual scrutiny |
| style-supervisor | specialists/style-supervisor/ | D bible, cross-asset visual scrutiny, E clip scrutiny |
| director-joe | specialists/director-joe/ | merge all phases (Joe route) |
| director-ernesto | specialists/director-ernesto/ | merge all phases (Ernesto route) |

## Execution checklist

```
Production progress:
- [ ] Phase 0 planning intake complete
- [ ] Phase 0.5 budget proposed
- [ ] Budget approved (sole human gate)
- [ ] Director routed: joe | ernesto
- [ ] Phase A round 1/2/3 → story_packet signed off
- [ ] Phase B round 1/2/3 → world_packet signed off
- [ ] Phase D round 1/2/3 (per prop) → approved_asset_registry
- [ ] style_bible published
- [ ] Phase C round 1/2/3 → shot_packets[] signed off
- [ ] Production Bible emitted to Studio folder
- [ ] Phase E.5 per-shot storyboard stills → `startFrameAssetId` (when cast on camera)
- [ ] Phase E per-shot video gen + visual scrutiny
- [ ] approved_clips complete
- [ ] cost-ledger.json closed
```

---

## Phase 0 — Planning (`plan` mode)

See [references/planning-intake.md](references/planning-intake.md).

1. Collect uploads + creative intent
2. Ask required Q&A if missing
3. `studio_health`, `studio_create_folder` (`{slug}-cinema-ad`)
4. `studio_upload_asset` for each attachment
5. Write `planning-intake.md` via `studio_create_document`

## Phase 0.5 — Budget (`plan` mode, sole human gate)

See [references/budget-proposal.md](references/budget-proposal.md).

1. Draft line items from story skeleton counts
2. `studio_estimate_production` → credits + TT$
3. Write `budget-proposal.md`
4. **STOP.** Wait for `budget approved` / `approve`

---

## Iteration logging (mandatory — all phases)

Before signing off any phase, orchestrator **must** complete the round loop in [references/iteration-protocol.md](references/iteration-protocol.md):

1. Launch Task subagents for BUILD (parallel where specified)
2. Launch director MERGE subagent
3. Launch Task subagents for SCRUTINY (parallel)
4. Append one `iteration_log` entry per step with `round`, `role`, `step`, `subagent_artifact`
5. Append `round_summary` with `blocking_count`
6. Set `phase_signoffs.{phase}.rounds` to final round number
7. Call `studio_validate_production_gates` with `artifactPaths` listing saved iteration files

**Round 2–3:** rebuild only items in `rebuild_scope` from prior `round_summary`.

---

## Phase A — Story (max 3 rounds)

### Round loop

For round = 1 to 3:

1. **BUILD** — `specialists/story-architect/SKILL.md` → `story_packet`
2. **MERGE** — `specialists/director-{joe|ernesto}/SKILL.md`
3. **SCRUTINIZE** — production-designer, character-continuity (parallel)
4. Auto-advance per [references/auto-approval.md](references/auto-approval.md)

**Output:** signed-off `story_packet`

---

## Phase B — World (max 3 rounds)

Launch parallel subagents per [references/parallel-agents.md](references/parallel-agents.md):

1. **BUILD** — production-designer, character-continuity, location-scout
2. **MERGE** — director → `world_packet`
3. **SCRUTINIZE** — dp, gaffer, sound-designer
4. Auto-advance

**Output:** signed-off `world_packet`

---

## Phase D — Visual assets (max 3 rounds per asset)

**After Phase B, before Phase C.** See [references/asset-manifest.md](references/asset-manifest.md) and [references/element-source-modes.md](references/element-source-modes.md).

1. **MANIFEST** — all characters, locations, props with `sourceMode` per row
1b. **MANIFEST AUDIT** — Task subagent per [references/manifest-audit.md](references/manifest-audit.md) → `generation/asset-manifest.json`
2. **STYLE BIBLE** — style-supervisor (seedance cinematic look)
3. **SPEC BUILD** — prop-master per manifest row
4. **EXECUTE** — props first (designed, one sheet each) → characters (designed) → locations (with `referenceElementIds` for props). Tricia = photographic reuse only.
5. **VISUAL SCRUTINY** — Read every sheet; film grain + anti-gloss checks
6. **REGISTRY** — full manifest coverage before Phase C

---

## Phase C — Shotcraft (max 3 rounds)

1. **EDITOR shot list first**
2. **REFERENCE ALLOCATE** — compute `generation/shot-reference-allocation.json` from registry + world_packet ([references/shot-reference-allocation.md](references/shot-reference-allocation.md)) — **before** director merge
3. **BUILD** (parallel Task subagents) — dp, gaffer, sound, composer, editor, motion-designer, colorist
4. **MERGE** — director fuses specialist builds + `generation_prompt` + `storyboard_prompt` (when cast on camera) + allocated `referenceElementIds[]` + `reference_assets[]` + `reference_element_map` + `emotional_temperature`
5. **SCRUTINIZE** — Phase C builders on merged shots + **seedance-translator** (prompt QA) + **continuity-supervisor** (spatial continuity) + character-continuity (cast/framing)
6. Auto-advance

**Output:** `shot_packets[]`

---

## Emit Production Bible (internal artifact — not a gate)

Fill [templates/production-bible.template.md](templates/production-bible.template.md) per [references/production-bible-format.md](references/production-bible-format.md).

Write to Studio folder via `studio_create_document`. **Immediately proceed to Phase E** — no stop.

---

## Phase E — Video generation + visual scrutiny (automatic)

Per shot_packet — follow [references/start-frame-workflow.md](references/start-frame-workflow.md) and [references/studio-handoff.md](references/studio-handoff.md).

**MCP defaults:** `{ skipPromptEnhancement: true, stylePreset: "story-ad" }`. **Never** attach character sheets to video refs — people identity lives in the start frame + prompt text.

### E.5 — Storyboard (start frame) — when cast on camera

1. **GATE** — `storyboard_prompt` present on shot_packet (from Phase C); `referenceElementIds` from allocation
2. **ESTIMATE + EXECUTE** — `studio_generate_image({ prompt: storyboard_prompt, referenceElementIds, stylePreset: "story-ad", skipPromptEnhancement: true, resolution: "2K", aspectRatio, folderId })`
3. **VISUAL SCRUTINY** — prop-master, style-supervisor — **Read** the still (composition, cast, props, grain)
4. Save `assets[0].id` as `shot_packet.startFrameAssetId`

Shots with **no people on camera** skip E.5 — go straight to video with `referenceElementIds` only.

### E — Video

1. **GATE** — when cast on camera, `startFrameAssetId` must be set; prompts pass **seedance-translator** scrutiny ([references/seedance-translation-foundation.md](references/seedance-translation-foundation.md))
2. **ESTIMATE + EXECUTE** — `studio_generate_video({ prompt: generation_prompt, startFrameAssetId, referenceElementIds, stylePreset: "story-ad", skipPromptEnhancement: true, durationSeconds: generation_duration_sec, aspectRatio, folderId })`
3. **WAIT ≥65s** before the next video API call (gateway rate limit)
4. **VISUAL SCRUTINY** — prop-master, dp, style-supervisor — **must view clip**
5. **REVISE** — max 3 rounds per shot (regen storyboard if cast/prop wrong; regen video if motion/style wrong; Kling fallback if Seedance real-person block persists after wide storyboard reframe)
6. **REGISTRY** — `approved_clips[]`; update `production-state.json` `resume` block after each shot

---

## Final deliverable

Studio folder `{slug}-cinema-ad/`:

- `planning-intake.md`, `budget-proposal.md`, `cost-ledger.json`
- `production-bible.md`, `approved-asset-registry.json`, `approved-clips.json`
- Generated assets linked via `studio_folder_contents`

Final message: summary + folder ID + total credits spent + compromises log.

---

## State tracking

```json
{
  "slug": "",
  "director_route": "joe",
  "approved_budget_credits": 0,
  "approved_cap_credits": 0,
  "phase": "A",
  "round": 1,
  "blocking": [],
  "compromises": [],
  "cost_ledger": { "spentCredits": 0, "entries": [] },
  "story_packet": null,
  "world_packet": null,
  "style_bible": null,
  "approved_asset_registry": [],
  "shot_packets": [],
  "approved_clips": []
}
```

---

## References

- [references/pipeline.md](references/pipeline.md)
- [references/planning-intake.md](references/planning-intake.md)
- [references/budget-proposal.md](references/budget-proposal.md)
- [references/auto-approval.md](references/auto-approval.md)
- [references/cost-ledger.md](references/cost-ledger.md)
- [references/parallel-agents.md](references/parallel-agents.md)
- [references/iteration-protocol.md](references/iteration-protocol.md)
- [references/packet-schemas.md](references/packet-schemas.md)
- [references/production-bible-format.md](references/production-bible-format.md)
- [references/studio-handoff.md](references/studio-handoff.md)
- [references/visual-asset-pipeline.md](references/visual-asset-pipeline.md)
- [references/e2e-auto-run.md](references/e2e-auto-run.md)
- [references/phase-gates.md](references/phase-gates.md) — **mandatory before any generation**
- [references/element-source-modes.md](references/element-source-modes.md) — **photographic vs designed — no throwaway plates**
- [references/shot-reference-allocation.md](references/shot-reference-allocation.md) — **mandatory per-shot referenceElementIds before merge**
- [references/research-canon-map.md](references/research-canon-map.md) — **master index: story, attention, direction, staging, sequence, timing, depth, light, sound, color**
- [references/timing-foundation.md](references/timing-foundation.md) — **duration tiers, three clocks, ASL, gen clip math**
- [references/perceptual-foundation.md](references/perceptual-foundation.md) — **cross-channel coherence matrix**
- [references/storytelling-foundation.md](references/storytelling-foundation.md) — **transportation, peak-end, inference, show-don't-tell**
- [references/attention-foundation.md](references/attention-foundation.md) — **gaze, center bias, AToCC cuts, synchrony**
- [references/direction-foundation.md](references/direction-foundation.md) — **blocking, staging, merge operations**
- [references/staging-foundation.md](references/staging-foundation.md) — **environmental storytelling, lived-in sets**
- [references/seedance-translation-foundation.md](references/seedance-translation-foundation.md) — **craft → Seedance I2V prompts (60–100 words)**
- [references/seedance-cinematic-look.md](references/seedance-cinematic-look.md) — **film grain / anti-gloss**
- [references/lighting-foundation.md](references/lighting-foundation.md) — **gaffer: key-fill, face setups, Kelvin**
- [references/sound-foundation.md](references/sound-foundation.md) — **Chion, Murch, Thom, spheres**
- [references/music-foundation.md](references/music-foundation.md) — **composer when scored**
- [references/color-foundation.md](references/color-foundation.md) — **grade psychology**
- [references/depth-and-layering-for-gen.md](references/depth-and-layering-for-gen.md) — **FG/MG/BG layers, parallax, frame devices**
- [references/shot-sequence-grammar.md](references/shot-sequence-grammar.md) — **energy curve, cut contrast, dull-sequence flags**
- [references/gate-validation.md](references/gate-validation.md) — **`studio_validate_production_gates` before generate**
- [references/resume-protocol.md](references/resume-protocol.md) — **interrupt / resume mid Phase E**
- [references/manifest-audit.md](references/manifest-audit.md) — **B→D manifest audit subagent**
- [templates/production-state.template.json](templates/production-state.template.json) — **canonical run state**

## Downstream

- **Studio MCP:** [references/studio-handoff.md](references/studio-handoff.md)
- **MercuryOS client delivery:** `yatishara-ad-production` skill (optional after run completes)
