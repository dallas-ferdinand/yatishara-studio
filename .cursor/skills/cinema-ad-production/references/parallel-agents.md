# Parallel subagents

Orchestrator launches Task subagents for parallel builds. Director merge stays **sequential**.

## Concurrency caps

| Phase | Parallelism | Cap |
|-------|-------------|-----|
| B build | production-designer, character-continuity, location-scout | 3 subagents |
| D sheet gen | one subagent per prop/character | max 3 (API 30 req/min) |
| C build | dp, gaffer, sound, editor per shot batch | 4 subagents |
| C scrutiny | all Phase C roles | parallel read-only |
| E video | sequential or 2 concurrent | respect 10 active jobs limit |

## Launch pattern

```
Task(subagent_type="generalPurpose", description="Phase B production-designer", prompt="...")
```

Collect JSON packets from subagents. Orchestrator validates schema ([packet-schemas.md](packet-schemas.md)) before director merge.

## Visual scrutiny — images

Orchestrator **must** call `Read` on generated images (prop sheets, refs). MCP returns `sheetUrl` or `studio_get_asset` URL.

## Visual scrutiny — video clips

1. `studio_get_generation` → asset URL
2. Browser/CDP frame capture or exported frame
3. prop-master + dp + style-supervisor read-only scrutiny subagents

**Non-negotiable:** no approval from prompt text alone.

## MCP defaults for cinema

All generation calls:

```json
{ "stylePreset": "raw", "skipPromptEnhancement": true }
```

Prop sheets prefer `studio_generate_element_sheet`. Custom 3×3 grids use `studio_generate_image` with raw preset.
