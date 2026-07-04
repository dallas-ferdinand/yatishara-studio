# Resume protocol — interrupted auto-runs

Phase E can take hours (65s between video calls × shots × rounds). If a conversation resets or the agent stops mid-run, **resume from `production-state.json`** — never restart from Phase A unless gates were never satisfied.

## Canonical state file

Path: `{slug}-cinema-ad/generation/production-state.json` (Studio folder doc or local project mirror).

Template: [../templates/production-state.template.json](../templates/production-state.template.json)

On every phase sign-off and after each E.5 / E shot completes, orchestrator **must** update and persist this file via `studio_update_document` or project filesystem.

## Run entry — detect resume

On `@cinema-ad-production run {slug}`:

1. Load `production-state.json`
2. If `budget_approved` is false → require human `budget approved` in thread or abort
3. If `approved_clips` is non-empty but incomplete → **resume mode** (see below)
4. If `phase_signoffs.A/B/C` unsigned → start at earliest unsigned phase (not Phase E)
5. Call `studio_validate_production_gates` before first `studio_generate_*` in the target phase

## Resume mode rules

| State | Action |
|-------|--------|
| `e5_completed_shot_ids` contains `S03` | Skip E.5 for S03; do not regenerate storyboard |
| `e_completed_shot_ids` contains `S03` | Skip E video for S03 unless scrutiny failed and round < 3 |
| `startFrameAssetId` set on shot_packet | Do not rerun E.5 unless scrutiny `approve: false` |
| Partial `approved_clips` | Continue from next shot_id in editor order |
| Phase D registry complete, C unsigned | Resume Phase C round 1 — do not regenerate sheets |
| Crash during single video poll | `studio_get_generation(jobId)` before re-queueing same shot |

## Update `resume` block after each shot

```json
{
  "resume": {
    "last_completed_phase": "E",
    "e5_completed_shot_ids": ["S01", "S02"],
    "e_completed_shot_ids": ["S01"],
    "interrupted_at": null
  }
}
```

Set `interrupted_at` to ISO8601 if stopping with partial deliverable.

## Cost ledger on resume

- Reload `spentCredits` from `cost-ledger.json` — do not reset to zero
- `studio_estimate_generation` before each new generate call
- Never double-charge: if job `done`, log credits once only

## Forbidden on resume

- Regenerating all element sheets because conversation context was lost
- Marking phases signed off without `iteration_log` artifact paths
- Skipping `studio_validate_production_gates` because "we already ran this phase"
