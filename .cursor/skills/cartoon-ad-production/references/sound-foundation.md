# Sound foundation — research canon for sound designer + editor

**Mandatory read:** sound-designer (Phase C build), editor (silence + rhythm), director (merge coherence).  
Companion to [perceptual-foundation.md](perceptual-foundation.md) §4–5 — this is the **deep dive**.

Joe rule: **diegetic-first** — no score telling the viewer how to feel.

---

## 1. Why sound is half the experience (research)

| Source | Finding | Pipeline use |
|--------|---------|--------------|
| **Chion** (1994), *Audio-Vision* | **Synchresis** — brain fuses sound+image into one event | Sound must **match** visible surfaces |
| **Chion** | **Added value** — sound changes meaning of image | Room tone shifts care → pressure |
| **Murch** (1995) | Sound virtues perceived **in visual terms** — better sound = better image | Design sound to **clarify** what we see |
| **Murch** | **Dense clarity** vs **clear density** | Layer without mud |
| **Thom** (filmsound.org) | Sound must be in **DNA of film**, not post cosmetic | Phase C before E video |
| **Sonnenschein**, *Sound Design* | **Sound Spheres** — 6 perceptual levels | Map each shot to sphere |
| **Bregman** (1990) | **Auditory scene analysis** — stream segregation | One foreground stream per beat |

---

## 2. Chion taxonomy — full pipeline vocabulary

### 2.1 Synchresis (non-negotiable)

The **involuntary** fusion of sound and image. If a ceramic mug clink doesn't match ceramic timbre, the brain rejects the scene.

**Gating:** `sound.synchresis_lock: true` — every `primary_sound` must name **visible material + action**.

### 2.2 Added value

Sound **adds** to image without duplicating it:

| Type | Example | Ad use |
|------|---------|--------|
| **Informational** | Floor creak reveals weight | Caregiver fatigue |
| **Expressive** | Room tone hollow = empty house | Time passage |
| **Semantic** | Clock tick = ritual unfinished | Witness object beat |

### 2.3 Three listening modes (+ codal)

| Mode | Listener attends to | Ad default |
|------|---------------------|------------|
| **Causal** | What made the sound? | **Primary** — mug, chair, cloth |
| **Semantic** | What does it mean? | Ritual incomplete |
| **Reduced** | Sound as texture | Room tone bed only |

**Codal listening** — recognizes genre cues (horror sting). **Forbidden** in Joe domestic ads.

### 2.4 Vococentrism

Human voice **dominates** the soundscape when present. Plan **ducking** of room tone under dialogue; in silent ads, **no vococentrism** — object sounds lead.

### 2.5 Empathetic vs anempathetic sound

| Type | Behavior | Joe |
|------|----------|-----|
| **Empathetic** | Sound shares scene emotion (tense room tone) | Allowed — diegetic only |
| **Anempathetic** | Sound indifferent to tragedy (cheerful birds over grief) | **Forbidden** unless ironic brief |

### 2.6 Diegetic hierarchy

| Class | Definition | Pipeline |
|-------|------------|----------|
| **On-screen** | Source visible | Mug set-down, cloth fold |
| **Off-screen** | In story space, not in frame | Neighbor door, distant traffic |
| **Acousmatic** | Heard, source never shown | Use sparingly — mystery |
| **Nondiegetic** | Outside story (score) | **Joe: none** |

### 2.7 Point of audition (POA)

Whose ears? **Character POA** vs **neutral observer POA**.

- Joe care scenes: **close POA** — small foley loud, room intimate
- Time passage: **distant POA** — room tone thins, exterior bleed

`point_of_audition: "character_close" | "observer_neutral" | "object_intimate"`

### 2.8 Internal vs external logic

- **External** — sounds obey physics (one room tone)
- **Internal** — subjective distortion (muffled under grief)

Joe default: **external**. Internal only for brief memory beat with director sign-off.

### 2.9 Rendering

How sound **fills** the perceived space:

| Rendering | Quality | Use |
|-----------|---------|-----|
| **Close** | Dry, intimate | Hands on witness object |
| **Distant** | Reverb tail | Empty room time passage |
| **Surround presence** | Off-screen width | Caribbean exterior bleed |

---

## 3. Murch — sound helps the mind see

From *Stretching Sound to Help the Mind See*:

> "Whatever virtues sound brings to film are largely perceived and appreciated by the audience **in visual terms**. The better the sound, the better the image."

**Implication for gen prompts:** Sound line describes what **clarifies the visible action**, not abstract mood.

**Dense clarity** — many distinct elements, each **readable** (clock tick + cloth + breath — not mud).

**Clear density** — sparse elements with **sharp identity** (one ceramic clink in silence).

Joe ads: prefer **clear density** on witness beats; **dense clarity** only in busy domestic backgrounds.

---

## 4. Sound Spheres (Sonnenschein) — six levels

Map `sound_sphere` per shot:

| Sphere | Content | Example |
|--------|---------|---------|
| 1. **Dialogue** | Words | Rare in silent story-ad |
| 2. **Sound effects** | Specific actions | Mug, chair, keys |
| 3. **Foley** | Body/cloth contact | Fabric shift, footsteps |
| 4. **Ambience** | Room tone | Kitchen HVAC, birds |
| 5. **Music** | Score | **Joe: off** |
| 6. **Silence** | Designed absence | Pre-clink hold |

**Rule:** Max **one foreground sphere** (2 or 3) per beat; sphere 4 bed underneath; sphere 6 as punctuation.

---

## 5. Randy Thom — screenwriting for sound

Thom's principles adapted for Phase C (pre-video):

