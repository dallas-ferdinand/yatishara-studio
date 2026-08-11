---
id: prompt-video-models
title: Studio video model pick
when: User asks which video model, Seedance 2.5 vs 2.0, or how to set videoModel
tools: studio_list_video_models, studio_generate_video, studio_estimate_generation
category: prompt
---

# Studio video models

Confirm with `studio_list_video_models` when the user cares about model choice. Use each model's **description** field as the voice — talk about what the model does (motion, light, resolution, length).

## Voice (required)

- Name the model and its strengths. Cap limits (seconds / res) are fine.
- **Never** say: legacy, deprecated, old pipeline, older pipeline, older style, outdated.
- Do not invent marketing lines. Stick to `studio_list_video_models` (or this table).

## Slugs (pass on generate / estimate)

| Slug | What it is |
|---|---|
| `seedance-2.5` | **Default.** Strong motion, natural light, smooth camera — up to 30s at 480p/720p |
| `seedance-2.0` | Higher detail through 1080p/4K — clips up to 15s |

Pick `seedance-2.5` unless the user asks for 2.0 or needs 1080p/4K.

## Prompt vs args

- Prompt body = picture + motion + audio language  
- Args = `videoModel`, `aspectRatio`, `durationSeconds`, `resolution`, refs, `startFrameAssetId`  
- Never bury aspect/duration/fps inside the prompt text when args own them

## Invoke sketch

```json
{
  "name": "studio_generate_video",
  "args": {
    "prompt": "<sealed prompt>",
    "videoModel": "seedance-2.5",
    "folderId": "<optional>",
    "startFrameAssetId": "<from storyboard still>",
    "referenceAssetIds": [],
    "aspectRatio": "16:9"
  }
}
```
