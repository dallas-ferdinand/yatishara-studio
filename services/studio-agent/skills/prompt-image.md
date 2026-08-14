---
id: prompt-image
title: Studio image prompts
when: User wants a still, flyer, storyboard frame, product shot, or image gen prompt crafted well
tools: studio_estimate_generation, studio_generate_image, studio_view_media
category: prompt
---

# Studio image prompts

Write the **final prompt** the model sees. Keep UI/API settings out of the prompt body (aspect, resolution, quality belong in `studio_generate_image` args).

Do **not** invent celebrity faces or third-party film likenesses. Client photos and original characters only.

## Formula

`Subject + action + setting + lighting + lens feel + material finish + keep-ins`

Write the desired state. Put proven fails in a short ⛔ list — do not write a long “no X / no Y” essay (negation often summons the thing).

## Good prompt shape (copy pattern)

```text
SCENE: [who/what] [doing what] in [place]. [Time of day / one light source + shadow direction].
FRAME: [medium / close / wide], [3/4 preferred for rooms], subject sharp.
MATERIALS: [skin/metal/fabric] look real — rust, weave, fingerprints when they belong.
@Label — [what this ref owns: face / product / location materials]. 100% matches reference.
⛔ [photo-studio stands, extra limbs, watermark, empty product plate, celebrity lookalike]
✅ [readable logo/product, occupied first frame, locked wardrobe]
```

## Character sheets (continuity)

- Three panels: full-body front, full-body back, large **3/4** close portrait. Same person.
- Headless full-body figures so wides cannot steal a tiny soft face.
- Grey flat background. Soft even light. Do **not** write “photo studio” / stands / rim light (those bake into every later video).
- Hands empty. Props are separate images.
- New state (wet, new clothes) = new still. Change only what changed.

## Location stills

- Three-quarter, not frontal wallpaper. One **anchor** object (lamp, sofa, column).
- No people and no weapons in a location plate. Day / night / rain = separate stills.

## Storyboard stills (for video later)

- One clear hero pose, readable silhouette, room for motion later.
- Lock wardrobe, face direction, and prop placement in words.
- Body weight and stance already in the still — not a mannequin freeze.

## Direct vs styled

- Default handoff: keep the user’s facts; strengthen craft (camera + light + materials).
- When they ask “better / cinematic / ad-ready”: expand with concrete nouns — not vibe adjectives alone (“beautiful”, “epic”, “stunning”).

## Invoke

```json
{ "name": "studio_generate_image", "args": { "prompt": "<final text>", "folderId": "<CWD unless told otherwise>", "aspectRatio": "16:9" } }
```

## Save prompt as a script (when they asked for a prompt, not a generate)

1. Load this skill, write a **full** sealed prompt — never a one-line vibe dump.
2. **Always** `studio_create_document` into **CWD** (Files → Script `.md`). Never put the prompt body in `remember`/memory — memory may only note *where* the Script lives after create.
3. Title: `Prompt — <short subject>` (or `Script — <short>`).
4. `contentMarkdown` must be **clean markdown only** (CommonMark).

Example `contentMarkdown`:

~~~
# Prompt — <short>

```text
@Label …full sealed prompt; every References Label appears as @Label…
```

## References

- [Label](asset://{assetId}) — optional note
~~~

**Hard rules for Script files**
- Plain markdown only: headings, ```text fences, lists, links.
- References = `## References` + markdown links `asset://{id}` only.
- Sealed prompt MUST include `@Label` for each References Label so Create paste shows chips and Seedance binds media.
- **Forbidden:** pipe-meta rows (`| kind: | path: | studio:`), HTML, null bytes, unclosed fences, inventing element paths.
- Only **asset** ids from attached chips / generated stills. Never invent element ids. Never use `/Studio/elements/…`.

5. Chat: point them at the Script file. Paste in chat **only** if they asked to see / copy it.
6. Generate only if they also asked to generate — then pass `referenceAssetIds` from the References lines (and `folderId` = CWD).

Estimate first if spend is unclear. After ok, optionally `studio_view_media`.
