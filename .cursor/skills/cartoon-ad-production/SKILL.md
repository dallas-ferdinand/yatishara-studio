---
name: cartoon-ad-production
description: >-
  Orchestrates fully automated multi-specialist cartoon animated ad production
  for 60-180 second ads. Plan mode: planning intake + budget proposal (sole
  human gate). Run mode: automated Phases A→B→D→C→bible→E with visual scrutiny,
  cost ledger, and parallel subagents. Use when Dallas invokes
  @cartoon-ad-production plan|run, cartoon ad production, production bible, or
  multi-specialist animated ad workflow. Explicit invocation only.
disable-model-invocation: true
argument-hint: "plan | run {slug}"
---

# Cartoon Ad Production — Master Orchestrator

Stage director for the **creative department**. You run phases, iterations, packet handoffs, Studio MCP calls, and cost ledger. You do **not** substitute for specialist skills — load and follow them.

**Studio uses Style Sheet elements for styled generation** — create a Style Sheet (visual rules + optional style board), select it in the composer, or pass `styleSheetElementId` on MCP/API. **Direct** mode (`skipPromptEnhancement: true`, no sheet) sends prompts verbatim. Cartoon element sheets still use `stylePresetSlug: unstyled` on `studio_generate_element_sheet`.

## Invocation modes

| Command | Behavior |
|---------|----------|
| `@cartoon-ad-production plan` | Phase 0 + 0.5 only → planning packet + budget proposal → **STOP for approval** |
| `@cartoon-ad-production run {slug}` | Requires approved budget in thread → full auto A→B→D→C→bible→E |
| `@cartoon-ad-production` (no subcommand) | Infer: missing budget → plan; budget approved → run |

## Golden rules

1. **Never skip iteration rounds** unless Dallas/Shara explicitly says `fast-path` in the same thread after budget approval — see [references/phase-gates.md](references/phase-gates.md). **Orchestrator-drafted packets without specialist passes are forbidden.**
2. **Director merges; specialists build and scrutinize** — see [references/iteration-protocol.md](references/iteration-protocol.md). **Every subagent output must be saved to `generation/iterations/` and appended to `iteration_log` with `subagent_artifact`.** Gates block sign-off without round structure proof.
3. **Rounds 2–3 rebuild only items with `blocking` conflicts** from prior round.
4. **Auto-advance after bible** — Phase E runs automatically; no mid-pipeline human gates ([references/auto-approval.md](references/auto-approval.md)).
5. **Load specialist SKILL.md** from `specialists/` when executing that role's builder or scrutiny pass.
6. **Visual scrutiny requires viewing** — never approve props or clips from prompt text alone ([references/visual-asset-pipeline.md](references/visual-asset-pipeline.md)).
7. **Reference allocation is mandatory** — orchestrator computes `referenceElementIds[]` per shot from `approved_asset_registry` before director merge; intercut shots include all locations. Phase E uses `referenceElementIds` only — never raw upload refs. **People on camera:** storyboard still → `startFrameAssetId` before video ([references/start-frame-workflow.md](references/start-frame-workflow.md), [references/shot-reference-allocation.md](references/shot-reference-allocation.md)). **No `scene` element type.**
8. **All Studio shot generation uses direct prompts by default** — `{ skipPromptEnhancement: true }` on every `studio_generate_image` and `studio_generate_video` ([references/direct-prompt-handoff.md](references/direct-prompt-handoff.md)). **No Flash/GPT rewrite** unless you pass `styleSheetElementId` with `skipPromptEnhancement: false`. Pass `stylePresetSlug: unstyled` on `studio_generate_element_sheet`. Legacy `toon-*` stylePreset slugs are deprecated (410).
9. **Cost ledger** — enforce approved cap before each generate ([references/cost-ledger.md](references/cost-ledger.md)).
10. **Video model choice** — Studio UI default is Seedance 2.0. MCP: omit `videoModel` for Seedance, or pass `videoModel: "kling-3.0-i2v"` when production chooses Kling (start-frame I2V, faces). Call `studio_list_video_models` first; pass same slug on estimate + generate; log choice in `production-state.json` overrides. Verify `resolvedModel` on poll. **Kling:** gateway 2500-char cap — never shorten signed `generation_prompt`; iterate shot prose or regen per [references/kling-prompt-length.md](references/kling-prompt-length.md).
11. **Gate validation** — call `studio_validate_production_gates` before each phase's first `studio_generate_*` ([references/gate-validation.md](references/gate-validation.md)).
12. **Resume** — persist `production-state.json` from [templates/production-state.template.json](templates/production-state.template.json); on interrupt resume per [references/resume-protocol.md](references/resume-protocol.md).
13. **Anti-photoreal drift** — block Alexa/grain/documentary language in all prompts; cartoon look prefix mandatory on storyboards ([references/cartoon-look-foundation.md](references/cartoon-look-foundation.md)).
14. **Consistency is seven layers** — not one fix. Before blaming Seedance, audit [references/research-rounds/04-multi-layer-consistency-system.md](references/research-rounds/04-multi-layer-consistency-system.md). Expect 30–50% E rejection on first pass — budget for it.
15. **Seedance stays default** — do not wholesale-switch to Kling. Kling only per [references/research-rounds/02-model-routing-matrix.md](references/research-rounds/02-model-routing-matrix.md) (filter block, face-forward, 6-shot dialogue). Fix pipeline layers first.
16. **Framing is gated** — every cast storyboard needs `FRAME:` with shot_size, head room, lead room per [references/research-rounds/03-framing-proportions-field-guides.md](references/research-rounds/03-framing-proportions-field-guides.md). photographic cast: MWS+ only.

