# Cartoon Translation Foundation

Model conditioning layer for Seedance/Kling I2V under cartoon look. Replaces photoreal Seedance translation.

**Direct handoff:** Production uses `stylePreset: "unstyled"` + `skipPromptEnhancement: true` — **no Flash/GPT rewrite** before Seedance. Prompts in this doc must be **complete at Phase C** ([direct-prompt-handoff.md](direct-prompt-handoff.md)).

## Two prompt surfaces

| Surface | When | Look prefix | Motion |
|---------|------|-------------|--------|
| `storyboard_prompt` | Phase C, cast on camera | **FULL** cartoon look block | **No** travel verbs — frame is frozen |
| `generation_prompt` | Phase E video | **PRESERVE** abbreviated line only | SCENE + CAMERA + SOUND + CONSTRAINTS |

## storyboard_prompt structure

```
[FULL cartoon look prefix — see cartoon-look-foundation.md]

FRAME: [wide/medium/close — one setup]
FG: [cast pose, expression readable]
MG: [witness object, prop lock]
BG: [stylized environment plate, palette locked]
```

Rules:

- One frozen moment; no dolly/pan/track language
- Cast framing: medium or close for expression; avoid ECU on photographic refs (designed cast OK)
- PROP LOCK when `referenceElementIds` attach

## generation_prompt structure (60–100 words)

```
PRESERVE start-frame cartoon look: consistent line weight, flat cel shading, locked palette — motion only.

SCENE: [observable verbs — squash on reaction, held pose, object witness]
CAMERA: [one spatial move OR held; scale to micro-pacing — see micro-pacing-foundation.md]
SOUND: [foley over score unless brief requests music]
CONSTRAINTS: [palette lock, no photoreal drift, timing beats within generation_duration_sec]
```

## Word budget

- Target 60–80 words; hard cap 100 for I2V gateway
- Trim environment re-description when start frame carries look
- Never paste FULL look prefix on I2V when `cast_on_camera` and `startFrameAssetId` set

## Forbidden on generation_prompt

- `Shot on ARRI Alexa`, film grain, natural skin texture
- `zoom in/out`, snap zoom, optical zoom — use dolly/track equivalents in cartoon staging language ("held frame with slight push" → prefer single dolly verb)
- Emotion labels without visible behavior
- Photoreal lighting re-state (window practicals as **cel key/fill**, not documentary)

## Env-only shots

No `storyboard_prompt` required. `generation_prompt` still needs SCENE/CAMERA headers and cartoon CONSTRAINTS (no photoreal leakage).

## Scrutiny owner

`toon-translator` specialist — Phase C scrutiny after director merge. Gates mirror checklist in `productionGates.ts` (`style_checks`).

## Kling fallback

Same signed `generation_prompt`; cartoon PRESERVE line stays. Do not shorten below craft minimum — iterate shot prose per kling-prompt-length.md.