1. **Characters have ears** — even silent ads: design what the *caregiver would hear*
2. **Early collaboration** — sound_packet before E.5/E video, not after
3. **Not cosmetic** — sound choices **change** camera distance (close POA = close mic logic)
4. **Experimentation** — `alt_primary_sound` for scrutiny pass

**Forbidden:** Applying sound ideas only in post; gen video cannot fix missing synchresis in prompt.

---

## 6. Foley invisibility rule

Great foley is **felt, not noticed**. If the viewer thinks "nice sound effect," it failed.

**Prompt language:** `naturalistic ceramic contact on wood surface, not stylized SFX` — not `cinematic whoosh`.

**Material lock:** Match DP surface tags (`wood_table`, `ceramic_mug`, `cotton_cloth`).

---

## 7. Silence as designed instrument

Silence is not absence — it is **negative space** in the mix.

| Type | Duration | Function |
|------|----------|----------|
| **Pre-action** | 0.3–0.8s | Anticipation before witness touch |
| **Post-action** | 0.5–1.2s | Let object land emotionally |
| **Structural** | 1–3s | Time passage breath |

See [../specialists/sound-designer/references/silence-map.md](../specialists/sound-designer/references/silence-map.md).

**Chion:** Off-screen silence can be **more tense** than noise — use before Ernesto turn only with brief approval.

---

## 8. Auditory scene analysis (Bregman) — simplified

The ear **groups** sounds by:

- **Harmonicity** — same pitch family
- **Onset synchrony** — start together
- **Spatial proximity** — same POA

**Pipeline rule:** Don't stack two equal-weight transients in one beat (mug clink + door slam). **Separate** by cut or 400ms+ gap.

`stream_priority: "primary_foley" | "ambience_bed" | "offscreen_event"`

---

## 9. Ad-specific diegetic hierarchy (Joe story-ad)

Priority order when mixing conceptually:

1. **Witness object** foley (mug, cloth, chair)
2. **Hand/body** foley (cloth, breath)
3. **Room tone** (consistent per location)
4. **Off-screen domestic** (distant, low)
5. **Exterior bleed** (Caribbean birds, traffic — world_packet)
6. **Music** — none
7. **Stylized SFX** — none

---

## 10. Character-state sound matrix (cross-channel)

Align with [emotional-temperature.md](emotional-temperature.md):

| `sound_register` | Primary sphere | POA | Silence | Avoid |
|------------------|----------------|-----|---------|-------|
| `soft_morning` | Ambience + soft foley | observer_neutral | Short pre-action | Stings |
| `quiet_hold` | Room tone only | character_close | **Long** post-action | New transients |
| `unfinished_ritual` | Object foley sharp | object_intimate | Pre-clink | Mud |
| `time_passage` | Thin ambience | distant | Structural 1–2s | Busy foley |
| `forward_relief` | Warmer room tone | character_close | Release after hold | Minor key score |
| `friction_pressure` | Off-screen creak? | close | — | Ernesto only |

**Scrutiny blocking:** `quiet_hold` + loud transient stack; `soft_morning` + nondiegetic music; synchresis mismatch (metal mug on ceramic tag).

---

## 11. Sound designer builder output schema

```json
{
  "primary_sound": "soft ceramic mug base contact on wooden table",
  "secondary_sound": "cotton cloth fold off-screen",
  "ambience": "quiet kitchen room tone, distant exterior bird",
  "silence_before_ms": 600,
  "silence_after_ms": 900,
  "sound_sphere": "foley_primary",
  "point_of_audition": "object_intimate",
  "synchresis_lock": true,
  "diegetic_class": "on_screen",
  "stream_priority": "primary_foley",
  "rendering": "close_dry",
  "added_value": "informational — ritual incomplete without dialogue",
  "research_refs": ["research:chion-synchresis", "research:murch-dense-clarity"],
  "repertoire_refs": ["sonic:ceramic-wood-contact", "silence:pre-action-hold"]
}
```

---

## 12. generation_prompt sound line (director merge)

One diegetic sentence — materials + space:

```
Sound: close diegetic ceramic mug contact on visible wood table; soft cotton cloth off-screen; quiet kitchen room tone with faint exterior bird; 0.6s held silence before contact; no score, no stylized SFX.
```

Video gen note: Seedance audio is model-generated — sound line **biases** synchresis in full prompt; editor maps **intended** mix for post if separate audio pass exists.

---

## 13. Editor integration (Murch Rule of Six alignment)

Sound supports Murch priorities:

| Murch priority | Sound contribution |
|----------------|-------------------|
| **Emotion** | Silence length, not score |
| **Story** | Object foley advances ritual |
| **Rhythm** | Transient placement on cut |
| **Eye-trace** | Sound follows visible hand |
| **2D plane** | Pan logic matches POA |
| **3D space** | Ambience rendering |

---

## 14. Research reference IDs

| ID | Source |
|----|--------|
| `research:chion-synchresis` | Chion 1994 — audiovisual fusion |
| `research:chion-added-value` | Chion — informational/expressive |
| `research:chion-empathetic` | Empathetic vs anempathetic |
| `research:murch-dense-clarity` | Murch — layering readability |
| `research:murch-visual-enhance` | Sound perceived as better image |
| `research:thom-screenwriting` | Thom — early sound DNA |
| `research:sonnenschein-spheres` | Six sound spheres |
| `research:bregman-streams` | Auditory scene analysis |

---

## Related

- [perceptual-foundation.md](perceptual-foundation.md) §8 cross-channel matrix
- [../specialists/sound-designer/references/perceptual-sound.md](../specialists/sound-designer/references/perceptual-sound.md)
- [../specialists/sound-designer/references/sonic-palette.md](../specialists/sound-designer/references/sonic-palette.md)
- [../specialists/editor/references/perceptual-editing.md](../specialists/editor/references/perceptual-editing.md)
