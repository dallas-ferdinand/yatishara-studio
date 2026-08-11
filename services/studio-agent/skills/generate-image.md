---
id: generate-image
title: Generate an image
when: User wants a new image / picture / still created
tools: studio_estimate_generation, studio_generate_image, studio_view_media
category: ops
---

# Generate image

1. If spend unclear → `studio_estimate_generation { mode:"image", prompt }`.
2. For craft help, load skill `prompt-image` first.
3. `studio_generate_image { prompt, folderId?, aspectRatio? }`.
4. On approval, stop. After ok, note assetId; optional `studio_view_media`.
