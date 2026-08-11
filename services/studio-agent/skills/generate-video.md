---
id: generate-video
title: Generate a video
when: User wants a video clip; people scenes; cinematic or hypermotion
tools: studio_list_video_models, studio_estimate_generation, studio_generate_image, studio_generate_video
category: ops
---

# Generate video

1. Load `prompt-cinematic` or `prompt-hypermotion` (and `prompt-video-models` if model choice matters).
2. Estimate if spend unclear.
3. People: storyboard still via `studio_generate_image` with refs → then `studio_generate_video` with `startFrameAssetId` + same refs.
4. Pass `videoModel` (`seedance-2.5` default) and aspect/duration in args.
5. Never claim done without tool ok.
