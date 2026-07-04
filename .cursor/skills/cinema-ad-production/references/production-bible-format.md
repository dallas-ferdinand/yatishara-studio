# Production Bible format

Single markdown deliverable. Orchestrator emits this after Phase C completes.

## Required sections (in order)

### 1. Brief summary

- Client/product name
- Target duration and aspect ratio
- Director route (Joe / Ernesto)
- Witness object or character arc (one line each)
- Human truth (production clarity only — not audience-facing copy)

### 2. Style bible

Embed `style_bible` from style-supervisor.

### 3. Story packet

Embed `story_packet` JSON or equivalent markdown tables:
- Logline
- Scene list with durations (must sum to target ±2s)
- Dialogue and narrator
- Closing line

### 4. World packet

- Sets per scene
- Character continuity bible
- Location notes
- Hero object / prop locks

### 5. Approved asset registry

Prop sheets and refs: asset_id, file_path, studio_asset_id, prop_spec_id, approval round.

### 6. Shot list table

| shot_id | scene_id | duration_sec | action (one line) |
|---------|----------|--------------|-------------------|

Total duration must match brief.

### 7. Per-shot packets

For each shot_id, full breakdown:

- Camera, lighting, sound, music, color, motion graphics
- `emotional_temperature` (register + behavior_proof — not emotion labels)
- `reference_assets[]`
- Dialogue / narrator if any
- Continuity locks
- **## Generation prompt** — fused Seedance-ready block

Even 2-second shots get full technical breakdown + generation prompt.

### 8. Iteration log

| Phase | Rounds | Blocking resolved | Compromises |
|-------|--------|-------------------|-------------|

List director compromises from forced round-3 sign-offs.

### 9. Director sign-off

```
Director: [joe|ernesto]
Status: [clean|signed_off_with_compromises]
Statement: One paragraph confirming bible is generation-ready.
```

## Director sign-off

```
Director: [joe|ernesto]
Status: [clean|signed_off_with_compromises]
Statement: One paragraph confirming bible is generation-ready.
```

## After emit

Orchestrator writes bible to Studio folder and **immediately continues to Phase E**. Bible is an internal artifact — not a human approval gate.

See [auto-approval.md](auto-approval.md).

## File naming (when saved to disk)

```
production-bible-{slug}-{YYYYMMDD}.md
```

Optional sidecar: `shot-packets.json` with array of shot_packet objects.

## Studio alignment

Generation prompt sections use `## Generation prompt` per [convex/lib/storytellingFoundation.ts](../../../../convex/lib/storytellingFoundation.ts) `SCRIPT_OUTPUT_STRUCTURE`.

See [studio-handoff.md](studio-handoff.md).
