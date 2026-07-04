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
2. **Director merges; specialists build and scrutinize** — see [references/iteration-protocol.md](references/iteration-protocol.md).
3. **Rounds 2–3 rebuild only items with `blocking` conflicts** from prior round.
4. **Auto-advance after bible** — Phase E runs automatically; no mid-pipeline human gates ([references/auto-approval.md](references/auto-approval.md)).
5. **Load specialist SKILL.md** from `specialists/` when executing that role's builder or scrutiny pass.
6. **Visual scrutiny requires viewing** — never approve props or clips from prompt text alone ([references/visual-asset-pipeline.md](references/visual-asset-pipeline.md)).
7. **Reference allocation is mandatory** — orchestrator computes `referenceElementIds[]` per shot from `approved_asset_registry` before director merge; intercut shots include all locations. Phase E uses `referenceElementIds` only — never raw upload refs. See [references/shot-reference-allocation.md](references/shot-reference-allocation.md).
8. **All Studio generation uses direct prompts** — `{ skipPromptEnhancement: true }` plus optional `stylePreset: "story-ad"` or `"realism"`. Do **not** use slug `raw` unless `studio_list_presets` confirms it exists.
9. **Cost ledger** — enforce approved cap before each generate ([references/cost-ledger.md](references/cost-ledger.md)).

## First action

1. Read [references/pipeline.md](references/pipeline.md)
2. Determine mode: `plan` vs `run` (see table above)
3. **Plan:** [references/planning-intake.md](references/planning-intake.md) → [references/budget-proposal.md](references/budget-proposal.md)
4. **Run:** verify `approved_budget_credits` in thread; load planning-intake from Studio folder; **run [references/phase-gates.md](references/phase-gates.md) checklist before any `studio_generate_*`**

### Run mode — mandatory order (no exceptions)

```
budget approved → Phase A (≤3 rounds, Task subagents + director merge) → sign off
               → Phase B (≤3 rounds, 3 parallel builds + scrutiny subagents) → sign off
               → Phase D (style bible w/ seedance look + visual scrutiny) → sign off
               → Phase C (editor first, parallel specialist builds, seedance prompt prefix) → sign off
               → Production Bible → Phase E (ONLY after all gates; film-grain scrutiny per clip)
```

**Orchestrator must launch `Task` subagents** — see [references/phase-gates.md](references/phase-gates.md) and [references/parallel-agents.md](references/parallel-agents.md). Writing packets yourself is forbidden.

**Visual look:** Every shot prompt must follow [references/seedance-cinematic-look.md](references/seedance-cinematic-look.md). No `studio_generate_video` until `style_bible.seedance_cinematic` is set and prompts include the mandatory film-grain prefix.

**If prior run skipped specialists or generated early:** reset `phase_signoffs.A/B/C` to `pending`, clear `approved_clips`, do **not** regenerate until full iteration completes.

## Specialist index

| Role | Path | Phases |
|------|------|--------|
| story-architect | specialists/story-architect/ | A build |
| production-designer | specialists/production-designer/ | A scrutiny, B build |
| character-continuity | specialists/character-continuity/ | A scrutiny, B build |
| location-scout | specialists/location-scout/ | B build |
| dp | specialists/dp/ | B scrutiny, C build |
| gaffer | specialists/gaffer/ | B scrutiny, C build |
| sound-designer | specialists/sound-designer/ | B scrutiny, C build |
| composer | specialists/composer/ | C build, scrutiny |
| editor | specialists/editor/ | C build, scrutiny |
| motion-designer | specialists/motion-designer/ | C build, scrutiny |
| colorist | specialists/colorist/ | C build, scrutiny |
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
4. **MERGE** — director fuses specialist builds + `generation_prompt` + allocated `referenceElementIds[]` + `reference_assets[]` + `reference_element_map` + `emotional_temperature`
5. **SCRUTINIZE** — all Phase C roles on merged shots (dp, gaffer, sound, composer, editor, motion-designer, colorist)
6. Auto-advance

**Output:** `shot_packets[]`

---

## Emit Production Bible (internal artifact — not a gate)

Fill [templates/production-bible.template.md](templates/production-bible.template.md) per [references/production-bible-format.md](references/production-bible-format.md).

Write to Studio folder via `studio_create_document`. **Immediately proceed to Phase E** — no stop.

---

## Phase E — Video generation + visual scrutiny (automatic)

Per shot_packet:

1. **EXECUTE** — `studio_generate_video({ stylePreset: "raw", skipPromptEnhancement: true, ... })`
2. **VISUAL SCRUTINY** — prop-master, dp, style-supervisor — **must view clip**
3. **REVISE** — max 3 rounds per shot
4. **REGISTRY** — `approved_clips[]`

See [references/studio-handoff.md](references/studio-handoff.md).

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

## Downstream

- **Studio MCP:** [references/studio-handoff.md](references/studio-handoff.md)
- **MercuryOS client delivery:** `yatishara-ad-production` skill (optional after run completes)
