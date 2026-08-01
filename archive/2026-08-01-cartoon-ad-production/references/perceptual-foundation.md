# Perceptual foundation — research canon for cinema specialists

**Mandatory read:** DP, gaffer, sound-designer, editor (Phase C), directors (merge).  
**Purpose:** Translate established film perception research into **technical shot choices** — not emotion labels (Joe forbids those), but **observable channels** that produce viewer response.

> **Full index:** [research-canon-map.md](research-canon-map.md) — storytelling, attention, direction, staging, sequence, depth, light, sound, color.

This doc is the cross-channel hub for *why* angle, light, sound, and cut order work. Specialists cite `research_ref` IDs in builder output.

---

## 1. Embodied simulation — camera height & angle

**Sources:** Gallese & Guerra, *Embodying Movies* (Cinema journal, 2012); embodied simulation / mirror-neuron film theory; empirical angle studies (Tiemens 1970; Messaris & Gross 1984, *Poetics* — low vs high angle credibility and dominance).

**Core finding:** Viewers do not only *see* camera position — they **simulate** looking up or down at a body in space. Height and angle activate power and vulnerability schemas before narrative context fully lands.

| Camera height | Viewer simulated posture | Perceptual effect | Pipeline use |
|---------------|-------------------------|-------------------|--------------|
| **Low angle** | Looking up at subject | Dominance, weight, dignity, threat | Rare in Joe — witness objects only, not people heroized |
| **Eye level** | Peer encounter | Neutrality, empathy, observational trust | **Default Joe** — camera as witness, not judge |
| **High angle** | Looking down at subject | Vulnerability, diminishment, overview | Ernesto friction before turn — sparingly |
| **Counter/chair level** | Seated peer | Intimacy without face-forward ad-smile | Care scenes, hands, tea, bedside |

**Gallese & Guerra (Hitchcock vs Antonioni):** POV, over-the-shoulder, and full-face address produce different **resonance levels**. Withholding reverse shots (Antonioni-style) **reduces** embodied empathy — useful for alienation, wrong for Joe witness ads. **Joe default:** eye-level observation + OTS when two-shot; avoid FPOV that traps viewer inside character.

**DP output:** `angle_psychology_rationale` — one line citing simulated viewer posture, not character feeling.

---

## 2. Shot size & proxemics — social distance on screen

**Sources:** Hall proxemics (intimate / personal / social / public distance); Zettl, *Sight Sound Motion* — shot size maps to psychological distance.

| Shot size | Social zone | Viewer relation | Ad use |
|-----------|-------------|-----------------|--------|
| EWS / WS | Public | Environment owns frame; human small | Hook geography, time passage |
| MWS / MS | Social | Relationship readable, not invasive | Joe default story observation |
| MCU / CU | Personal | Attention forced to detail/face | Inserts, witness object, hands — **not** photographic cast ECU in Seedance storyboard |
| ECU / macro | Intimate | Texture, ritual, object memory | Mug rim, steam, worn wood — Joe object grammar |

**Rule:** Size change across cuts = **proxemic shift** — viewer feels invited closer or released wider. Editor plans these jumps; DP executes.

---

## 3. Lighting psychology — key-fill ratio & contrast

> **Deep dive:** [lighting-foundation.md](lighting-foundation.md) — Grodal affordance, Huttunen face setups 1–9, Kelvin, Alton sculpture, light planes.

**Sources:** PremiumBeat / industry ratio practice; **Wisessing et al.** (ACM ToG 2019) — brightness + key-fill alter emotion intensity; **Projections** 14(1) — high-contrast lighting amplifies empathic facial mimicry; **Huttunen** (2022) — obscured face = arousal↑ valence↓; **Grodal** (2007) — lighting affordance theory.

**Key-fill ratio** (key brightness : fill brightness):

| Ratio | Look | Perceptual register | Route |
|-------|------|---------------------|-------|
| **2:1** | High-key, soft | Comfort, optimism, domestic safety | Joe morning, relief |
| **4:1** | Natural drama | Readable face, motivated shadow | Default narrative |
| **8:1+** | Low-key, chiaroscuro | Mystery, pressure, interior conflict | Ernesto friction — brief must justify |

**Direction psychology:**
- **Side window key** — truth, time-of-day, ordinary life (Joe)
- **Top/overhead** — exposure, clinical distance — avoid on faces
- **Under-light** — unease — **forbidden** unless horror brief
- **Obscured features in shadow** — viewer discomfort increases (empirical lighting-direction findings)

**Gaffer output:** `key_fill_ratio`, `contrast_register`, `lighting_setup_id`, `color_temp_k`, `motivation_psychology`, `light_planes` (why this light position affects viewer trust).

