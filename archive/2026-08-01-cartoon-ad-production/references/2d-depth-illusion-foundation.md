# 2D depth illusion — research foundation

**Mandatory read:** dp (Phase C), production-designer (Phase B), director (merge), motion-designer (scrutiny).  
**Companion docs:** [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md), [cartoon-staging-foundation.md](cartoon-staging-foundation.md), [camera-grammar-for-gen.md](camera-grammar-for-gen.md), [lighting-foundation.md](lighting-foundation.md).

Purpose: How **flat** art (storyboard stills, 2D layers, AI video) reads as **3D space** — through framing, layering, parallax, light, and camera travel. Synthesizes classic animation craft (Disney multiplane → digital 2.5D → *Klaus* volumetric lighting) for **cartoon ad production** and **generative video** prompts.

---

## 1. The illusion stack (order matters)

Depth is never one trick. Viewers infer volume when **multiple cues agree**:

| Layer | Craft name | What the eye reads | Cartoon ad pipeline |
|-------|------------|-------------------|---------------------|
| **Layout** | Linear / isometric perspective | Floor plane, walls, horizon | `world_packet` set geometry, `staging_depth` |
| **Planes** | FG / MG / BG separation | Objects live at different distances | `depth_layers` in shot packet |
| **Overlap** | Occlusion | Near covers far | Storyboard composition |
| **Scale** | Size on Z | Closer = larger (unless Maintain Size) | Push-in: subject grows in MG |
| **Atmosphere** | Aerial perspective | Far = lower contrast, cooler, softer | BG clause in SCENE block |
| **Light volume** | Form shading on 2D | Curves read as round | Gaffer `light_planes` + value contrast |
| **Motion** | Parallax | Layers slide at different speeds | `parallax_note` + CAMERA move |
| **Focus** | Sharp plane discipline | One story plane tack-sharp | `sharp_plane: midground` |
| **Framing** | Staging + angle | Power, intimacy, corridor depth | `shot_size_open`, angle, `layer_device` |

**Rule:** If layout says "deep room" but camera **zooms** (flat crop) or all layers move together, depth collapses. Spatial camera travel + unequal layer speeds restore it.

---

## 2. Multiplane camera (1930s → 2.5D today)

**History:** Disney's multiplane camera (e.g. *Pinocchio*, 1940) stacked **glass planes** at different heights; the rostrum camera shot downward. Each plane moved independently — foreground fastest, background slowest — producing **parallax** without 3D models.

**Digital equivalent (Toon Boom Harmony, After Effects):**
- Split background art into **foreground / midground / background** (often 3–7 layers).
- Place layers on **Z-axis**; closer layers appear larger unless "maintain size" is used.
- Animate a **virtual camera** through the stack: pan, tilt, **push**, **pull**, short orbit.
- Paint **full bleed** on each layer — panning exposes hidden edges if layers are cropped tight.

**2.5D parallax ratios (starting point for prompts):**

| Camera pan 500px equivalent | FG layer | MG layer | BG layer |
|----------------------------|----------|----------|----------|
| Lateral track | ~100% | ~55–65% | ~25–35% |
| Push-in (dolly) | FG accelerates past lens | Subject grows | BG compresses / stripes shift slower |
| Locked | 0 | Subject motion only | Ambient only |

`parallax_note` in shot packet should name **which layer does what** on the chosen move.

---

## 3. Framing — depth without moving the camera

Staging is how you **compose** depth in a still frame (storyboard / layout). Classic principles apply to cartoon ads:

### Shot scale & depth

| Scale | Depth read | Use |
|-------|------------|-----|
| Extreme wide | Environment dominates; figure small in MG | Establish geography |
| Medium wide | FG device + MG subject + BG room | Default witness staging |
| Medium close | MG fills frame; BG simplified | Ritual, hands, object |
| Close / insert | Shallow stack; BG abstract | Peak-end object beat |

### Angle & power

| Angle | Depth + emotion |
|-------|-----------------|
| **Eye level** | Neutral spatial read |
| **Low angle** | Subject towers; ceiling/BG recedes — power |
| **High angle** | Subject small on floor plane — vulnerability |
| **Over-shoulder** | FG shoulder soft; MG action sharp — depth + POV |
| **Frame-in-frame** | Doorway/window — corridor depth beyond |

