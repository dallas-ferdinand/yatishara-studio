# Cost ledger

Orchestrator tracks spend against approved budget cap throughout automated run.

## Schema

Use [../templates/cost-ledger.template.json](../templates/cost-ledger.template.json).

```json
{
  "approvedCapCredits": 500,
  "spentCredits": 0,
  "entries": [
    { "label": "prop_honey_jar_r1", "jobId": "…", "creditsSpent": 25, "phase": "D", "round": 1 }
  ]
}
```

## Before each `studio_generate_*`

1. `studio_estimate_generation` for this call
2. If `spentCredits + estimate > approvedCapCredits`:
   - Skip optional assets (set plates, secondary props), OR
   - Abort with partial deliverable + spend report
3. Log planned spend in ledger draft

## After each job

Add actual `creditsSpent` from API response to ledger.

Persist via `studio_create_document` / `studio_update_document` as `cost-ledger.json` in `{slug}-cartoon-ad/` folder.

## Close-out

Final message includes:

- Total credits spent vs approved cap
- Compromises from forced sign-offs
- Folder ID for deliverables