**Joe rule:** Witness objects share room light — never product-spot hero (unmotivated rim breaks trust schema). Faces use Huttunen **positive setups 1–3** only.

---

## 4. Michel Chion — audio-vision ensemble

> **Deep dive:** [sound-foundation.md](sound-foundation.md) — full Chion taxonomy, Murch dense clarity, Thom screenwriting-for-sound, Sound Spheres, Bregman streams, POA.

**Source:** Chion, *Audio-Vision: Sound on Screen* (1994/2019); Walter Murch foreword; Randy Thom *Designing for Sound*.

**Synchresis:** Image and sound fuse in perception — neither is "background." Sound **adds value** to image (and vice versa). Specialists design **ensemble**, not parallel tracks.

### Three listening modes (Chion)

| Mode | Viewer hears | Designer use |
|------|--------------|--------------|
| **Causal** | "What made that sound?" | Foley from visible surface — DP must expose surface |
| **Semantic** | Meaning of words | Minimal dialogue in Joe; post VO only |
| **Reduced** | Texture, pitch, rhythm | Room tone quality, silence weight |

### Sound points (Chion)

| Type | Definition | Ad craft |
|------|------------|----------|
| **On-screen** | Source visible | Mug slide, pour, footsteps — **priority** |
| **Off-screen** | Source implied in space | Distant bird, hallway door — expands world |
| **Acousmatic** | Heard, not seen | Pre-narrator tension — use sparingly |
| **Synchresis break** | Sound doesn't match image | **Blocking** — breaks trust |

**Vococentrism:** Speech dominates perception when present. Joe ads: **no baked VO** in generative clip — protect synchresis with observable SFX.

**Sound designer output:** `primary_sound`, `sound_sphere`, `point_of_audition`, `diegetic_class`, `synchresis_lock`, `listening_mode_primary`, `synchresis_pair` (which image element this sound anchors).

---

## 5. Silence — designed absence (not empty track)

> **Deep dive:** [sound-foundation.md](sound-foundation.md) §7; [../specialists/sound-designer/references/silence-map.md](../specialists/sound-designer/references/silence-map.md).

**Sources:** Chion on silence; Cage *4′33″* — silence is relational; film sound theory on "impossible true silence" — designers use **near-silence bed** to make absence felt.

Silence in ads is **negative space for the ear** — same grammar as negative-space framing:

| Beat | Silence function | Duration |
|------|------------------|----------|
| Pre-reach | Unfinished ritual | 0.5–1.5s |
| Witness hold | Object earns meaning | 1–2s |
| Post-friction | Before turn | 0.8–1.2s |
| Pre-close | Narrator space in post | 1–3s (no gen VO) |

**Align** `silence_beats` to camera `settle` and `breathe` phases — ear and eye punctuation together.

---

## 6. Kuleshov effect — sequence constructs meaning

**Sources:** Kuleshov/Pudovkin montage; PLOS One replications (2019, 2024); Barratt et al. POV structure analysis.

**Finding:** Neutral face + context shot → viewer projects emotion onto face **from context**, not performance. Meaning lives in **adjacent shot relationship**.

### Ad application (generation planning, not NLE)

Plan **glance → object** pairs across shot list:

| Prior shot (glance) | Next shot (object) | Projected register |
|--------------------|--------------------|--------------------|
| Hands pause | Second mug | Unfinished ritual |
| Empty chair | Window light | Absence / witness |
| Same object, different hands | — | Time passage |
| Face neutral (designed cast) | Witness prop | Care without ad-smile |

**Editor output:** `kuleshov_pair: { glance_shot_id, object_shot_id, projected_register }` per cut.

---

## 7. Walter Murch — Rule of Six (cut priority)

**Source:** Murch, *In the Blink of an Eye* (1992/2001).

When channels conflict at cut, sacrifice in this order (never sacrifice top for bottom):

| Priority | Criterion | Weight | Specialist |
|----------|-----------|--------|------------|
| 1 | **Emotion** (temperature coherence) | ~51% | Director merge |
| 2 | **Story** (beat advances) | ~23% | Editor |
| 3 | **Rhythm** (blink-aligned pace) | ~10% | Editor |
| 4 | Eye-trace | ~7% | DP framing |
| 5 | 2D plane | ~5% | DP screen direction |
| 6 | 3D continuity | ~4% | DP/gaffer |

**Blink rhythm:** Cuts land at **thought completion** — align with camera breathe phase and silence beat.

---

## 8. Cross-channel coherence matrix (Phase C)

Director merge **must** pass this check per shot — no channel contradicts another:

