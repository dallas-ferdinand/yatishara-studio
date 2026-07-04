# Iteration protocol

Each phase runs up to **3 rounds**. Rounds 2–3 only rebuild items with **blocking** conflicts from the prior round.

**Enforcement:** `studio_validate_production_gates` validates iteration proof mechanically ([gate-validation.md](gate-validation.md)). Honor-system logging is not sufficient.

## Round structure

```
Round N (N = 1, 2, or 3):
  1. BUILD   — Task subagents per specialist SKILL.md (cite repertoire_refs)
  2. MERGE   — director synthesizes unified direction
  3. SCRUTINY — Task subagents return structured objections
  4. RESOLVE — director revises; orchestrator logs round_summary
  5. EXIT    — when blocking_count === 0 OR N === 3 (forced sign-off)
```

**Forbidden:** performing specialist builds or scrutiny inline in the orchestrator turn. Self-performance = gate failure ([phase-gates.md](phase-gates.md)).

## Conflict severity

| Level | Meaning | Action |
|-------|---------|--------|
| `blocking` | Cannot proceed; breaks another department's lane | Must fix before phase exit (or round 3 compromise) |
| `negotiate` | Trade-off; director decides with logged rationale | Director override allowed |
| `note` | Observation only | Log in iteration log, no rebuild required |

## Orchestrator procedure (every round)

After **each** build, merge, and scrutiny subagent completes:

1. **Save artifact** — write JSON to `generation/iterations/{PHASE}-r{N}-{role}.json`
2. **Append iteration_log entry** — one entry per subagent step:

```json
{
  "round": 1,
  "phase": "B",
  "step": "build",
  "role": "location-scout",
  "mode": "build",
  "subagent_artifact": "generation/iterations/B-r1-location-scout.json"
}
```

3. **After scrutiny merge** — append `round_summary`:

```json
{
  "packet_type": "scrutiny_report",
  "phase": "B",
  "round": 1,
  "step": "round_summary",
  "blocking_count": 0,
  "negotiate_count": 1,
  "rebuild_scope": [],
  "advance": true
}
```

4. **Update `iteration` tracker** in `production-state.json`:

```json
{
  "iteration": {
    "active_phase": "B",
    "active_round": 1,
    "blocking_conflicts": [],
    "last_step": "round_summary"
  }
}
```

5. **Advance or rebuild:**
   - `blocking_count === 0` → update `phase_signoffs.{phase}` (`rounds: N`, director sign-off)
   - `blocking_count > 0` and `N < 3` → increment round; rebuild **only** `rebuild_scope` items
   - `blocking_count > 0` and `N === 3` → director `signed_off_with_compromises`

6. **Persist** `production-state.json` before next round or next phase.

Templates: [../templates/iteration-log-entry.template.json](../templates/iteration-log-entry.template.json), [../templates/iteration-round-summary.template.json](../templates/iteration-round-summary.template.json)

## Phase-specific scope

### Phase A — Story

- **Build:** story-architect → full `story_packet`
- **Merge:** director-joe or director-ernesto
- **Scrutiny:** production-designer, character-continuity (parallel Task subagents)
- **Rebuild scope:** scenes flagged `blocking` only

### Phase B — World

- **Build:** production-designer, character-continuity, location-scout (parallel)
- **Merge:** director
- **Scrutiny:** dp, gaffer, sound-designer (parallel)
- **Rebuild scope:** scenes/locations with blocking conflicts

### Phase D — Visual assets

- **Build:** style-supervisor bible, prop-master specs, sheet generation batches
- **Merge:** director adjudicates registry conflicts (when needed)
- **Scrutiny:** prop-master + style-supervisor visual scrutiny per asset (`mode: visual_scrutiny`, `viewed: true`)
- **Rebuild scope:** asset_ids with blocking visual scrutiny only

### Phase C — Shotcraft

- **Build:** editor **first** (round 1), then dp, gaffer, sound-designer, composer, colorist, motion-designer (parallel)
- **Merge:** director → `shot_packets[]` + prompts
- **Scrutiny:** all Phase C builders + character-continuity + **seedance-translator** + **continuity-supervisor**
- **Rebuild scope:** `shot_ids` with blocking conflicts only

## Required roles per phase (gate-checked)

| Phase | Build | Merge | Scrutiny |
|-------|-------|-------|----------|
| A | story-architect | director-* | production-designer, character-continuity |
| B | production-designer, character-continuity, location-scout | director-* | dp, gaffer, sound-designer |
| D | style-supervisor, prop-master | director-* (optional) | ≥1 visual scrutiny: prop-master or style-supervisor |
| C | editor (+ dp, gaffer, sound, composer, motion, color) | director-* | all C builders + character-continuity + seedance-translator + continuity-supervisor |

## Forced sign-off (round 3)

If blocking conflicts remain after round 3:

1. Director logs each unresolved conflict as **compromise**
2. Director states which department wins and why
3. Orchestrator sets `phase_signoffs.{phase}.status: signed_off_with_compromises` and `rounds: 3`
4. Pipeline continues — compromises appear in Production Bible iteration log

## Auto-advance rules

See [auto-approval.md](auto-approval.md). Summary:

- Advance when `round_summary.blocking_count === 0`
- Or round 3 with `signed_off_with_compromises`
- **Never** skip specialist steps without `fast-path` keyword from Dallas/Shara

## Specialist modes

Every specialist skill defines two modes:

- **builder** — propose choices from repertoire; output `mode: "build"`
- **scrutiny** — review merged direction; output `mode: "scrutiny"`; never rewrite whole scene

See [packet-schemas.md](packet-schemas.md).
