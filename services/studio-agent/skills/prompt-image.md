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
{ "name": "studio_generate_image", "args": { "prompt": "<final text>", "folderId": "<CWD unless told otherwise>", "aspectRatio": "16:9" } }
```

## Save prompt as a script (when they asked for a prompt, not a generate)

1. Load this skill, write a **full** sealed prompt (subject + action + setting + light + lens + materials + keep-outs) — never a one-line vibe dump.
2. **Always** `studio_create_document` into **CWD** (Files → Script `.md`). Never put the prompt body in `remember`/memory — memory may only note *where* the Script lives after create.
3. Title: `Prompt — <short subject>` (or `Script — <short>`).
4. `contentMarkdown` must be **clean markdown only** (CommonMark). Rendering is Studio’s job — never invent custom pipe-meta formats.

Example `contentMarkdown`:

~~~
# Prompt — <short>

```text
@Label …full sealed prompt; every References Label appears as @Label (Higgs-style)…
```

## References

- [Label](asset://{assetId}) — optional note
~~~

**Hard rules for Script files**
- Plain markdown only: headings, ```text fences, lists, links.
- References = `## References` + markdown links `asset://{id}` only.
- Sealed prompt MUST include `@Label` for each References Label so Create paste shows chips + Seedance binds media.
- **Forbidden:** pipe-meta rows (`| kind: | path: | studio:`), HTML, null bytes, unclosed fences, inventing element paths.
- Only **asset** ids from attached chips / generated stills. Never invent element ids. Never use `/Studio/elements/…`.

5. Chat: point them at the Script file. Paste in chat **only** if they asked to see / copy it.
6. Generate only if they also asked to generate — then pass `referenceAssetIds` from the References lines (and `folderId` = CWD).

Estimate first if spend is unclear. After ok, optionally `studio_view_media`.
