---
id: prompt-cinematic
title: Studio cinematic video prompts
when: User wants cinematic, filmed, lifestyle, soft drama, continuous-take video (not hypermotion chaos)
tools: studio_list_video_models, studio_estimate_generation, studio_generate_image, studio_generate_video
category: prompt
---

# Studio cinematic video prompts

Goal: looks **shot**, not slideshow. Prefer one continuous beat with readable blocking.

## Model

- Prefer `videoModel: "seedance-2.5"` for cinematic work unless the user asks for `seedance-2.0` (e.g. 1080p/4K).
- Call `studio_list_video_models` if unsure.
- Put duration / aspect / resolution in **args**, not inside the prompt text.

## Prompt formula

`Subject + action + scene + visual style + camera move (start→end) + audio`

## Camera law

Always: **technique + target + start state + direction + end state**.

Good: `handheld tracks the woman from doorway to sink, ending in a medium close-up on her hands`

Bad: `cinematic camera` / `drone shot` / `epic move` with no target

Preferred moves: locked-off · dolly in/out · tracking · pan/tilt · crane · handheld · rack focus · shallow depth

Avoid inventing aircraft unless asked. Prefer eye-level / crane / tracking.

## People workflow (required)

1. `studio_generate_image` — storyboard still with refs  
2. `studio_generate_video` — same refs + `startFrameAssetId` from step 1  

## Sealed prompt pattern

```text
Subject: [who], wardrobe locked as in the start frame.
Action: [one clear beat].
Scene: [place, time, light].
Camera: [technique] on [target], starts [state], moves [direction], ends [state].
Style: filmed natural light, real materials, no plastic skin.
Audio: <key sfx only>; no music bed unless asked; mouths closed unless scripted dialogue.
Keep continuity with the start frame face, outfit, and prop placement.
Do not cut to a different location. Do not add on-screen text.
```

## Density

Enough concrete nouns and verbs that a stranger could block the shot. Prefer one held lifestyle/product beat over five unreadable flashes.

## Save prompt as a script (when they asked for a prompt)

1. Write the full sealed prompt above — never a short vibe line.
2. `studio_create_document` into **CWD** with title `Prompt — <short>` and the prompt inside a ```text fence.
3. Paste in chat only if they asked to see/copy it; otherwise tell them the file is in Files.
4. If they also want a generate: estimate → storyboard still (people) → `studio_generate_video` with `folderId` = CWD. Quote cost as $ / TTD only.
