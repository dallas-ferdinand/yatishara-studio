# Pipeline — Phase diagram and gates

## Overview

Cinema ad production mimics real film workflow: parallel department builds → director merge → cross-department scrutiny → iterate (max 3 rounds per phase).

Target output: **Production Bible** + **approved clips** for 60–180 second ads. Fully automated after upfront budget approval.

## Phases

| Phase | Name | Active specialists | Director | Scrutiny panel | Output |
|-------|------|-------------------|----------|----------------|--------|
| 0 | Planning | orchestrator | — | — | planning-intake.md |
| 0.5 | Budget | orchestrator | — | **Dallas/Shara** | budget-proposal.md |
| A | Story | story-architect | director-joe or director-ernesto | production-designer, character-continuity | `story_packet` |
| B | World | production-designer, character-continuity, location-scout | director | dp, gaffer, sound-designer | `world_packet` |
| D | Visual assets | prop-master, style-supervisor | director | prop-master visual, style-supervisor | `approved_asset_registry[]` |
| C | Shotcraft | editor (first), dp, gaffer, sound-designer, composer, motion-designer, colorist | director | Phase C builders + character-continuity + **seedance-translator** + **continuity-supervisor** | `shot_packets[]` (+ `storyboard_prompt` when cast on camera) |
| E.5 | Start frames | orchestrator (Studio MCP) | — | prop-master, style-supervisor visual | `startFrameAssetId` per shot (when cast on camera) |
| E | Video gen + review | orchestrator (Studio MCP) | director | prop-master, dp, style-supervisor visual | `approved_clips[]` |

## Human gates

| Gate | When | What human verifies |
|------|------|---------------------|
| Budget | After Phase 0.5 | Credits + TT$ total; reply `budget approved` |
| *(none mid-pipeline)* | — | Auto-advance per [auto-approval.md](auto-approval.md) |

## Director routing (once at intake)

| Brief goal | Director |
|------------|----------|
| Brand affinity, memory, witness object | director-joe |
| Character transformation, conversion, relief | director-ernesto |

See [ernesto-routing.md](ernesto-routing.md).

## Scale targets

| Duration | Scenes | Shots |
|----------|--------|-------|
| 15s | 1 | 3–5 |
| 30s | 1–2 | 5–7 |
| 60s | 3–4 | 8–12 |
| 90s | 4–6 | 10–18 |
| 180s | 6–8 | 16–24 |

See [timing-foundation.md](timing-foundation.md) for ASL, gen clip math, peak-end positions.

## Automated run flow

```
plan → Phase 0 (uploads, Q&A) → Phase 0.5 budget → [HUMAN APPROVE]
run → Phase A (×3) → story_packet
    → Phase B (×3) → world_packet
    → Manifest audit → asset-manifest.json
    → Phase D (×3) → element sheets → visual scrutiny → approved_asset_registry
    → Phase C (×3) → shot_packets[] (reference approved assets + storyboard_prompt when cast on camera)
    → Production Bible (internal) → Phase E.5 (×3 per shot w/ cast) → startFrameAssetId
    → Phase E (×3 per shot) → approved_clips
    → cost ledger close + summary
```

## Invocation

| Command | Stops at |
|---------|----------|
| `@cinema-ad-production plan` | Budget approval |
| `@cinema-ad-production run {slug}` | Final summary only |

Emotional temperature: [emotional-temperature.md](emotional-temperature.md)

Visual asset loop: [visual-asset-pipeline.md](visual-asset-pipeline.md)

Start frames (people on camera): [start-frame-workflow.md](start-frame-workflow.md)

Parallel agents: [parallel-agents.md](parallel-agents.md)

Cost ledger: [cost-ledger.md](cost-ledger.md)

## Downstream systems

- **Studio MCP** — generation, element sheets, documents ([studio-handoff.md](studio-handoff.md))
- **MercuryOS yatishara-ad-production** — optional client delivery after run completes
