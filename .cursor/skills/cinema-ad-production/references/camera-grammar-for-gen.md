# Camera grammar for AI video generation

**Mandatory read for Phase C:** DP (build), editor (shot rhythm), director (merge), orchestrator (gate). Governs how lens, angle, framing, and **movement** become `storyboard_prompt` + `generation_prompt` for **Seedance 2.0** (cinema production video model).

**Translation layer:** [seedance-translation-foundation.md](seedance-translation-foundation.md) — word budgets, STILL vs MOTION split, field mapping, worked examples.

Research basis: Seedance responds to **one primary camera move per shot**, **slow speed words**, explicit **start/end framing**, **depth layers with parallax**, and **stability constraints** — not vague "cinematic camera movement."

**Companion docs (read with this file):**
- [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md) — FG/MG/BG pyramid, frame devices, parallax per plane
- [shot-sequence-grammar.md](shot-sequence-grammar.md) — energy curve, contrast across cuts, settle-travel-breathe rhythm

## 3D space vs flat 2D (Dallas default)

**Move the camera through the room** — parallax, depth, foreground/background shift. That reads as filmed.

| Tier | Moves | Feels like |
|------|-------|------------|
| **Preferred — spatial** | dolly in/out, track lateral, track forward/back, short crane, short orbit | Camera on a rig traveling in 3D space |
| **Last resort — rotational** | pan, tilt | Camera swivels on a tripod — flat, slideshow, avoid unless no alternative |
| **Forbidden — flat** | zoom in/out, snap zoom | Lens crop on a still point — cheap, AI-default, **never use** |

When tempted to pan across a room → use **`track-lateral`** or **`dolly`** so walls and furniture slide with parallax.

When tempted to zoom on a face → use **`push-in-slow`** (dolly through space toward subject).

Every spatial move prompt should imply depth: *"camera dollies forward through the bedroom; chair grows in foreground; jalousie stripes slide on the back wall."*

## Golden rules (non-negotiable)

1. **One primary move per shot** — never "pan while dollying in and tilting up." Combine at most **move + subject action**, not two camera moves.
2. **Spatial over flat** — default to dolly/track/crane/orbit; **no zoom**; pan/tilt only if DP documents why spatial failed.
3. **Slow by default** — `slowly`, `gradual`, `over the full 4 seconds`. Fast moves warp faces, props, and walls.
4. **Name subject + travel path** — "Camera slowly dollies forward through the room toward the witness chair" not "zoom in on chair" or "pan across room."
5. **Start frame = opening composition** — E.5 storyboard must match the **first frame** of the move. Motion lives in `generation_prompt` only.
6. **Stability line every video prompt** — `stable gimbal motion through space, parallax visible, no optical zoom, no morphing, no floaty drift, no spatial warping.`
7. **Vertical when brief says 9:16** — storyboard aspect must match delivery ratio; I2V models follow input frame shape.

## Prompt formula (5-layer fusion)

Separate **scene** from **camera** so Seedance parses spatial instructions independently:

```
[Look prefix from seedance-cinematic-look.md]

SCENE: [Midground subject + observable action]. [Foreground layer — soft, 1 clause]. [Background layer — context, 1 clause]. [Lighting: gaffer line]. [Sound/color one line each].

CAMERA: [shot_size_open] → [shot_size_end], [lens], [height/angle]. ONE [movement + speed]. [Layer parallax: FG/MG/BG speeds]. [timing_beats: settle-travel-breathe]. [Stability line].

Continuity: [locks]. No on-screen text.
```

**Example (layered spatial dolly — not flat zoom/pan):**

```
… Documentary Caribbean domestic realism.

SCENE: Elderly mother rests in bed midground, sharp. Soft wooden chair back in extreme foreground right, out of focus. Background jalousie stripes and back wall, softer depth. Jalousie stripe key camera-left. Room tone only.

CAMERA: medium wide → medium close on witness chair. 50mm eye-level. 0.0–0.6s locked settle. 0.6–3.2s slow dolly forward through the bedroom — foreground chair back slides faster across frame edge; midground witness chair grows; background stripes shift slower with deep parallax. 3.2–4.0s breathe hold on chair frame. Stable gimbal traveling through space; no optical zoom, no pan, no morphing.
```

