# Parallel subagents

Orchestrator **must** launch Task subagents for parallel builds. Director merge stays **sequential**. **Self-performing specialist roles without Task = gate failure.**

## Concurrency caps

| Phase | Parallelism | Cap |
|-------|-------------|-----|
| A scrutiny | production-designer, character-continuity | 2 subagents |
| B build | production-designer, character-continuity, location-scout | 3 subagents |
| B scrutiny | dp, gaffer, sound-designer | 3 subagents |
| D manifest | asset-manifest-compute | 1 subagent after B merge |
| D spec build | prop-master + character-continuity + location-scout | 3 parallel |
| D sheet gen | visual scrutiny per asset batch | max 3 parallel Read+scrutiny |
| C build | editor first, then dp, gaffer, sound, composer, colorist, motion-designer | 4+ subagents |
| C scrutiny | all Phase C roles | parallel read-only |
| E.5 storyboard | **sequential** per shot w/ cast; visual scrutiny before video | max 3 parallel Read+scrutiny on stills |
| E video | **sequential** 1/min rate limit; scrutiny parallel | respect API limits; **≥65s** between video calls |

## Launch pattern — REQUIRED

```
Task(subagent_type="generalPurpose", description="Phase B production-designer", prompt="...")
```

**Model:** Do **not** pass `model` on Task subagents — use Auto (parent default). Never specify Sonnet/Opus unless Dallas/Shara explicitly requests a model.

Save each subagent JSON to `{project}/generation/iterations/{phase}-r{round}-{role}.json`.

Collect packets. Validate [packet-schemas.md](packet-schemas.md). Director merge **after** all parallel builds return.

## Visual scrutiny — images

Orchestrator **must** call `Read` on generated images. Launch scrutiny subagents with image paths.

## Visual scrutiny — video clips

1. `studio_get_generation` → asset URL
2. **Read** clip or frame capture
3. **Parallel** prop-master + dp + style-supervisor scrutiny subagents
4. style-supervisor checks [seedance-cinematic-look.md](seedance-cinematic-look.md) anti-gloss list

**Non-negotiable:** no approval from prompt text alone.

## MCP defaults for cinema

```json
{ "skipPromptEnhancement": true, "stylePreset": "story-ad" }
```

Every `generation_prompt` must include mandatory prefix from [seedance-cinematic-look.md](seedance-cinematic-look.md).

**No `studio_generate_video` until Phase C signed off** with seedance prefix on every shot **and** `storyboard_prompt` on every shot with cast on camera.

**People on camera:** E.5 `studio_generate_image` → `startFrameAssetId` before any `studio_generate_video`. Never attach character sheets to video refs — see [start-frame-workflow.md](start-frame-workflow.md).
