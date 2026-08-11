---
id: prompt-image
title: Studio image prompts
when: User wants a still, flyer, storyboard frame, product shot, or image gen prompt crafted well
tools: studio_estimate_generation, studio_generate_image, studio_view_media
category: prompt
---

# Studio image prompts

Write the **final prompt** the model sees. Keep UI/API settings out of the prompt body (aspect, resolution, quality belong in `studio_generate_image` args).

## Formula

`Subject + action + setting + lighting + lens feel + material finish + what must stay out`

## Good prompt shape (copy pattern)

```text
A [who/what] [doing what] in [place]. [Time of day / light]. Shot as [medium / close / wide], [locked / slight handheld], subject sharp, background soft. Materials: [skin/metal/fabric] look real. Keep [logo/product] readable. No text overlays, no watermark, no extra limbs, no empty product plate without the hero subject.
```

## Storyboard stills (for video later)

- One clear hero pose, readable silhouette, room for motion later.
- Lock wardrobe, face direction, and prop placement in words.
- If people will move in video: still should already show body weight and stance, not a mannequin freeze.

## Direct vs styled

- Default Studio handoff: use the user’s words mostly verbatim unless they ask you to strengthen craft.
- When they ask for “better / cinematic / ad-ready”: expand with concrete camera + light + materials — not vibe adjectives alone (“beautiful”, “epic”, “stunning”).

## Invoke

```json
{ "name": "studio_generate_image", "args": { "prompt": "<final text>", "folderId": "<optional>", "aspectRatio": "16:9" } }
```

Estimate first if spend is unclear. After ok, optionally `studio_view_media`.