## Movement vocabulary

**One per shot.** Prefer **spatial tier** rows first.

### Spatial (default — camera travels in 3D)

| ID | Move | Prompt phrase (copy-ready) | Best for | Max in 4s clip |
|----|------|---------------------------|----------|----------------|
| `move:locked` | Locked-off | locked-off tripod, static camera, no movement | Tableau open, CTA hold | Full shot |
| `move:static-observe` | Static observe | static observational hold, camera locked | Witness pause before spatial move | ≤1s open only |
| `move:push-in-slow` | Dolly in | slow dolly forward through space toward [subject]; parallax on foreground and background | Intimacy, importance, turn beat | 2–3s travel |
| `move:pull-out-slow` | Dolly out | slow dolly backward through space revealing [environment]; parallax widens room | Release, reveal after hold | 2–3s travel |
| `move:track-lateral` | Lateral track | slow lateral tracking shot — camera travels left/right through the space beside [subject] | Follow walk, reveal room depth | Match walk speed |
| `move:track-forward` | Forward track | slow tracking shot — camera travels forward through the room following [subject] | Entry, approach down hallway | Subtle travel |
| `move:track-backward` | Backward track | slow backward tracking — camera retreats through space as [subject] advances | Care moment, give subject space | Subtle travel |
| `move:orbit-short` | Short orbit | slow 20–30° orbit — camera arcs around [subject] through the room | Hero object, witness reveal | ≤30° only |
| `move:crane-up-short` | Short crane | slow crane rise — camera lifts vertically through the space over [scene] | Environment payoff | Minimal height |
| `move:crane-down-short` | Short crane down | slow crane descent into [scene] | Land on witness object | Minimal height |
| `move:handheld-subtle` | Subtle handheld | subtle documentary handheld traveling with [subject]; gentle parallax | Ernesto friction, follow in room | Micro travel only |
| `move:parallax-drift` | Parallax drift | slow lateral drift through space — minimal travel; foreground passes faster than background; midground [subject] holds | Depth emphasis, hook atmosphere | Subtle 1–2s |
| `move:reveal-past-fg` | FG reveal | slow dolly/track forward **past** soft foreground [object] revealing midground [subject] | Motivated discovery, witness reveal | FG must be in storyboard |
| `move:arc-tighten` | Arc tighten | slow 15–25° orbit through room that **ends closer** to [subject] — single continuous arc, not orbit then push | Hero object with spatial wrap | ≤25° total |

### Rotational (last resort — flat, avoid)

| ID | Move | Prompt phrase | When allowed |
|----|------|---------------|--------------|
| `move:pan-left` | Pan left | slow pan left on fixed tripod | Only if subject walks faster than track can match; DP must note in rationale |
| `move:pan-right` | Pan right | slow pan right on fixed tripod | Same — prefer `track-lateral` |
| `move:tilt-up` | Tilt up | slow tilt up on fixed axis | Rare insert; prefer dolly + framing change |
| `move:tilt-down` | Tilt down | slow tilt down on fixed axis | Rare insert |

### Forbidden (blocking)

| ID | Why |
|----|-----|
| `move:zoom-in-slow` | Optical zoom = flat 2D crop. **Always** use `move:push-in-slow` dolly instead. |
| `move:zoom-out-slow` | Same — use `move:pull-out-slow` dolly instead. |

### Other forbidden patterns

| Pattern | Why |
|---------|-----|
| Two moves in one prompt | Jitter, warp, confused output |
| `fast`, `whip pan`, `aggressive` | Spatial tearing |
| Optical zoom / snap zoom | Flat 2D — use dolly instead |
| Pan across room when track/dolly works | Flat slideshow — use spatial travel |
| Orbit >45° | Background distortion |
| Crane + tilt + pan combo | Unstable |
| Zoom + dolly same shot | Double motion conflict |

## Shot size (framing)