## First action

1. Read [references/pipeline.md](references/pipeline.md) and [references/direct-prompt-handoff.md](references/direct-prompt-handoff.md)
2. On consistency complaints: read [references/research-rounds/00-research-methodology.md](references/research-rounds/00-research-methodology.md) then [04-multi-layer-consistency-system.md](references/research-rounds/04-multi-layer-consistency-system.md)
3. Determine mode: `plan` vs `run` (see table above)
3. **Plan:** [references/planning-intake.md](references/planning-intake.md) → [references/budget-proposal.md](references/budget-proposal.md)
4. **Run:** verify `approved_budget_credits` in thread; load planning-intake from Studio folder; load or create `generation/production-state.json` from [templates/production-state.template.json](templates/production-state.template.json); **run [references/phase-gates.md](references/phase-gates.md) + `studio_validate_production_gates` before any `studio_generate_*`**

### Run mode — mandatory order (no exceptions)

```
budget approved → Phase A (≤3 rounds, Task subagents + director merge) → sign off
               → Phase B (≤3 rounds, 3 parallel builds + scrutiny subagents) → sign off
               → Phase D (style bible w/ cartoon look + visual scrutiny) → sign off
               → Phase C (editor first → parallel builds → director merge → toon-translator + continuity-supervisor scrutiny) → sign off
               → Production Bible → Phase E.5 (start frames when cast on camera) → Phase E video (ONLY after all gates; cartoon style scrutiny per clip; Kling fallback per shot if Seedance blocks)
```

**Orchestrator must launch `Task` subagents** — see [references/phase-gates.md](references/phase-gates.md) and [references/parallel-agents.md](references/parallel-agents.md). Writing packets yourself is forbidden.

**Visual look:** Every shot follows [references/cartoon-look-foundation.md](references/cartoon-look-foundation.md) + [references/cartoon-translation-foundation.md](references/cartoon-translation-foundation.md). **Storyboard** = full frame (FRAME/FG/MG/BG) + FULL cartoon look prefix. **generation_prompt** = 60–100 word motion brief (SCENE/CAMERA/SOUND/CONSTRAINTS) + PRESERVE line only. No `studio_generate_video` until `style_bible.style_family` is set.

