# E2E automated run — 90s honey-jar ad

Verification scenario for full `plan` → budget approve → `run` pipeline.

## Sample brief

- **Product:** Artisan honey jar (witness object)
- **Duration:** 90s, 16:9
- **Goal:** brand_affinity → director-joe
- **Refs:** Product photo upload (must-match)
- **Music in clips:** none
- **Titles in clips:** no

## Step 1 — Plan

```
@cartoon-ad-production plan
```

Honey jar brand film — grandmother's kitchen, jar as silent witness to morning ritual. [attach product photo]

### Expected

- [ ] Planning Q&A completes (duration, ratio, goal, witness object, music, titles)
- [ ] `studio_create_folder` → `{slug}-cartoon-ad`
- [ ] `planning-intake.md` written to folder
- [ ] `studio_estimate_production` called with prop + shot line items
- [ ] `budget-proposal.md` shows credits **and** TT$
- [ ] Orchestrator **STOPS** — does not start Phase A

## Step 2 — Budget approval

Reply: `budget approved`

### Expected

- [ ] `approved_budget_credits` stored in session
- [ ] No mid-pipeline stops requested

## Step 3 — Run

```
@cartoon-ad-production run honey-jar
```

### Expected — automation

- [ ] **Phase gates** + `studio_validate_production_gates` before each generate phase ([phase-gates.md](phase-gates.md), [gate-validation.md](gate-validation.md))
- [ ] **Iteration proof** — `iteration_log` has per-step entries with `round`, `role`, `subagent_artifact`, and `round_summary.blocking_count === 0` (or round-3 compromise) for A, B, D, C before `studio_generate_*`
- [ ] Manifest audit between B and D ([manifest-audit.md](manifest-audit.md))
- [ ] Phase A→B→D→C→bible→E.5→E with **no human gates** (but **with** full specialist iteration)
- [ ] Orchestrator did **not** draft packets without loading specialist SKILL.md files
- [ ] Phase D uses `studio_generate_element_sheet` for honey jar prop
- [ ] Prop-master **Read**s sheet image (visual scrutiny, not text-only)
- [ ] Production Bible written; Phase E.5 + E start **without** stopping for approval
- [ ] Shots with cast: `storyboard_prompt` on shot_packet → `studio_generate_image` → `startFrameAssetId` before video
- [ ] Video gen uses `{ stylePreset: "unstyled", skipPromptEnhancement: true, startFrameAssetId, referenceElementIds }`
- [ ] Character sheets **not** attached as video image refs
- [ ] ≥65s wait between consecutive `studio_generate_video` calls
- [ ] `cost-ledger.json` tracks spend vs cap
- [ ] Final summary: folder ID, total credits, compromises

## API verification (independent)

| Check | How |
|-------|-----|
| Direct handoff skips enhancement | `POST /generations` with `stylePreset: "unstyled", skipPromptEnhancement: true` → enhanced prompt equals user prompt (no Flash rewrite) |
| Start frame video | `POST /generations` with `startFrameAssetId` + `referenceElementIds` → character sheets excluded from video refs |
| Storyboard image | `POST /generations` mode image with full `referenceElementIds` → all sheets attach |
| Element sheet | `POST /elements/:id/generate-sheet` → gray bg sheet, `creditsSpent` returned |
| Batch estimate | `POST /generations/estimate-batch` → `totalTTD = totalCredits × 0.5` |
| MCP tools | `studio_estimate_production`, `studio_generate_element_sheet` respond |

## Acceptance criteria

1. `plan` stops at budget only
2. `run` completes A–E without mid-pipeline pause
3. Ledger enforces cap (skips optional or reports partial if exceeded)
4. Deliverables in `{slug}-cartoon-ad/`: planning-intake, budget-proposal, cost-ledger, production-bible, approved-asset-registry, approved-clips
5. Parallel subagents return valid packets; orchestrator merges correctly

## Out of scope (this test)

- Final NLE edit / MercuryOS client delivery
- Live credit spend (use staging key or dry-run estimate checks if balance insufficient)