| ID | Size | Prompt phrase | Use when |
|----|------|---------------|----------|
| `frame:ews` | Extreme wide | extreme wide shot, environment dominates | Establish location geography |
| `frame:ws` | Wide | wide shot, full room visible | Scene master, geography lock |
| `frame:fs` | Full | full shot, head to toe in frame | Walk, stand, care sequence |
| `frame:mws` | Medium wide | medium wide shot | Two-shot with environment |
| `frame:ms` | Medium | medium shot, waist up | Dialogue, care moments |
| `frame:mcu` | Medium close-up | medium close-up | Hands, face, emotional turn — **storyboard only if cast is `designed`; photographic cast use MWS+ in E.5** |
| `frame:cu` | Close-up | close-up | Witness object, detail, reaction |
| `frame:ecu` | Extreme close-up | extreme close-up, macro detail | Texture, steam, pill, fabric |
| `frame:ots` | Over-the-shoulder | over-the-shoulder shot | Two-person without face-to-lens ad-smile |
| `frame:pov` | POV | POV shot, character eyeline | Daughter looking at parent (rare) |
| `frame:top-down` | Top-down | top-down overhead | Table ritual, hands only |
| `frame:insert` | Insert | insert shot on object | Prop witness beat |

## Camera angle psychology (research)

Canon: [perceptual-foundation.md](perceptual-foundation.md) §1–2; DP detail: [../specialists/dp/references/perceptual-angles.md](../specialists/dp/references/perceptual-angles.md).

| Height | Viewer simulates | Use in ads |
|--------|------------------|------------|
| Low | Looking up — dominance | Witness **objects** only (Joe); not people heroized |
| Eye level | Peer witness | **Default** — trust, observation |
| High | Looking down — vulnerability | Ernesto friction sparingly |
| Counter/chair | Seated peer | Hands, tea, bedside care |

**Proxemics:** shot size = social distance — editor plans jumps; DP executes. ECU on **objects/hands**, not photographic cast faces (Seedance + empathy overload).

## Camera angle / height (IDs)

| ID | Angle | Prompt phrase | Feel |
|----|-------|---------------|------|
| `height:eye-level` | Eye level | eye-level, neutral human perspective | Default story observation |
| `height:counter-level` | Counter | counter-level, table height | Kitchen tea, hands hero |
| `height:chair-level` | Chair | chair-height, seated perspective | Bedroom care, intimacy |
| `height:low` | Low | low angle, camera below subject eye line | Weight, dignity (use sparingly) |
| `height:high` | High | high angle, camera above subject | Vulnerability, withdrawal |
| `height:overhead` | Overhead | overhead, bird's-eye | Pattern, table layout |
| `angle:dutch` | Dutch | slight dutch angle | **Avoid** — AI warps geometry |

## Beat → camera intent (editor + DP)

Editor assigns **camera_intent** per shot in Phase C draft; DP specifies exact move.

| Story beat | Typical sizes | Typical moves | Notes |
|------------|---------------|---------------|-------|
| Hook / witness | MWS → CU | `push-in-slow` dolly through space | Brief tableau hold then **travel** toward witness — never zoom |
| Friction / stillness | MWS, MS | `locked` ≤1s open → `push-in-slow` or `track-lateral` | Stillness is subject; camera still **travels** on beat |
| Turn / care enters | MWS, MS | `track-forward` through room following entry | **Not** pan — camera walks into space with Tricia |
| Relief / behavior proof | MS, MCU | `pull-out-slow` dolly back through room | Parallax widens — spatial release |
| Intercut insert | CU, insert | `crane-down-short` or `push-in-slow` on hands | Kitchen ↔ bedroom = separate gens |
| CTA hold | MS | `locked` | Headroom for lower third in post |

**Variety rule:** In a 4–5 shot social ad, use **at least 3 different** spatial move families across the cut. Max **one** pan/tilt shot in the whole ad unless brief demands otherwise. See [shot-sequence-grammar.md](shot-sequence-grammar.md).

**Layer rule:** Every shot with environment must name **foreground + midground + background** per [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md).

## Storyboard vs video split (E.5 → E)

| Field | Composes | Camera content |
|-------|----------|----------------|
| `storyboard_prompt` | **Opening frame** of the shot | Shot size, lens, height, angle, framing, who/what is in frame — **no travel verbs** unless opening is mid-move (avoid) |
| `generation_prompt` | **Motion from opening frame** | ONE move + timing beats + subject micro-action + stability constraints |

