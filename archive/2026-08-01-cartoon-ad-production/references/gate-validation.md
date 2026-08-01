# Gate validation — mechanical pre-flight

Orchestrator **must** call `studio_validate_production_gates` before the first `studio_generate_*` in each phase and before each Phase E / E.5 batch.

Honour-system gates are not sufficient. This tool returns `canProceed: false` with explicit blockers.

## When to call

| Target phase | Call before |
|--------------|-------------|
| `D` | Any `studio_generate_element_sheet` |
| `C` | Director merge only (no generate) — optional validate `ref_allocation` |
| `E5` | `studio_generate_image` storyboard for a shot |
| `E` | `studio_generate_video` for a shot |
| `generate` | Any generate when unsure of state |

## MCP call

```
studio_validate_production_gates({
  targetPhase: "D",
  productionState: { ...contents of production-state.json... },
  artifactPaths: [
    "generation/iterations/A-r1-story-architect.json",
    "generation/iterations/B-r1-production-designer.json"
  ],
  shotId: "S01"
})
```

- `productionState` — full JSON object (orchestrator reads file and passes body)
- `artifactPaths` — **recommended every call** — list saved `generation/iterations/*.json` paths; enables strict `subagent_artifact` enforcement
- `shotId` — required for `E5` and `E` per-shot gates

## Response

```json
{
  "canProceed": false,
  "targetPhase": "D",
  "blockers": ["phase_signoffs.B.status is pending — need signed_off_clean or signed_off_with_compromises"],
  "warnings": ["iteration_log.D is empty — scrutiny evidence may be missing after Phase D"],
  "gatesPassed": ["G0"]
}
```

**If `canProceed` is false — STOP.** Do not call `studio_generate_*`. Fix blockers first.

## Rules implemented (mirror phase-gates.md)

- G0: `budget_approved`
- G-A / G-B / G-D / G-C: phase signoffs + **iteration proof** per [iteration-protocol.md](iteration-protocol.md):
  - Each signed-off phase: build roles + director merge (except D) + scrutiny roles present in final round
  - Every step entry has `round`, `role`, `subagent_artifact`
  - Final round has `round_summary` with `blocking_count === 0` for `signed_off_clean`
  - Phase C round 1 requires `editor` build first
- G-manifest: implied before D when `asset-manifest` checked in state extensions
- G-D: registry non-empty, visual scrutiny viewed
- G-C: C signed off, storyboard_prompt when cast on camera
- G-C seedance translation: `generation_prompt` ≤100 words, `SCENE:` + `CAMERA:`; **toon-translator** scrutiny required ([cartoon-translation-foundation.md](cartoon-translation-foundation.md))
- G-C timing: shot sum ±2s vs `story_packet.duration_sec`; shot/scene count vs duration tier; `generation_duration_sec` ≥ 4 and sum ≥ editorial ([timing-foundation.md](timing-foundation.md))
- E/E5: translation failures are **blockers** (not warnings) per shot
- G-E5: startFrameAssetId scrutiny before E video
- Resume: skip shots in `resume.e5_completed_shot_ids` / `resume.e_completed_shot_ids`

See [phase-gates.md](phase-gates.md) for full gate table.
