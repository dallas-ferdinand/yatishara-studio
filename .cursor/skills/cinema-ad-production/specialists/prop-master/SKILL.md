---
name: prop-master-cinema-ad
description: >-
  Prop master for cinema ad production. Defines visual prop specs, writes image
  generation prompts and prop sheet briefs, scrutinizes generated images (must
  view), and iterates until approved. Use in Phase D visual assets. Explicit
  invocation only.
disable-model-invocation: true
---

# Prop Master

Owns **what props look like** and **whether generated images match spec**.

Production-designer says *what exists in the story*. Prop-master says *exactly how it looks* and approves AI-generated refs.

## Phase D — Visual assets

### Mode 1: SPEC BUILD

Input: `world_packet` props + production-designer `prop-language` IDs

Output: `prop_packet` per hero/supporting prop ([../../templates/prop-packet.template.json](../../templates/prop-packet.template.json))

Fields required:

- `prop_spec_id`, `visual_description` (materials, color, wear, scale)
- `generation_prompt` — single-object image prompt
- `prop_sheet_prompt` — grid multi-angle prompt ([references/prop-sheet-spec.md](references/prop-sheet-spec.md))
- `negative_prompt` — text, logos, hands, colored gels, clutter
- `style_bible_refs[]` — from style-supervisor

### Mode 2: EXECUTE (orchestrator)

**Preferred — Studio element sheet API** (2-panel prop/character sheets):

```
studio_create_element({ type: "prop", name, folderId, referenceAssetIds })   // unbuilt
studio_generate_element_sheet({ elementId, resolution: "2K" })               // built — sets sheetAssetId
```

Aligns with `buildElementSheetImagePrompt` in Studio — gray background, no text, front + three-quarter views. Downstream generation must use `referenceElementIds` (or the `sheetAssetId`), never the raw upload refs.

**Fallback — 3×3 cinema grid** when angles/layout need custom layout:

```
studio_generate_image({
  prompt: prop_sheet_prompt,
  stylePreset: "raw",
  skipPromptEnhancement: true,
  resolution: "2K",
  referenceAssetIds: [...]
})
```

Use [references/prop-sheet-spec.md](references/prop-sheet-spec.md) for 3×3 grid prompt structure.

### Mode 3: VISUAL SCRUTINY (mandatory)

**Must view the image file** (`Read` tool on sheetUrl) before approving.

Read [references/visual-scrutiny.md](references/visual-scrutiny.md).

```json
{
  "mode": "visual_scrutiny",
  "role": "prop-master",
  "asset_id": "PROP_honey_jar_v1",
  "approve": false,
  "checks": {
    "matches_material": false,
    "correct_wear": true,
    "no_text": true,
    "no_wrong_background": false,
    "angles_complete": false
  },
  "revision_prompt_delta": "Remove blue label text; dull glass not glossy; add wax seal wear"
}
```

### Mode 4: REVISE

Update element `description` or `prop_sheet_prompt` from scrutiny deltas. Re-execute. Max **3 rounds per prop**.

## Prop sheet vs single hero

| Need | Generate |
|------|----------|
| Video reference for Seedance | **Element sheet** or **3×3 grid** |
| Quick approval of look | Element sheet first |
| Logo | Flat mark sheet — separate scrutiny rules |

## Handoff to Phase C

Approved props → `approved_asset_registry[]` in Production Bible. Shot_packets list `reference_assets[]` with `studio_asset_id`.

## References

- [references/prop-sheet-spec.md](references/prop-sheet-spec.md)
- [references/visual-scrutiny.md](references/visual-scrutiny.md)
- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
