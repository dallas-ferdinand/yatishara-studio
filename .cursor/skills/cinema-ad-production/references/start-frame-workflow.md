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
  stylePreset: "story-ad",
  skipPromptEnhancement: true,
  aspectRatio: brief ratio,
  resolution: "2K",
  folderId: "..."
})
```

Save `assets[0].id` as `shot_packet.startFrameAssetId`.

Storyboard prompt must describe **one still** — composition, light, who is in frame, witness props. Not motion.

### Step 2 — Video

```
studio_generate_video({
  prompt: shot_packet.generation_prompt,
  startFrameAssetId: shot_packet.startFrameAssetId,
  referenceElementIds: shot_packet.referenceElementIds,  // prop + location attach; characters prompt-only
  stylePreset: "story-ad",
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
| `generation_prompt` | Yes | Motion/camera only — people already in start frame |
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