**Camera / movement:** Phase C must follow [cartoon-staging-foundation.md](references/cartoon-staging-foundation.md), [2d-depth-illusion-foundation.md](references/2d-depth-illusion-foundation.md), [camera-grammar-for-gen.md](references/camera-grammar-for-gen.md), [depth-and-layering-for-gen.md](references/depth-and-layering-for-gen.md), and [shot-sequence-grammar.md](references/shot-sequence-grammar.md). Editor assigns `camera_intent` + energy curve; DP specifies full `camera` block with `depth_layers`; director merges SCENE + CAMERA blocks into prompts. **One move per shot; layered planes required.**

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
| **toon-translator** | specialists/toon-translator/ | **C scrutiny** (post-merge prompt QA) |
| **continuity-supervisor** | specialists/continuity-supervisor/ | **C scrutiny** (spatial continuity) |
| prop-master | specialists/prop-master/ | D spec, execute, visual scrutiny |
| style-supervisor | specialists/style-supervisor/ | D bible, cross-asset visual scrutiny, E clip scrutiny |
| director-joe | specialists/director-joe/ | merge all phases (Joe route) |
| director-ernesto | specialists/director-ernesto/ | merge all phases (Ernesto route) |

## Execution checklist

```
Production progress:
- [ ] Phase 0 planning intake complete (style_family chosen)
- [ ] Phase 0.5 budget proposed
- [ ] Budget approved (sole human gate)
- [ ] Director routed: joe | ernesto
- [ ] Phase A round 1/2/3 → story_packet signed off
- [ ] Phase B round 1/2/3 → world_packet signed off
- [ ] Phase D round 1/2/3 (per prop) → approved_asset_registry
- [ ] style_bible published (cartoon fields)
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
2. Ask required Q&A if missing — **including style_family** (`toon-prime` | `toon-adult` | `toon-surreal` | `toon-family` | `toon-cgi` | `toon-neon-idol`)
3. `studio_health`, `studio_create_folder` (`{slug}-cartoon-ad`)
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

1. **MANIFEST** — all characters, locations, props with `sourceMode` per row (default `designed` for cartoon cast)
1b. **MANIFEST AUDIT** — Task subagent per [references/manifest-audit.md](references/manifest-audit.md) → `generation/asset-manifest.json`
2. **STYLE BIBLE** — style-supervisor (cartoon look + style_family)
3. **SPEC BUILD** — prop-master per manifest row
4. **EXECUTE** — props first (designed, one sheet each, `stylePresetSlug` from bible) → characters (designed) → locations (with `referenceElementIds` for props)
5. **VISUAL SCRUTINY** — Read every sheet; line/palette/shading lock + **anti-photoreal** checks
6. **REGISTRY** — full manifest coverage before Phase C

---

## Phase C — Shotcraft (max 3 rounds)

1. **EDITOR shot list first**
2. **REFERENCE ALLOCATE** — compute `generation/shot-reference-allocation.json` from registry + world_packet ([references/shot-reference-allocation.md](references/shot-reference-allocation.md)) — **before** director merge
3. **BUILD** (parallel Task subagents) — dp, gaffer, sound, composer, editor, motion-designer, colorist
4. **MERGE** — director fuses specialist builds + `generation_prompt` + `storyboard_prompt` (when cast on camera) + allocated `referenceElementIds[]` + `reference_assets[]` + `reference_element_map` + `emotional_temperature`
5. **SCRUTINIZE** — Phase C builders on merged shots + **toon-translator** (prompt QA) + **continuity-supervisor** (spatial continuity) + character-continuity (cast/framing)
6. Auto-advance

**Output:** `shot_packets[]`

---

## Emit Production Bible (internal artifact — not a gate)

Fill [templates/production-bible.template.md](templates/production-bible.template.md) per [references/production-bible-format.md](references/production-bible-format.md).

Write to Studio folder via `studio_create_document`. **Immediately proceed to Phase E** — no stop.

---

## Phase E — Video generation + visual scrutiny (automatic)

Per shot_packet — follow [references/start-frame-workflow.md](references/start-frame-workflow.md) and [references/studio-handoff.md](references/studio-handoff.md).

**MCP defaults:** `{ skipPromptEnhancement: true, stylePreset: "unstyled" }` — see [references/direct-prompt-handoff.md](references/direct-prompt-handoff.md). Pass `stylePresetSlug: style_family` on element sheets only.

### E.5 — Storyboard (start frame) — when cast on camera

1. **GATE** — `storyboard_prompt` present on shot_packet (from Phase C); `referenceElementIds` from allocation
2. **ESTIMATE + EXECUTE** — `studio_generate_image({ prompt: storyboard_prompt, referenceElementIds, stylePreset: "unstyled", skipPromptEnhancement: true, resolution: "2K", aspectRatio, folderId })`
3. **VISUAL SCRUTINY** — prop-master, style-supervisor — **Read** the still (composition, cast, props, line/palette lock)
4. Save `assets[0].id` as `shot_packet.startFrameAssetId`

Shots with **no people on camera** skip E.5 — go straight to video with `referenceElementIds` only.

### E — Video

1. **GATE** — when cast on camera, `startFrameAssetId` must be set; prompts pass **toon-translator** scrutiny ([references/cartoon-translation-foundation.md](references/cartoon-translation-foundation.md))
2. **ESTIMATE + EXECUTE** — `studio_generate_video({ prompt: generation_prompt, startFrameAssetId, referenceElementIds, stylePreset: "unstyled", skipPromptEnhancement: true, durationSeconds: generation_duration_sec, aspectRatio, folderId })`
3. **WAIT ≥65s** before the next video API call (gateway rate limit)
4. **VISUAL SCRUTINY** — prop-master, dp, style-supervisor — **must view clip**; block photoreal drift
5. **REVISE** — max 3 rounds per shot (regen storyboard if cast/prop wrong; regen video if motion/style wrong; Kling fallback if model blocks persist)
6. **REGISTRY** — `approved_clips[]`; update `production-state.json` `resume` block after each shot

---

## Final deliverable

Studio folder `{slug}-cartoon-ad/`:

- `planning-intake.md`, `budget-proposal.md`, `cost-ledger.json`
- `production-bible.md`, `approved-asset-registry.json`, `approved-clips.json`
- Generated assets linked via `studio_folder_contents`

Final message: summary + folder ID + total credits spent + compromises log.

---

## State tracking

```json
{
  "slug": "",
  "style_family": "toon-prime",
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
- [references/element-source-modes.md](references/element-source-modes.md) — **designed default for cartoon cast**
- [references/shot-reference-allocation.md](references/shot-reference-allocation.md) — **mandatory per-shot referenceElementIds before merge**
- [references/research-canon-map.md](references/research-canon-map.md) — **master index**
- [references/timing-foundation.md](references/timing-foundation.md)
- [references/micro-pacing-foundation.md](references/micro-pacing-foundation.md)
- [references/cartoon-look-foundation.md](references/cartoon-look-foundation.md) — **line, palette, shading, expression**
- [references/cartoon-style-families.md](references/cartoon-style-families.md) — **preset taxonomy**
- [references/cartoon-translation-foundation.md](references/cartoon-translation-foundation.md) — **FULL vs PRESERVE I2V**
- [references/cartoon-lighting-foundation.md](references/cartoon-lighting-foundation.md)
- [references/cartoon-color-foundation.md](references/cartoon-color-foundation.md)
- [references/cartoon-staging-foundation.md](references/cartoon-staging-foundation.md)
- [references/cartoon-motion-foundation.md](references/cartoon-motion-foundation.md)
- [references/storytelling-foundation.md](references/storytelling-foundation.md) — **witness-object in stylized worlds**
- [references/gate-validation.md](references/gate-validation.md)
- [references/resume-protocol.md](references/resume-protocol.md)
- [references/manifest-audit.md](references/manifest-audit.md)
- [templates/production-state.template.json](templates/production-state.template.json)

## Downstream

- **Studio MCP:** [references/studio-handoff.md](references/studio-handoff.md)
- **MercuryOS client delivery:** `yatishara-ad-production` skill (optional after run completes)
