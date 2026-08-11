---
id: generate-video
title: Generate a video
when: User wants a video clip; animate a still; people scenes; cinematic or hypermotion
tools: studio_list_video_models, studio_estimate_generation, studio_generate_image, studio_generate_video
category: ops
---

# Generate video

## Bias to action

Vague “make a video / animate this” → **assume defaults and run tools**. Do not open with a menu (“estimate, list models, or generate?”).

## Defaults (unless user overrides)

- `videoModel`: `seedance-2.5`
- Duration: **8** seconds (clamp to model max from `studio_list_video_models`)
- Aspect: match attached still if known, else `16:9`
- Style pack: `prompt-cinematic` unless they said hypermotion / chaos / whip / smash → `prompt-hypermotion`
- Attached images → `referenceAssetIds` / `startFrameAssetId` (people: storyboard still first)

## Steps

1. Optional: `studio_list_video_models` only if you need real caps — never invent features (no “motion intensity”, no fake duration ranges).
2. `studio_estimate_generation` with the assumed args + prompt.
3. People without a locked still: `studio_generate_image` storyboard → then video with `startFrameAssetId`.
4. `studio_generate_video` (approval card handles spend).
5. One short line disclosing assumptions + estimate; stop on pendingApproval.

## Forbidden

- Inventing model marketing (“legacy pipeline”, fake caps)
- Ending with A/B/C option menus before tools run
- Claiming capabilities Studio does not expose
