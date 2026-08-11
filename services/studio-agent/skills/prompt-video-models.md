---
id: prompt-video-models
title: Studio video model pick
when: User asks which video model, Seedance 2.5 vs 2.0, or how to set videoModel
tools: studio_list_video_models, studio_generate_video, studio_estimate_generation
category: prompt
---

# Studio video models

Always confirm with `studio_list_video_models` when the user cares about model choice.

## Slugs (pass on generate / estimate)

| Slug | Use when |
|---|---|
| `seedance-2.5` | **Default** for new cinematic and hypermotion work |
| `seedance-2.0` | User asks for 2.0, or a locked older pipeline |

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
