# Layered composition — DP checklist

Master: [../../../references/depth-and-layering-for-gen.md](../../../references/depth-and-layering-for-gen.md)

## Per-shot builder (add to Phase C output)

Every shot with environment visible must include:

```json
{
  "camera": {
    "shot_size_open": "MWS",
    "shot_size_end": "MS",
    "subject_thirds_position": "right_third_looking_left",
    "head_room": "standard",
    "lead_room": "left"
  },
  "depth_layers": {
    "foreground": "soft wooden chair back entering frame right — out of focus",
    "midground": "witness chair beside bed, sharp",
    "background": "jalousie window, stripe light, soft depth"
  },
  "layer_device": "foreground-wipe",
  "parallax_note": "on dolly forward: FG slides faster, BG stripes shift slower",
  "light_planes": ["fg_soft_silhouette", "mg_window_key", "bg_fill"]
}
```

**Framing canon:** [../../../references/research-rounds/03-framing-proportions-field-guides.md](../../../references/research-rounds/03-framing-proportions-field-guides.md)

**Push-in rule:** `shot_size_open` wider than `shot_size_end`; storyboard shows OPEN only.

## Quick prompts (copy stems)

**Foreground wipe + push:**
> Soft [object] in extreme foreground [left/right], out of focus. Midground [subject] sharp. Background [room depth] softer. Slow dolly forward through space — foreground element slides faster across frame; background shifts slower; parallax visible.

**Frame in frame:**
> Composed through [doorway/window frame]. Foreground frame edges soft. Midground [subject] in sharp focus beyond the frame. Background [room] visible through opening.

**Negative space (Joe witness):**
> [Subject] small in midground, off-center. Generous empty foreground. Background [domestic detail] breathes. Locked or slow dolly — environment carries emotion.

## Pair with one move only

Layer description **enhances** the single move — it does not add a second camera move.

## Storyboard duty

`storyboard_prompt` must **show** the layer stack at `shot_size_open`. Director cannot invent FG elements at video step that are not in the still.
