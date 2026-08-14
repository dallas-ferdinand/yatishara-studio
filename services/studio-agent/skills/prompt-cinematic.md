---
id: prompt-cinematic
title: Studio cinematic video prompts
when: User wants cinematic, filmed, lifestyle, soft drama, continuous-take video (not hypermotion chaos)
tools: studio_list_video_models, studio_estimate_generation, studio_generate_image, studio_generate_video
category: prompt
---

# Studio cinematic video prompts

Goal: looks **shot**, not slideshow. Same production density as a serious Seedance lock — not a six-line vibe stub.

Do **not** invent third-party film titles, celebrity likenesses, or “sounds like [public figure]” voices. Original characters and client-locked faces only.

## Model

- Prefer `videoModel: "seedance-2.5"` unless the user asks for `seedance-2.0` (e.g. 1080p/4K).
- Call `studio_list_video_models` if unsure.
- Put duration / aspect / resolution in **args**, not inside the prompt text.

## People workflow (required)

1. `studio_generate_image` — storyboard still with refs
2. `studio_generate_video` — same refs + `startFrameAssetId` from step 1

## Camera law

Always: **technique + target + start state + direction + end state**.

Good: `handheld tracks the woman from doorway to sink, ending in a medium close-up on her hands`

Bad: `cinematic camera` / `drone shot` / `epic move` with no target

Preferred moves: locked-off · dolly in/out · tracking · pan/tilt · crane · handheld · rack focus · shallow depth

Write optics in **degrees** when it matters (native zone ~29–84°). One lens per shot; FOV changes only on a hard cut. Avoid inventing aircraft unless asked.

## Sealed prompt — mandatory skeleton

Write **all** of these blocks, in this order. Thin “Subject / Action / Scene” stubs are unfinished.

```text
SCENE CONTEXT
ACTIVE REFERENCES
⛔ HIGHEST PRIORITY FAILURE LOCKS
✅ MUST-SUCCEED LOCKS
LOCATION MAP
FIRST FRAME AND SPATIAL BLOCKING
FORMAT MODE
OPTICS
CAMERA
ACTION TIMING
PHYSICS
LIGHTING
AUDIO
CHARACTER ACTING
POSITIVE CONSTRAINTS
```

Add a LAYOUT / GEO LOCK when the same room repeats. Add END-STATE at out-point when the next clip must continue.

### Block rules

- **ACTIVE REFERENCES** — each `@Label` appears **exactly once** here. Same Label as `## References`. Location refs own materials / light / atmosphere — **never framing**. Identity refs: current state + “100% matches reference.”
- **⛔** — named fails with visible proof: “shot fails if…”. Proven never-dos only.
- **✅** — must-succeed wins. A prompt with neither ⛔ nor ✅ is unfinished.
- **FIRST FRAME** — already occupied. No empty establish. Position, facing, gaze, hands.
- **No negative essay.** Write the desired physical outcome (“falls on his stomach”) instead of “does not fall on his back.”
- **AUDIO** — voice lock pasted **verbatim** (never synonym). Accent = conditions + 1–2 phonetic markers, never a celebrity. After each spoken line: ~1s closed-mouth silence. `{dialogue}` · `<sfx>` · no music bed unless asked.
- **CHARACTER ACTING** — behavior under pressure, not emotion words. Objective (verb at a partner), obstacle, visible tactic change, unspoken INNER LINE, muscle work, **eye-life** (named gaze, real blinks, catchlights). Hands stay busy until the work stops because of what they heard. Different rhythms — never mirrored twins.
- **The model has no memory.** Restate wardrobe / voice / geography every prompt. Never “same as before.”

## Density

Length is not the enemy — swap-thinning is. Enough locks that a stranger could block the shot. Prefer one held beat over five unreadable flashes.

## Save prompt as a script (when they asked for a prompt)

1. Write the full sealed prompt above — never a short vibe line.
2. **Always** `studio_create_document` into **CWD** (Script `.md`). Never `remember` the script body — only a short pointer to the file after create.
3. `contentMarkdown` = **clean markdown only**. Studio decides how to render.

~~~
# Prompt — <short>

```text
@Label …sealed prompt that names each attached asset with @Label (same Label as References)…
```

## References

- [Label](asset://{assetId}) — optional note
~~~

Asset ids only (attached/generated). No elements. No pipe-meta (`| kind: | path: | studio:`). No HTML. No unclosed fences.
Every References Label MUST appear as `@Label` inside the sealed prompt text so paste/Run shows chips and Seedance binds the media.
4. Paste in chat only if they asked to see/copy it; otherwise tell them the Script is in Files.
5. If they also want a generate: `studio_get_document` if needed → parse refs → estimate → storyboard still (people) → `studio_generate_video` with `folderId` = CWD and `referenceAssetIds` / `startFrameAssetId`. Quote cost as $ / TTD only.
