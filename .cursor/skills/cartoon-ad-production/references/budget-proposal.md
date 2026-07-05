# Phase 0.5 — Budget proposal (sole human gate)

After Phase 0 planning, draft line items from a lightweight story skeleton (scene/shot/prop counts).

## Line item formulas

| Category | Formula |
|----------|---------|
| Prop sheets | N props × up to 3 rounds × `imageCreditCost(2K, refs)` |
| Character sheets | M characters × up to 3 rounds × same |
| Set plates | optional locations × up to 3 rounds × same |
| Storyboard stills (E.5) | S shots with cast × up to 3 rounds × `imageCreditCost(2K, refs)` |
| Video shots | S shots × duration × `videoCreditCost(720p)` × up to 3 rounds |
| Contingency | +15% (configurable via `contingencyPercent`) |

## MCP call

```
studio_estimate_production({
  items: [
    { label: "prop_honey_jar", mode: "image", resolution: "2K", hasReferenceInput: true, maxRounds: 3 },
    { label: "shot_S01_storyboard", mode: "image", resolution: "2K", hasReferenceInput: true, maxRounds: 3 },
    { label: "shot_S01", mode: "video", resolution: "1280x720", durationSeconds: 6, hasReferenceInput: true, maxRounds: 3 }
  ],
  contingencyPercent: 15
})
```

## Display to Dallas/Shara

Show **credits AND TT$** (`totalTTD = totalCredits × 0.50`).

Include:

- Per-line subtotals
- Contingency line
- Total credits + TT$
- Current `creditBalance` and `canGenerate`

Write `budget-proposal.md` via `studio_create_document`.

## STOP

Wait for explicit approval:

- `budget approved` / `approve` / adjusted cap

Store in session:

- `approved_budget_credits`
- `approved_budget_ttd`
- `approved_cap_credits` (use adjusted cap if user sets ceiling)

**No Phase A–E work until approved.**