### Composition devices (map to `layer_device`)

| Device | Depth mechanism |
|--------|-----------------|
| **Foreground wipe** | Soft FG object at lens; MG sharp beyond |
| **Negative space** | Empty FG pulls MG forward on flat plane |
| **Leading lines** | Counter edge, hallway, jalousie stripes → vanishing cue |
| **Depth corridor** | Hallway/door recedes in BG |
| **Overlap stack** | Character partially behind furniture — instant Z-order |

See [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md) for `layer_device` IDs and scrutiny rules.

---

## 4. Volumetric 2D (*Klaus* lineage)

Hand-drawn animation can read **round** without 3D rigs when **light is layered on the drawing**:

1. **Layout** establishes perspective and plane assignment.
2. **Animation** stays frame-by-frame (no puppet distortion on complex perspective).
3. **Lighting pass** adds up to ~8 **light layers** per shot: ambient occlusion, bounce, rim, specular (eyes), sub-surface, etc.
4. Shapes are **tracked to drawn lines** (bitmap or vector) so light moves with the art.
5. **Selective line removal** — outline dropped where value contrast already sells form.
6. **Compositing** merges character light with painted BG; subtle grain unifies planes.

**Cartoon ad translation (no Klaus toolchain):**
- Gaffer specifies **one key direction** + **rim** + **fill** aligned to `sharp_plane`.
- Style bible defines **flat cel** vs **soft gradient** — not photoreal AO.
- Storyboard still must show **value separation** (MG subject vs BG), not rely on video gen to invent volume.
- **Forbidden:** asking Seedance/Kling to "add Klaus lighting" without SCENE light clauses.

---

## 5. Atmospheric perspective (static depth)

Even without camera move, distance reads through:

| Distance | Treatment |
|----------|-----------|
| Near (MG) | Full saturation, sharp edge, darker contact shadows |
| Mid (BG near) | Slightly desaturated, softer edge |
| Far (BG deep) | Lower contrast, lighter/cooler, simplified detail |

**Prompt clause:** `background soft atmospheric depth, lower contrast than midground subject`.

Works with cartoon flat color if **value step** between MG and BG is explicit.

---

## 6. Motion depth — what moves, what doesn't

| Technique | 2D craft | Gen video prompt |
|-----------|----------|------------------|
| **Parallax scroll** | BG crawls, FG zips | CAMERA: lateral track + layer speeds |
| **Dolly push** | Camera through planes | `move:push-in-slow` — never zoom |
| **Track follow** | Camera travels with walk | `move:track-forward` — furniture slides |
| **Short orbit** | 20–30° arc around subject | `move:orbit-short` + FG parallax |
| **Held pose** | No camera; subject motion only | `move:locked` + observable action |
| **Puppet / subtle** | 2.5D mesh warp on still | **Risky in gen** — prefer small action or frame-by-frame stills |

**Disney lesson:** Complex perspective change needs **new drawings per frame**; subtle drift (breath, blink) can use limited deformation. Gen models approximate this — **one primary camera move + one subject action** per shot.

---

## 7. Depth of field in cartoon vs cinema

| Register | Separation tool |
|----------|-----------------|
| **Live-action / Seedance spatial** | Soft FG, sharp MG, soft BG (stylized bokeh OK) |
| **Flat TV cartoon** | Outline + value contrast; BG flat plane |
| **Prime / family soft** | Gentle BG softness — not anamorphic bokeh |

**Pipeline default:** [cartoon-staging-foundation.md](cartoon-staging-foundation.md) — outline + value first; **optional** soft FG/BG in `depth_layers` when camera travels (parallax shots).

**One sharp story plane** — see [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md). Two competing sharp planes = attention split = scrutiny `blocking`.

---

## 8. Pipeline field mapping

