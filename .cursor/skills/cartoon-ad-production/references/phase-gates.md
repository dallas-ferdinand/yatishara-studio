# Phase gates — HARD (never skip)

Orchestrator **must not** call any `studio_generate_image`, `studio_generate_element_sheet`, `studio_generate_video`, or `studio_generate_script` until **every gate below passes** and **`studio_validate_production_gates` returns `canProceed: true`** ([gate-validation.md](gate-validation.md)).

Uploads during Phase 0 (`studio_upload_asset`) are allowed before gates.

## Gate checklist (run mode)

Before **Phase D** execute:

| Gate | Required evidence in `production-state.json` |
|------|---------------------------------------------|
| G0 | `budget_approved: true` |
| G-A | `phase_signoffs.A.status` ∈ `signed_off_clean` \| `signed_off_with_compromises` |
| G-B | `phase_signoffs.B.status` ∈ `signed_off_clean` \| `signed_off_with_compromises` |
| G-A proof | `iteration_log.A` has ≥1 round with `story-architect` build + `director-*` merge + scrutiny from `production-designer` + `character-continuity`; `peak_beat` + `end_anchor` on story_packet per [storytelling-foundation.md](storytelling-foundation.md) |
| G-B proof | `iteration_log.B` has ≥1 round with parallel builds (`production-designer`, `character-continuity`, `location-scout`) + director merge + scrutiny from `dp`, `gaffer`, `sound-designer` |
| G-manifest-audit | `generation/iterations/manifest-audit.json` with `approve: true` and zero blocking gaps ([manifest-audit.md](manifest-audit.md)) |
| G-manifest | `generation/asset-manifest.json` exists with **all** on-camera characters, distinct locations, hero + recurring props |
| G-manifest audit | Manifest includes parent/patient + any second cast — not only lead character |

Before **Phase C** execute:

| Gate | Required evidence |
|------|-------------------|
| G-D | `phase_signoffs.D.status` signed off + `approved_asset_registry[]` non-empty |
| G-D coverage | Registry has built sheets for **every** manifest row marked `sheet_required: true` |
| G-D visual | Each registry entry has `visual_scrutiny.approve: true` and `viewed: true` from prop-master + style-supervisor; locations also location-scout; characters also character-continuity |
| G-D style | Each scrutiny includes `style_checks` (line consistency, palette lock, flat cel shading, no photoreal drift) — not image sharpness alone |

Before **Phase C** director merge:

| Gate | Required evidence |
|------|-------------------|
| G-ref | `generation/shot-reference-allocation.json` exists; every shot has `referenceElementIds` + `reference_element_map` |
| G-ref audit | Intercut shots include **all** location element IDs; no on-camera character missing |

Before **Phase E** execute:

| Gate | Required evidence |
|------|-------------------|
| G-C | `phase_signoffs.C.status` signed off |
| G-C proof | `iteration_log.C` has editor shot list **first**, `shot-reference-allocation.json`, parallel Phase C specialist builds (dp, gaffer, sound, composer, motion-designer, colorist), director merge, scrutiny from **all** Phase C builders + **toon-translator** + **continuity-supervisor** |
| G-C storyboard | Every shot with cast on camera has non-empty `storyboard_prompt` on shot_packet |
| G-C camera | Every shot_packet has expanded `camera` block per [camera-grammar-for-gen.md](camera-grammar-for-gen.md): `depth_layers`, `layer_device`, spatial moves default; **no zoom**; `rhythm_pattern: settle-travel-breathe` when move ≠ locked |
| G-C sequence | Editor `camera_intent` includes energy + contrast; ≥3 move families across 4+ shots; Kuleshov pairs documented |
| G-C perceptual | Cross-channel coherence per [perceptual-foundation.md](perceptual-foundation.md) §8; `research_refs` on temperature/light/sound blocks; gaffer cites [lighting-foundation.md](lighting-foundation.md); sound cites [sound-foundation.md](sound-foundation.md) |
| G-C translation | `toon-translator` scrutiny pass with zero blocking; prompts per [cartoon-translation-foundation.md](cartoon-translation-foundation.md) |
| G-C continuity | `continuity-supervisor` scrutiny pass with zero blocking spatial conflicts |
| G-bible | `production_bible.document_id` or Studio doc `production-bible` exists |

Before **Phase E video** per shot (after E.5 when required):

| Gate | Required evidence |
|------|-------------------|
| G-E5 | When `cast_on_camera: true`: `startFrameAssetId` set; start frame passed visual scrutiny (`viewed: true`, prop-master + style-supervisor) |
| G-E5 skip | When no cast on camera: E.5 may be skipped; video uses `referenceElementIds` only |