**Seedance I2V:** Opening composition is **frozen** in start frame — choose storyboard framing as the move's **start** position. Push-in storyboard = wider opening; video prompt describes push to closer end. Prop/location refs attach for lock during move.

## Timing beats in generation_prompt

Use **settle-travel-breathe** micro-rhythm (one move, three phases):

```
0.0–0.6s locked settle — viewer reads FG/MG/BG layers.
0.6–3.2s slow dolly forward through the bedroom toward witness chair; FG slides faster, BG stripes shift slower.
3.2–4.0s breathe hold on end frame — action completes before cut.
```

Align `sound.silence_beats` and `music.ducking` to settle and breathe windows — travel carries motion SFX only if scripted.

## Expanded shot_packet.camera block

```json
{
  "camera": {
    "shot_size_open": "mws",
    "shot_size_end": "cu",
    "lens": "50mm",
    "height": "eye_level",
    "angle": "neutral",
    "framing": "negative_space_object",
    "movement": "push_in_slow",
    "movement_subject": "prop:witness-chair",
    "speed": "slow",
    "stability": "gimbal",
    "spatial_motion": true,
    "layer_device": "foreground-wipe",
    "depth_layers": {
      "foreground": "soft chair back entering frame right",
      "midground": "witness chair beside bed",
      "background": "jalousie window stripes"
    },
    "parallax_note": "FG faster, BG slower on dolly forward",
    "rhythm_pattern": "settle-travel-breathe",
    "timing_beats": ["0.0-0.6s settle", "0.6-3.2s dolly + parallax", "3.2-4.0s breathe"],
    "forbidden": ["pan", "tilt", "zoom", "optical_zoom"],
    "repertoire_refs": ["lens:50mm-intimate", "move:push-in-slow", "frame:negative-space-object"]
  }
}
```

Director merge **must** translate this block into prose in `generation_prompt`.

## Route defaults (not static-only)

| Route | Camera personality | Default moves |
|-------|-------------------|---------------|
| **Joe** | Observational witness | Mix `locked`/`static-observe` on object shots + `push-in-slow` on realization beats |
| **Ernesto** | Character conversion | More `track-lateral`, `handheld-subtle` on friction; `pull-out-slow` on relief |

Static tableaus are **one tool**, not the only tool.

## Scrutiny flags (DP + editor + style-supervisor)

| Flag | Condition |
|------|-----------|
| `blocking` | Two camera moves in one shot_packet |
| `blocking` | No `timing_beats` when movement ≠ locked |
| `blocking` | Storyboard aspect ≠ brief aspect ratio |
| `negotiate` | Push-in on 2s shot — not enough travel time |
| `negotiate` | Handheld on ECU product — hurts readability |
| `blocking` | `movement` is pan/tilt/zoom without `spatial_motion: false` rationale from DP |
| `blocking` | No `depth_layers` on shot with visible environment |
| `blocking` | Flat midground-only prompt — no FG or BG clause |
| `blocking` (Phase E) | Clip shows optical zoom, flat pan slideshow, or snap crop — not spatial travel |
| `blocking` (Phase E) | No visible parallax between planes during travel move |
| `blocking` (Phase E) | Clip shows warp, or unmotivated orbit >30° |

| Role | Owns |
|------|------|
| **editor** | Shot order, duration, beat → `camera_intent` hint per shot |
| **dp** | Full `camera` block + repertoire_refs + rationale |
| **gaffer** | Light axis compatible with camera height/move |
| **sound** | Silence beats aligned to camera holds |
| **director** | Fuse into `storyboard_prompt` + `generation_prompt` |
| **style-supervisor** | Stability / anti-warp scrutiny on clips |

## Related docs

- [seedance-cinematic-look.md](seedance-cinematic-look.md) — film grain / anti-gloss **look** prefix (not camera moves)
- [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md) — **FG/MG/BG pyramid, frame devices**
- [shot-sequence-grammar.md](shot-sequence-grammar.md) — **energy curve, cut contrast**
- [../specialists/dp/references/movement.md](../specialists/dp/references/movement.md) — DP quick index
- [../specialists/dp/references/lens-language.md](../specialists/dp/references/lens-language.md) — lens + height + framing IDs
