# Iteration protocol

Each phase runs up to **3 rounds**. Rounds 2–3 only rebuild items with **blocking** conflicts from the prior round.

## Round structure

```
Round N (N = 1, 2, or 3):
  1. BUILD   — active specialists propose (cite repertoire_refs)
  2. MERGE   — director synthesizes unified direction
  3. SCRUTINY — specialists return structured objections
  4. RESOLVE — director revises; orchestrator logs open conflicts
  5. EXIT    — when blocking=0 OR N=3
```

## Conflict severity

| Level | Meaning | Action |
|-------|---------|--------|
| `blocking` | Cannot proceed; breaks another department's lane | Must fix before phase exit |
| `negotiate` | Trade-off; director decides with logged rationale | Director override allowed |
| `note` | Observation only | Log in iteration log, no rebuild required |

## Phase-specific scope

### Phase A — Story

- **Build:** story-architect produces full story_packet draft
- **Merge:** director integrates narrative authority (Joe or Ernesto rules)
- **Scrutiny:** production-designer (feasibility), character-continuity (cast clarity)
- **Rebuild scope:** scenes flagged blocking only

### Phase B — World

- **Build:** production-designer, character-continuity, location-scout in parallel
- **Merge:** director unifies world_packet
- **Scrutiny:** dp (shootability), gaffer (light motivation), sound-designer (sonic environment)
- **Rebuild scope:** scenes/locations with blocking conflicts

### Phase C — Shotcraft

- **Build:** dp, gaffer, sound-designer, composer, editor, motion-designer, colorist per shot
- **Merge:** director fuses into unified shot direction + generation_prompt
- **Scrutiny:** all Phase C roles cross-review merged shots
- **Rebuild scope:** shot_ids with blocking conflicts only

## Forced sign-off (round 3)

If blocking conflicts remain after round 3:

1. Director logs each unresolved conflict as **compromise**
2. Director states which department wins and why
3. Orchestrator marks phase `signed_off_with_compromises`
4. Pipeline continues — compromises appear in Production Bible iteration log

## Orchestrator tracking

Maintain running state:

```json
{
  "phase": "C",
  "round": 2,
  "blocking_conflicts": ["S04:sound-designer", "S07:dp"],
  "compromises": []
}
```

## Specialist modes

Every specialist skill defines two modes:

- **builder** — propose choices from repertoire; output `mode: "build"`
- **scrutiny** — review merged direction; output `mode: "scrutiny"`; never rewrite whole scene

See [packet-schemas.md](packet-schemas.md).