| Research concept | Phase B | Phase C storyboard | Phase C `generation_prompt` |
|------------------|---------|-------------------|----------------------------|
| Layout perspective | `staging_depth` on set | Horizon, floor plane in still | SCENE: room geometry one clause |
| FG/MG/BG | Set offers layers | Full frame shows stack | SCENE: FG/MG/BG each one clause |
| `layer_device` | Doorway, counter edge | Visible in still | SCENE: frame device named |
| Parallax | — | Implied by layer positions | CAMERA: speeds per plane |
| Atmospheric BG | Color script | BG softer in still | SCENE: atmospheric depth |
| Light volume | Gaffer world defaults | Value on subject | SCENE: gaffer line |
| Framing angle | — | `shot_size_open`, angle | CAMERA: height + scale |
| Camera travel | — | **Opening** frame only (E.5) | CAMERA: one move + stability line |

**Storyboard duty:** Still must **prove** the layer stack at `shot_size_open`. Director cannot invent FG wipes at video step that are not in the still.

**Video duty:** Motion sells depth — static zoom does not. Use [camera-grammar-for-gen.md](camera-grammar-for-gen.md) spatial tier moves.

---

## 9. Worked example (witness chair — spatial read)

**Storyboard still (STILL):**  
Medium wide. Soft wooden chair back extreme FG right (out of focus). Witness chair sharp MG. Jalousie stripes BG, softer value. Eye-level. Cartoon look prefix.

**Video prompt (MOTION):**  
```
SCENE: Elderly mother in bed midground soft. Soft chair back foreground right. Witness chair midground sharp. Jalousie background atmospheric depth. Stripe key camera-left.

CAMERA: medium wide → medium on witness chair. Eye-level. 0.0–0.6s locked settle. 0.6–3.2s slow dolly forward through room — foreground chair slides faster; witness chair grows; background stripes shift slower. 3.2–4.0s breathe hold. Stable gimbal through space; parallax visible; no optical zoom.
```

---

## 10. Anti-patterns (scrutiny)

| Anti-pattern | Why depth fails |
|--------------|-----------------|
| Flat pan without layer speed differential | Slideshow — no parallax |
| Zoom instead of dolly | 2D crop — no travel through space |
| Two sharp planes (face + BG detail) | Attention split |
| FG device covers MG action | Inference unreadable |
| `parallax_note` without move in CAMERA | Note is orphan |
| Storyboard flat wall behind subject | No layers to separate in video |
| "Cinematic bokeh" without MG subject | Photoreal drift — cartoon scrutiny blocks |
| Puppet-scale warp on gen video | Perspective breaks — use held pose or new still |

---

## 11. Research bibliography

| ID | Source | Takeaway |
|----|--------|----------|
| `research:multiplane-disney` | Disney multiplane camera (1937–40s) | Independent plane motion → parallax |
| `research:harmony-multiplane` | Toon Boom Harmony Z-depth docs | Digital layer spacing + camera travel |
| `research:2.5d-parallax` | After Effects / 2.5D tutorials | Z-axis layers + virtual camera rig |
| `research:klaus-light-shadow` | SPA Studios / Les Films Du Poisson Rouge (*Klaus*, 2019) | Tracked light layers on 2D art → volumetric read |
| `research:parallax-perception` | Parallax scrolling studies (Fiveable, Moonb) | Speed ratios FG > MG > BG |
| `research:staging-animation` | Staging in animation (composition guides) | Framing, angle, negative space |
| `research:atmospheric-perspective` | Layout / background depth (BINUS DKV) | Far = softer, lower contrast |

---

## 12. Specialist duties (quick)

| Role | Depth duty |
|------|------------|
| **production-designer** | Sets with doorway, corridor, counter FG, window BG — `staging_depth` |
| **location-scout** | Establishing angles that show floor plane + receding space |
| **dp** | `depth_layers`, `layer_device`, `parallax_note`, spatial camera move |
| **gaffer** | `light_planes` aligned to `sharp_plane` |
| **editor** | Energy curve — travel shots need longer editorial legs |
| **director** | Merge SCENE + CAMERA; one move; no zoom |
| **continuity-supervisor** | Screen direction + layer order across cuts |
| **toon-translator** | Ban zoom/pan-flat language; enforce parallax clauses |
