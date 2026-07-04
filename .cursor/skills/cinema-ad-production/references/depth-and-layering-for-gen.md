# Depth and layering for generative cinema

**Mandatory read:** dp (Phase C), director (merge), production-designer (staging).  
Links: [attention-foundation.md](attention-foundation.md), [lighting-foundation.md](lighting-foundation.md) §10.

---

## 1. FG / MG / BG pyramid

Film compresses 3D world into 2D — **layering** restores depth and directs attention.

| Layer | Sharpness | Motion speed | Content |
|-------|-----------|--------------|---------|
| **Foreground (FG)** | Soft / bokeh | Faster parallax | Frame device, texture, memory |
| **Midground (MG)** | **Sharp** | Subject speed | Action, faces, hands, ritual |
| **Background (BG)** | Soft / context | Slowest | Geography, window, witness static |

**Rule:** Exactly **one sharp story plane** (usually MG) per shot — two sharp planes = attention split.

---

## 2. Layer devices (frame grammar)

| ID | Device | Gen prompt clause |
|----|--------|-------------------|
| `layer:foreground-wipe` | FG object slides past lens | soft mug rim entering frame left |
| `layer:doorframe` | Door/window frames MG | kitchen doorway frames subject |
| `layer:counter-foreground` | Counter edge FG | worn counter edge soft lower frame |
| `layer:negative-space` | Empty FG — MG isolated | open FG negative space, subject MG |
| `layer:depth-corridor` | Hallway depth | corridor BG, figure MG |

`layer_device` in camera block — one per shot.

---

## 3. Parallax — motion depth cue

When camera moves, layers move at **different speeds** — strong depth affordance (Grodal; Voodla empathy-depth studies).

| Move | FG | MG | BG |
|------|----|----|-----|
| Push-in | Accelerates past | Subject grows | Compresses |
| Track lateral | Fastest slide | Medium | Slow |
| Static | None | Subject motion only | Ambient |

`parallax_note`: "FG mug rim slides faster on push-in"

**Seedance:** Describe parallax in `generation_prompt` CAMERA block — not storyboard still.

---

## 4. Witness object layer placement (Joe)

| Beat | Object layer | Why |
|------|--------------|-----|
| Hook | BG or MG static | Geography + anchor |
| Ritual | MG hands + object | Inference readable |
| Peak insert | MG or ECU object | Peak-end |
| Time passage | BG unchanged | What never changed |
| Close | MG witness | End anchor |

**Never** witness object only in soft FG blur without MG proof in prior shot.

---

## 5. depth_layers schema

```json
{
  "depth_layers": {
    "foreground": "soft mug rim entering frame left",
    "midground": "hands and witness mug on counter",
    "background": "kitchen window soft depth"
  },
  "layer_device": "foreground-wipe",
  "parallax_note": "FG slides faster on slow push-in",
  "sharp_plane": "midground"
}
```

Director merges into SCENE block — FG/MG/BG each **one clause**.

---

## 6. Light planes × depth

Gaffer aligns key with sharp plane:

| sharp_plane | Key targets | Fill |
|-------------|-------------|------|
| midground | Window key on hands/face | Bounce |
| foreground | Silhouette rim only | Low |
| background | Ambient separation | Falloff |

See [lighting-foundation.md](lighting-foundation.md) `light_planes`.

---

## 7. Staging depth — production-designer

Sets must offer **readable layers** — not flat wall behind subject.

| Set feature | Depth role |
|-------------|------------|
| Window in BG | Geography + motivated light |
| Counter FG edge | Layer device |
| Doorway | Frame + corridor depth |
| Practical lamp | MG pool, BG falloff |

`staging_depth: "corridor" | "counter-frontal" | "window-back"` in world_packet.

---

## 8. Scrutiny blocking

- `blocking`: two sharp planes competing (face + BG both tack-sharp)
- `blocking`: witness object only in FG blur on peak beat
- `blocking`: parallax_note without movement in generation_prompt
- `negotiate`: FG device obscures MG action

---

## 9. Research reference IDs

| ID | Source |
|----|--------|
| `research:depth-parallax` | Parallax depth perception in film |
| `research:layer-attention` | FG soft guides MG attention |
| `research:sharp-plane` | Single subject plane discipline |

---

## Related

- [camera-grammar-for-gen.md](camera-grammar-for-gen.md) — moves that create parallax
- [direction-foundation.md](direction-foundation.md) — blocking in depth
