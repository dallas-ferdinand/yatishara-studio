# Framing & proportions — L2 deep canon

**Problem:** Inconsistent shot sizes, bad head room, missing lead room, and wrong safe zones make gen output feel amateur and break continuity across shots.

**L1 owners:** dp (camera.shot_size, depth_layers), character-continuity (cast framing vs sourceMode), editor (sequence rhythm), toon-translator (FRAME block validation).

Sources: [AWN field guides](https://www.awn.com/animationworld/animation-layout-graticule-field-guide-and-labeling), [Hanna-Barbera layout notes](http://www.animationmeat.com/pdf/televisionanimation/HB_LayoutNotes.pdf), [Toon Boom safe areas](https://docs.toonboom.com/help/storyboard-pro-25/storyboard/reference/views/stage-view.html), [EditMentor headroom](https://help.editmentor.com/en/articles/6050471-headroom-and-lead-room).

---

## Safe zones (map to storyboard + delivery aspect)

| Zone | Size | Compose here |
|------|------|--------------|
| **Action safe** | ~90% of frame | All character extremities, hero action, witness props |
| **Title safe** | ~80% of frame | Text, logos, lower-thirds (rare in gen — composite in post) |
| **Rule of thirds** | Intersection lines | Eyes, horizon, primary subject |

**Critical:** Storyboard `aspectRatio` **must match delivery** (16:9 CTV, 9:16 social). I2V inherits input frame shape.

### 16:9 widescreen (Studio default)

- Eyes on upper third horizontal for MCU/CU
- Lead room **in front of** gaze direction
- Feet: WS/MWS — feet above bottom action-safe line; don't crop toes at frame edge

### 9:16 vertical

- Re-storyboard at 9:16 — do not crop 16:9 boards
- Head room tighter; verify chin not clipped on CU

---

## Traditional TV animation field system

| Concept | Spec | Gen pipeline mapping |
|---------|------|---------------------|
| **Academy line** | Outer recorded area | Full composition canvas |
| **TV cutoff (inner)** | Broadcast safe | **Action safe ~90%** |
| **12-field grid** | Standard unit; 4:3 cells | Use rule-of-thirds overlay in prompts |
| **Minimum field** | No smaller than **6F** for line weight | Avoid ECU that blows up cel lines |
| **Proportions** | Character heights relate correctly | character-continuity locks head-to-body per style_family |

**H&B rule:** Compose to **cutoff**; draw animation to **academy**; BG to 12F academy. For gen: all hero action inside action safe.

---

## Shot size scale (gen prompt vocabulary)

| Abbrev | Name | Subject placement | Cartoon ad default |
|--------|------|-------------------|-------------------|
| EWS | Extreme wide | Environment dominates | Brand world-establishing |
| WS | Wide / full | Head near top action-safe | Cast + set readable |
| MWS | Medium wide | Waist out of frame | **Default for photographic cast + Seedance** |
| MS | Medium | Waist in frame | Dialogue coverage |
| MCU | Medium close-up | Head near top; lead room | **Designed cast only** |
| CU | Close-up | Eyes upper third | Risky for I2V identity |
| ECU | Extreme close-up | Eyes dominate | **Objects/hands only** — never faces in Seedance |

### sourceMode framing policy

| sourceMode | storyboard shot_size_open | Face in frame |
|------------|---------------------------|---------------|
| **photographic** | MWS minimum | ≤25% frame area; no face-forward ECU |
| **designed** | MCU OK | Readable sitcom expression; no chibi drift |

---

## Head room & lead room

### Head room (vertical)

- Space between top of head and frame edge
- **Too much** = subject floats
- **Too little** = cramped; on CU never crop top of head before chin
- Sitcom talking heads: MCU with eyes on upper third

### Lead room (horizontal / nose room)

- Space **in front of** gaze and movement direction
- Subject facing frame-left → place subject right-of-center
- OTS: frame on speaker side with lead room toward listener

### Push-in shots

- `shot_size_open` **wider** than `shot_size_end`
- Storyboard = **opening** frame (wider)
- `generation_prompt` CAMERA = single push-in verb
- Gates warn if open/end missing or inverted

---

## storyboard_prompt FRAME block (required structure)

```
FRAME: [shot_size] — [rule-of-thirds position] — [lead room direction]
FOREGROUND: [layer or "clear"]
MIDGROUND: [cast pose, expression, witness prop]
BACKGROUND: [location plate, palette lock]
LIGHT: [cel key direction, matches gaffer light_planes]
```

### dp packet fields

```json
{
  "camera": {
    "shot_size_open": "MWS",
    "shot_size_end": "MS",
    "subject_thirds_position": "right_third_looking_left",
    "head_room": "standard",
    "lead_room": "left",
    "depth_layers": { "foreground": "...", "midground": "...", "background": "..." }
  }
}
```

---

## Proportion locks (character-continuity)

Per `style_family` from `cartoon-style-families.md`:

| Family | proportion_style | Gate |
|--------|------------------|------|
| toon-prime | sitcom_standard | head:body ratio stable vs element sheet |
| toon-adult | slightly_elongated | no chibi creep |
| toon-family | rounded_soft | no adult proportions on child designs |

**Scrutiny:** Compare E.5 still to element sheet — silhouette height, head width, limb length. Drift → regen storyboard, not video.

---

## Common framing failures in gen

| Failure | Fix |
|---------|-----|
| Floating head (too much head room) | Tighten FRAME line; specify "standard head room" |
| Cropped chin on CU | Drop to MCU or widen to MWS |
| Subject centered with gaze off-frame | Add lead_room direction |
| 16:9 board cropped to 9:16 | Re-generate E.5 at delivery ratio |
| Push-in storyboard at end size | Regen storyboard at shot_size_open |
| ECU face on photographic cast | Widen to MWS; or Kling fallback |