## Forbidden orchestrator shortcuts

**STOP and do not proceed** if you catch yourself doing any of these:

1. Drafting `story_packet`, `world_packet`, or `shot_packets[]` **yourself** — specialists must produce packets via **Task subagents** (see below)
2. Writing `iteration_log` entries without matching subagent JSON outputs saved to `{project}/generation/iterations/`
3. Calling `studio_generate_element_sheet`, `studio_generate_image` (E.5), or `studio_generate_video` before gates G-A, G-B, G-C, G-bible pass
4. Calling `studio_generate_video` when cast on camera but `startFrameAssetId` is missing — run E.5 storyboard first
5. Attaching character element sheets as video image refs — use start frame instead ([start-frame-workflow.md](start-frame-workflow.md))
6. Skipping scrutiny — every phase needs parallel scrutiny subagents where [parallel-agents.md](parallel-agents.md) specifies
7. Marking a phase signed off without director merge after real specialist builds
8. Inferring visual approval from prompt text — **Read** sheet images, start frames, and clips
9. Omitting [cartoon-translation-foundation.md](cartoon-translation-foundation.md) structure from shot prompts (vague prose, >100 words, full look prefix on I2V)

## Parallel subagents — MANDATORY (not optional)

Orchestrator **must** launch `Task` subagents per [parallel-agents.md](parallel-agents.md). Self-performing specialist roles in one turn **counts as a gate failure**.

| Phase | Launch (parallel where noted) | Save output to |
|-------|--------------------------------|----------------|
| A round N | `story-architect` build → director merge → **parallel** `production-designer` + `character-continuity` scrutiny | `generation/iterations/A-r{N}-*.json` |
| B round N | **parallel** `production-designer`, `character-continuity`, `location-scout` build → director merge → **parallel** `dp`, `gaffer`, `sound-designer` scrutiny | `generation/iterations/B-r{N}-*.json` |
| D | `style-supervisor` bible (include seedance look) → prop-master → visual scrutiny subagents | `generation/iterations/D-r{N}-*.json` |
| C round N | `editor` shot list **first** → **parallel** dp, gaffer, sound, composer, motion-designer, colorist → director merge → **parallel** scrutiny (builders + toon-translator + continuity-supervisor + character-continuity) | `generation/iterations/C-r{N}-*.json` |
| E.5 | Sequential storyboard still per shot w/ cast; visual scrutiny before video | `generation/iterations/E5-r{N}-{shot_id}.json` |
| E | Sequential video gen (≥65s between calls); **parallel** prop-master + dp + style-supervisor visual scrutiny per clip | `generation/iterations/E-r{N}-*.json` |

**Evidence:** `iteration_log` entries must include `subagent_artifact: "generation/iterations/…"` path. No artifact file → phase not signed off.

## Fast-path

Only when **Dallas or Shara** writes `fast-path` in the **same thread** after budget approval. Log in `compromises[]`:

```json
{ "type": "fast_path", "skipped": ["A","B","C"], "reason": "explicit user request", "at": "ISO8601" }
```

Without that exact keyword, **full iteration is mandatory**.

## Run mode entry procedure

On `@cartoon-ad-production run {slug}`:

1. Load or create `{project}/generation/production-state.json` from [../templates/production-state.template.json](../templates/production-state.template.json)
2. If `phase_signoffs` missing or any of A/B/C unsigned → **start at Phase A round 1** (not Phase D/E)
3. If Phase D assets already exist but A/B/C unsigned → **do not reuse for Phase E**; complete A→B→C first, then register existing sheets only after D visual scrutiny passes
4. If `resume.e_completed_shot_ids` partial → follow [resume-protocol.md](resume-protocol.md)
5. Call `studio_validate_production_gates` — print gate status table before first `studio_generate_*` in each phase

## State schema extension

```json
{
  "budget_approved": true,
  "phase_signoffs": {
    "A": { "status": "pending", "rounds": 0, "director_statement": null },
    "B": { "status": "pending", "rounds": 0, "director_statement": null },
    "D": { "status": "pending", "rounds": 0, "director_statement": null },
    "C": { "status": "pending", "rounds": 0, "director_statement": null }
  },
  "iteration_log": { "A": [], "B": [], "D": [], "C": [], "E5": [], "E": [] },
  "iteration": { "active_phase": null, "active_round": 0, "blocking_conflicts": [], "last_step": null },
  "production_bible": { "document_id": null, "emitted_at": null },
  "resume": {
    "last_completed_phase": null,
    "e5_completed_shot_ids": [],
    "e_completed_shot_ids": [],
    "interrupted_at": null
  }
}
```