| Temperature register | Camera | Light | Sound | Cut |
|---------------------|--------|-------|-------|-----|
| `temp:ordinary-morning` | eye-level MWS, parallax-drift | 2:1 window key warm | domestic bed, soft foley | straight after establish |
| `temp:quiet-hold` | locked or settle-only | flat soft, low contrast | near-silence 1s+ | hold-no-cut or long take |
| `temp:unfinished-ritual` | MS hands, push slow | side key, 4:1 | mug slide then silence | match-action to insert |
| `temp:time-passage` | WS same angle, new hands | grade shift, lower sun | clock tick distant | time-passage cut |
| `temp:forward-relief` | pull-out-slow, negative space | 2:1 warmer fill | room tone opens | breathe then cut |

**Scrutiny blocking:** any shot where sound promises intimacy but camera is high-angle overview; or light is low-key noir but beat is ordinary morning.

---

## 9. Research reference IDs (cite in builder output)

| ID | Theory |
|----|--------|
| `research:embodied-simulation` | Gallese & Guerra 2012 — viewer simulates camera/body relation |
| `research:angle-dominance` | Low/high angle power schemas |
| `research:proxemics-shot-size` | Shot size = social distance |
| `research:key-fill-empathy` | Wisessing ACM ToG; Projections 2020 — ratio + mimicry |
| `research:low-key-affect` | Low-key lighting + suspense/malice registers |
| `research:grodal-affordance` | Grodal 2007 — lighting mood via affordance |
| `research:huttunen-face-setups` | Huttunen 2022 — positive setups 1–3 |
| `research:alton-motivated` | Alton — motivated sculptural light |
| `research:color-temp-read` | Kelvin psychology 3200K / 5600K |
| `research:chion-synchresis` | Sound adds value to image |
| `research:chion-added-value` | Chion informational/expressive added value |
| `research:chion-empathetic` | Empathetic vs anempathetic sound |
| `research:chion-listening-modes` | Causal / semantic / reduced |
| `research:murch-dense-clarity` | Murch — dense clarity vs clear density |
| `research:murch-visual-enhance` | Sound perceived as better image |
| `research:thom-screenwriting` | Thom — sound in DNA from script |
| `research:sonnenschein-spheres` | Six sound spheres |
| `research:bregman-streams` | Auditory scene analysis |
| `research:kuleshov-sequence` | Meaning from shot juxtaposition |
| `research:murch-rule-of-six` | Cut priority hierarchy |
| `research:murch-blink-rhythm` | Cut on thought completion |
| `research:narrative-transportation` | Green & Brock — story absorption |
| `research:peak-end-rule` | Kahneman — peak + end memory |
| `research:bordwell-inference` | Show don't tell — inference |
| `research:center-bias` | Post-cut gaze centering |
| `research:attentional-synchrony` | Shared gaze in film |
| `research:atocc-continuity` | Smith — cut on attention shift |
| `research:environmental-storytelling` | Set cues → inference |

---

## 10. generation_prompt rule (all specialists)

Translate research into **observable physics** only:

- ✅ "eye-level camera, viewer peer position; soft window key 2:1; mug slide on ceramic then 1.2s near-silence"
- ❌ "sad lighting on lonely character"

---

## Related

- [research-canon-map.md](research-canon-map.md) — **master index all foundations**
- [storytelling-foundation.md](storytelling-foundation.md) — transportation, peak-end, inference
- [attention-foundation.md](attention-foundation.md) — gaze, center bias, AToCC
- [direction-foundation.md](direction-foundation.md) — blocking, merge operations
- [staging-foundation.md](staging-foundation.md) — environmental storytelling
- [shot-sequence-grammar.md](shot-sequence-grammar.md) — energy curve, dull flags
- [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md) — FG/MG/BG
- [lighting-foundation.md](lighting-foundation.md) — **gaffer deep canon**
- [sound-foundation.md](sound-foundation.md) — **sound designer deep canon**
- [color-foundation.md](color-foundation.md) — grade psychology
- [emotional-temperature.md](emotional-temperature.md) — channel registers without emotion labels
- [camera-grammar-for-gen.md](camera-grammar-for-gen.md) — move vocabulary
- [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md) — FG/MG/BG
- [shot-sequence-grammar.md](shot-sequence-grammar.md) — energy curve
- [../specialists/dp/references/perceptual-angles.md](../specialists/dp/references/perceptual-angles.md)
- [../specialists/gaffer/references/perceptual-lighting.md](../specialists/gaffer/references/perceptual-lighting.md)
- [../specialists/sound-designer/references/perceptual-sound.md](../specialists/sound-designer/references/perceptual-sound.md)
- [../specialists/editor/references/perceptual-editing.md](../specialists/editor/references/perceptual-editing.md)
