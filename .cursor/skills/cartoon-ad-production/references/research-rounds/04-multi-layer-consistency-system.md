# Multi-layer consistency system — L3 pipeline binding

**The stack:** Consistency is not one fix. It is **seven layers** enforced at different phases. Skipping any layer produces the "everything looks different" failure mode.

```
Layer 0: Brief + style_bible + color_script
Layer 1: Element sheets (build-time truth)
Layer 2: Per-shot start frames (E.5) — APPROVAL GATE
Layer 3: Reference allocation (prop/loc on video; cast in frame)
Layer 4: Motion generation (I2V) — motion/camera/sound ONLY
Layer 5: Clip scrutiny (identity + style + spatial)
Layer 6: Editorial continuity (match cuts, grade, chain re-anchor)
```

---

## Layer 0 — Style bible (Phase D)

**Owner:** style-supervisor

| Field | Locks |
|-------|-------|
| `style_family` | toon-prime / adult / family / cgi |
| `render_style` | 2d_cel_animation |
| `line_weight` | medium_consistent |
| `palette_id` | warm_domestic_muted etc. |
| `shading_model` | flat_cel_two_tone |
| `forbidden[]` | photoreal_skin, film_grain, etc. |

**Optional for campaigns:** `color_script_asset_id` — single still defining grade.

**Gate:** G-D visual scrutiny — all `style_checks` pass before any E.

---

## Layer 1 — Element sheets (Phase D)

**Owner:** prop-master, character-continuity, location-scout

- One `studio_generate_element_sheet` per designed asset
- Sheets are **static truth** — proportions, materials, palette register
- `referenceElementIds` on E.5 (all sheets) and E video (prop/loc only)

**Does not solve:** motion-time identity, ink flicker, cross-session grade.

---

## Layer 2 — Start frames (Phase E.5)

**Owner:** character-continuity, dp, style-supervisor

**Mandatory when `cast_on_camera: true`.**

Each shot gets its own approved still:

```
studio_generate_image({
  storyboard_prompt,  // FULL look + FRAME/FG/MG/BG — frozen
  referenceElementIds,
  stylePreset: "unstyled",
  skipPromptEnhancement: true
})
```

### E.5 approval checklist (blocking)

- [ ] Matches element sheet silhouette + line weight
- [ ] `shot_size_open` correct for sourceMode
- [ ] FRAME block complete (head room, lead room, thirds)
- [ ] No travel verbs in storyboard_prompt
- [ ] Palette within style_bible family
- [ ] Witness prop readable if required by beat

**Never proceed to E without signed E.5 for that shot.**

---

## Layer 3 — Reference allocation (pre-E)

**Owner:** orchestrator per `shot-reference-allocation.md`

| Asset | E.5 storyboard | E video |
|-------|----------------|---------|
| Character sheets | ✅ attach | ❌ prompt only |
| Prop sheets | ✅ attach | ✅ attach |
| Location sheets | ✅ attach | ✅ attach |
| Style anchor | optional | optional when grade drifts |
| startFrameAssetId | output of E.5 | ✅ first_frame |

---

## Layer 4 — Motion generation (Phase E)

**Owner:** toon-translator, dp

```
studio_generate_video({
  generation_prompt,  // 60-100 words, PRESERVE + SCENE/CAMERA/SOUND/CONSTRAINTS
  startFrameAssetId,
  referenceElementIds,  // prop/loc only
  stylePreset: "unstyled",
  skipPromptEnhancement: true,
  videoModel: "seedance-2.0" | override
})
```

### Motion discipline (cel)

- One action per shot
- One camera verb (or held)
- No zoom
- Photographic cast: avoid head turns, hair whip, occlusion
- CONSTRAINTS: `no wardrobe change`, `no ink flicker`, `no photoreal drift`

### Batch strategy

Generate E in **shot-size families** (all MWS, then all WS) to reduce lighting variance.

---

## Layer 5 — Clip scrutiny (Phase E post)

**Owners:** style-supervisor, character-continuity, continuity-supervisor, dp

### Per-clip rubric (new — blocking for sign-off)

**Identity (character-continuity):**
- Frame 1 matches start frame
- Mid/end frames: eye spacing, jaw, hair mass stable
- Wardrobe colors unchanged

**Style (style-supervisor):**
- Line weight matches bible + sheet
- Cel shading steps consistent
- No photoreal skin/bokeh/grain
- Palette hue family matches color_script

**Spatial (continuity-supervisor + dp):**
- No wall/prop warp during camera move
- Witness prop geography stable
- Window/light direction unchanged

**Motion integrity (dp):**
- Single move executed; no mid-clip morph
- Ink outline stable on scrub

**Rejection rule:** >30% drift at thumbnail compare → regen video. If frame 1 wrong → regen E.5.

---

## Layer 6 — Editorial (post-E)

**Owner:** editor, colorist

- Match cuts on action
- Whip/dissolve to hide minor seam drift
- Unified LUT / grade across approved clips
- Chain re-anchor: last good frame → optional next start frame for long sequences
- Shot ledger: model, refs, prompt hash, approval status per clip

---

## Minimum vs gold standard

### Minimum (one-off 15s ad)

Layers 0–4 with E.5 + E scrutiny (L5 manual).

### Gold standard (campaign / recurring brand)

All layers + style anchor + color script + shot ledger + post LUT + LoRA for mascot (10+ variants).

---

## Orchestrator pre-flight (before any E call)

1. `studio_validate_production_gates` → `canProceed: true`
2. Every cast shot has `startFrameAssetId`
3. `shot-reference-allocation.json` exists
4. `generation_prompt` passes toon-translator regex
5. `storyboard_prompt` has FRAME block (warning if missing)
6. `videoModel` set explicitly if Kling override

---

## Research cross-links

- Causes: [01-consistency-root-causes.md](01-consistency-root-causes.md)
- Models: [02-model-routing-matrix.md](02-model-routing-matrix.md)
- Framing: [03-framing-proportions-field-guides.md](03-framing-proportions-field-guides.md)
- Method: [00-research-methodology.md](00-research-methodology.md)
