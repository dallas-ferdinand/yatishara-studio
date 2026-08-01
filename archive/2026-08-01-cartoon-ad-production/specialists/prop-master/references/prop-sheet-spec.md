# Prop sheet specification

Reference sheet for video generation — **not** a marketing render.

## Layout

| Layout ID | Grid | Use |
|-----------|------|-----|
| `sheet:grid-2x2` | 4 angles | Small props (mug, jar) |
| `sheet:grid-2x3` | 6 angles | Medium props (chair arm, shoes) |
| `sheet:grid-3x3` | 9 angles | Hero witness object |
| `sheet:turnaround-4` | front, 3/4, side, back | Character-relevant props |

## Required properties (every prop sheet prompt)

1. **No text** — no labels, no typography, no watermarks
2. **No colored backdrop** — neutral gray `#808080` or white seamless only
3. **No hands, people, or scene context** — object only
4. **Same object every cell** — consistent scale and wear
5. **Even lighting** — flat product reference light, not cinematic mood
6. **Angles labeled in prompt only** — not rendered as text in image

## Example prop_sheet_prompt

```
Reference sheet grid 3x3, neutral gray seamless background, no text, no logos,
no people. Same worn glass honey jar with dull amber contents, chipped paper lid,
finger smudge on glass, slight wax residue. Nine angles: front, front 3/4 left,
front 3/4 right, side left, side right, back, top down, bottom up, detail macro
of lid wear. Even soft studio lighting, photorealistic, object fills each cell
consistently.
```

## Negative prompt (standard)

```
text, words, letters, watermark, logo, hands, person, face, colored background,
gradient backdrop, scene, table, kitchen, dramatic lighting, advertisement layout
```

## Approval criteria (visual scrutiny)

- [ ] All grid cells same object
- [ ] Wear/era matches prop_spec
- [ ] No readable text on object unless brief requires branded label (then exact label spec)
- [ ] Background neutral
- [ ] Enough angles for video model to lock geometry

## Video gen usage

Pass approved prop sheet as `referenceAssetIds` / `referenceUrls` on shots featuring that object. Mention in shot `generation_prompt`: "Match reference sheet geometry and wear for honey jar."
