# Direct prompt handoff — no GPT rewrite

**Mandatory for all Phase D / E.5 / E `studio_generate_*` calls** unless Dallas explicitly requests styled rewrite.

## What this means

MCP defaults (and production runs) send **your finished prompt text straight to the image/video model** — **no secondary pass** through `GATEWAY_TEXT_MODEL_ID` (Gemini 3.1 Pro).

| Step | Runs? |
|------|-------|
| GPT / Flash `enhancePrompt` (`video_prompt` / `image_prompt` rewrite) | **No** (when direct mode) |
| Preset `systemInstructions` merged into prompt | **No** (`unstyled` preset) |
| Auto `Animate from the opening frame…` text prefix on video | **No** |
| **Seedance 2.0** / **GPT Image 2** / **Kling** generation | **Yes** |

`toon-translator` and director merge must produce **complete, model-ready** `storyboard_prompt` and `generation_prompt` — nothing downstream will fix them.

## MCP / API defaults (omit both to get same behavior)

```json
{
  "stylePreset": "unstyled",
  "skipPromptEnhancement": true
}
```

`raw` is an alias for `unstyled`.

## What still appends (not a rewrite)

| Addition | When |
|----------|------|
| `Element references:` + element description lines | `referenceElementIds` set |
| `[Image N]: reference image N` | Prop/location sheets on video |
| Start frame image | `startFrameAssetId` → I2V `first_frame` (image bytes, not GPT) |

## Style preset split

| Call | `stylePreset` | `stylePresetSlug` |
|------|---------------|-------------------|
| `studio_generate_image` (storyboard) | **`unstyled`** | — |
| `studio_generate_video` | **`unstyled`** | — |
| `studio_generate_element_sheet` | — | **`style_family`** from bible (`toon-prime`, etc.) |

`style_family` controls **sheet look** only. It does **not** rewrite shot prompts when direct mode is on.

## Opt-in rewrite (avoid in production)

```json
{ "skipPromptEnhancement": false, "stylePreset": "toon-prime" }
```

Studio UI: **Enhance** toggle ON = rewrite; OFF = direct (same as MCP).

## Specialist obligations

| Role | Obligation |
|------|------------|
| **Director merge** | Ship complete `storyboard_prompt` + `generation_prompt` per [cartoon-translation-foundation.md](cartoon-translation-foundation.md) |
| **toon-translator** | Scrutiny assumes prompts are final — no “enhancement will fix it” |
| **Orchestrator** | Always pass `unstyled` + `skipPromptEnhancement: true` on image/video gen unless Dallas says otherwise |

## Verify

Poll `studio_get_generation` — `enhancedPrompt` should **equal** your submitted prompt (plus optional ref appendix).
