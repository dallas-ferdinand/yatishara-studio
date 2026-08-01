# Start frame workflow — people in Seedance video

**Do not add a `scene` element type.** A start frame is a **generated image asset** per shot, not a reusable registry element like character/prop/location.

## Why

Seedance blocks photoreal **character face sheets** as video reference images. Higgsfield avoids this with `--start-image`: the **opening still** already contains the people; Seedance animates from frame 1.

Studio uses the same path via Vercel AI Gateway: `first_frame` + prop/location refs as `[Image N]`.

## Element types (unchanged)

| Type | Role in video |
|------|----------------|
| **character** | Build sheet for **storyboard** image gen; description in video prompt; **never** attach sheet to video refs |
| **prop** | Sheet attaches as `[Image N]` reference |
| **location** | Sheet attaches as `[Image N]` reference |
| **doc** | Script/brief only |

## Two-step per shot (Phase E)

### Step 1 — Storyboard (start frame)

```
studio_generate_image({
  prompt: shot_packet.storyboard_prompt,
  referenceElementIds: shot_packet.referenceElementIds,  // ALL cast + props + locations
  stylePreset: "unstyled",
  skipPromptEnhancement: true,
  aspectRatio: brief ratio,
  resolution: "2K",
  folderId: "..."
})
```

Save `assets[0].id` as `shot_packet.startFrameAssetId`.

Storyboard prompt must describe **one still** — composition at `camera.shot_size_open`, light, who is in frame. **No dolly/pan/travel verbs** (motion is `generation_prompt`). Grammar: [cartoon-translation-foundation.md](cartoon-translation-foundation.md) §5 (FRAME/FG/MG/BG).

**Aspect ratio:** `aspectRatio` on storyboard **must match brief** (e.g. `9:16` TikTok). I2V models follow input frame shape.

## Seedance pass-through framing (E.5 storyboard)

Start frames are scanned for photoreal faces. **Framing in `storyboard_prompt` determines pass rate** — not just using `startFrameAssetId`.

| Cast `sourceMode` | Storyboard `shot_size_open` | Face in frame |
|-------------------|----------------------------|---------------|
| `photographic` (real likeness) | **MWS or wider** — never ECU/MCU face-forward | ≤25% of frame; prefer OTS, 3/4 profile, partial occlusion |
| `designed` (fictional) | MCU acceptable | Standard composition OK |
| Any | Push-in shots | Storyboard opens **wider** than end frame; video prompt does the push |

**Photographic cast rules (mandatory in Phase C director merge):**

1. `storyboard_prompt` must not request "face clearly visible", "close-up on face", or "portrait"
2. Prefer over-the-shoulder, 3/4 profile, or mid-ground figure in environment
3. Hands, props, and negative space carry identity — not a centered face plate
4. If E.5 still fails Seedance filter after wide framing → log compromise; retry with back-of-head or silhouette storyboard; last resort `videoModel: "kling-3.0-i2v"` on video step only

**Scrutiny:** If pore-level face detail is readable at thumbnail size, flag `negotiate` — likely Seedance block on video step.

### Step 2 — Video

```
studio_generate_video({
  prompt: shot_packet.generation_prompt,
  startFrameAssetId: shot_packet.startFrameAssetId,
  referenceElementIds: shot_packet.referenceElementIds,  // prop + location attach; characters prompt-only
  stylePreset: "unstyled",
  skipPromptEnhancement: true,
  durationSeconds: shot_packet.generation_duration_sec,
  aspectRatio: brief ratio,
  folderId: "..."
})
```

Wait **≥65s** between video API calls.

## Shot packet fields

Add to each `shot_packet`:

| Field | Required | Notes |
|-------|----------|-------|
| `storyboard_prompt` | Yes | Single still for GPT Image 2 |
| `startFrameAssetId` | Before video | From step 1 output |
| `generation_prompt` | Yes | Motion/camera/sound only — people already in start frame; **60–100 words** |
| `referenceElementIds` | Yes | Full audit list; Studio splits attach vs prompt |

## Web app

Video composer: attach an **image asset** as **Start frame** (toolbar). Attach **elements** for prop/location refs. Characters via element description + storyboard.

## Not this

- ❌ New `scene` element type
- ❌ Character sheet as video image ref
- ❌ Skipping storyboard when people are on camera
- ❌ Higgsfield CLI for production path

## Future

ByteDance `@character:<id>` registration API (not on Vercel gateway) — optional long-term identity reuse across projects.
