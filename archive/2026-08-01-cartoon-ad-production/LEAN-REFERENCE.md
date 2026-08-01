# Cartoon ad production — lean reference (archived 2026-08-01)

**Status:** RETIRED. Do not run `@cartoon-ad-production plan|run` as an active skill.

**Why archived:** Same multi-specialist Task fan-out as MercuryOS cinema — too many concurrent roles to tell what worked. Kept as rebuild inventory.

**Live path instead:** Studio **Assistance** (brief → review → generate) + direct MCP gen (`studio_generate_image` / `studio_generate_video`). Optional preflight: `studio_validate_production_gates`. Photoreal client delivery stays on MercuryOS `yatishara-ad-production` + Higgsfield.

## What this was

Studio MCP variant of cinema: plan → budget → Phases **A→B→D→C→bible→E.5→E**, Task subagents, style_family / toon look, direct prompt handoff (`skipPromptEnhancement`). Gen via Studio elements + start frames.

## Phase order (worth keeping)

```
budget approved → A story → B world → D assets → C shotcraft → bible → E.5 start frames → E video
```

Sole human gate in design: **budget**. People: storyboard → `startFrameAssetId` → video. No `scene` element type. Direct handoff for cartoon prompts.

## Specialist roster (one line each)

| Role | Job |
|------|-----|
| story-architect | Phase A story_packet |
| production-designer | A scrutiny / B world |
| character-continuity | A/B cast; C framing scrutiny |
| location-scout | B locations |
| dp | B scrutiny / C staging + depth |
| gaffer | B scrutiny / C cel lighting |
| sound-designer | B scrutiny / C audio |
| composer | C score |
| editor | C order, energy, camera_intent |
| motion-designer | C titles / kinetic |
| colorist | C palette registers |
| toon-translator | C post-merge cartoon prompt QA |
| continuity-supervisor | C spatial continuity |
| prop-master | D prop sheets + visual scrutiny |
| style-supervisor | D style bible + E clip scrutiny |
| director-joe | Merge (Joe route) |
| director-ernesto | Merge (Ernesto route) |

## Mine later (deep tree)

Full snapshot next to this file (`SKILL.md`, `specialists/`, `references/`, `templates/`).

| Topic | Path |
|-------|------|
| Pipeline | `references/pipeline.md` |
| Gates | `references/phase-gates.md` |
| Direct handoff | `references/direct-prompt-handoff.md` |
| Start frames | `references/start-frame-workflow.md` |
| Cartoon staging | `references/cartoon-staging-foundation.md` |
| Gate tool (still live MCP) | `studio_validate_production_gates` in Studio MCP |

## Rebuild rule

Prefer Assistance + a few sharp prompt cards over reloading 17 specialists. Pull only needed docs from the deep tree.
