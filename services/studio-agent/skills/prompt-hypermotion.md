---
id: prompt-hypermotion
title: Studio hypermotion video prompts
when: User wants hypermotion, severe kinetic, whip/smash, FPV energy, party/boarding/social ads with hard cuts
tools: studio_list_video_models, studio_estimate_generation, studio_generate_image, studio_generate_video
category: prompt
---

# Studio hypermotion video prompts

Hypermotion = **severe spatial kinetic** with a readable story — not micro-strobe spam.

## vs cinematic

| | Cinematic | Hypermotion |
|---|---|---|
| Energy | held, observational | whip / smash / FPV / hard track |
| Cuts | few or continuous | hard / whip / smash unless fades asked |
| Prompt length | medium, precise | longer, denser action + camera verbs |
| Beat | one lifestyle hold | 2–3s readable story beats |

## Model

- Default `videoModel: "seedance-2.5"` unless the user asks for `seedance-2.0`.
- Duration/aspect in args only.

## Prompt law

- Causal: **show trigger before reaction**.
- Every camera line: technique + target + start → end.
- Name people on props (jet ski, boards, decks already crowded) — empty plates read as product-only.
- Ban accidental aircraft: prefer splash / plunge / handheld pier — not “drone” unless requested.

## Multi-beat pattern (15s-style)

```text
Shot 1 (~2–3s): [size] on [subject]. Camera [whip/track/FPV] from [A] to [B]. Action [trigger]. Audio <sfx>.
Shot 2 (~2–3s): Reaction — [who] responds. Camera [smash into / track with] [target]. Audio <sfx>.
Shot 3 (~2–3s): Product/logo readable in motion, not a static sticker. Camera settles or smash-ends.
No music bed unless asked. No subtitles. No readable dialogue unless scripted.
Keep wardrobe and faces continuous with the start frame.
```

## Continuous-take HM

One severe move through space with role-locked subjects — no EDL clock, no matching stills slideshow.

## People workflow

Same as cinematic: storyboard still → video with `startFrameAssetId` + refs.

## Density

For short ads: pack concrete action verbs and spatial landmarks. Soft “beautiful cinematic” language fails HM — write what body and camera *do*.

## Save prompt as a script (when they asked for a prompt)

1. Write a dense sealed HM prompt (beats + camera start→end) — not a short vibe dump.
2. `studio_create_document` into **CWD** (`Prompt — <short>` + ```text fence).
3. Chat paste only if they asked to see/copy it.
4. Generate path: estimate → still → video into CWD. Speak $ / TTD only.
