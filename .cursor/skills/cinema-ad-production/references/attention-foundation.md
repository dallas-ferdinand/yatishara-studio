# Attention foundation — research canon for DP + editor + director

**Mandatory read:** dp (framing), editor (cuts), director (merge), production-designer (staging).  
Purpose: **Where the eye goes** and **when** — exogenous film craft vs endogenous comprehension.

---

## 1. Core findings (research)

| Source | Finding | Pipeline use |
|--------|---------|--------------|
| **Smith et al.** / **Mital et al.** (2010) | **Attentional synchrony** — viewers look at same places at same times in film | Staging must be unambiguous |
| **Breeden & Hanrahan** (Stanford) | Film gaze density peaks **upper-center**, not geometric center — rule of thirds | Place witness subject on upper third |
| **Tatler** (2007) | **Center bias** on new stimuli — strongest first ~200ms after cut | First frame of each shot matters |
| **Wang et al.** (2012) | Cut resets gaze to center then disperses | Cut on motion/gaze shift (AToCC) |
| **Smith** — AToCC | Continuity editing hides cuts during **attention withdrawal** | Match-action + gaze-led cuts |
| **Loschky et al.** (2020) | **Scene perception & comprehension** — global gist across fixations | One clear subject per shot |
| **Hasson et al.** / **PLOS One** (2015) | **Tyranny of film** — filmmaker control dominates; subtle narrative effects on gaze | Craft leads; story modulates |
| **Cerf et al.** | **Semantic content** outweighs low-level saliency in movies (adults) | Meaningful hands > random motion |

---

## 2. Exogenous vs endogenous attention

| Type | Driver | Film lever |
|------|--------|------------|
| **Exogenous** (bottom-up) | Motion, contrast, cut onset, faces | Push-in, pan, FG wipe |
| **Endogenous** (top-down) | Story goal, viewer schema | Witness object, unfinished ritual |

**Short ads:** Lead with **exogenous** in first 2s (hook); shift to **endogenous** by beat 3 (meaning).

**DP output:** `attention_driver: "exogenous_motion" | "endogenous_semantic" | "hybrid"`

---

## 3. Center bias and rule of thirds

### After every cut (~first 10 frames)

Viewers fixate **screen center** (Tatler; Wang 2012), then disperse.

**Implication:** Put the **primary subject on upper-third intersection** — not dead center catalog style, not bottom edge.

| Placement | Effect |
|-----------|--------|
| Upper-left third | Default subject entry (Western L→R reading) |
| Center | Hook only — fast cut away |
| Lower third | Hands, witness object on counter |
| Edge | FG layer device — soft, not primary |

**storyboard_prompt:** Name subject position: `subject on upper-left third, eyes/hands at sharp focus plane`.

---

## 4. Motion as attention magnet

Motion is among strongest **independent** predictors of gaze in dynamic scenes (Carmi & Itti; Mital 2010).

| Motion type | Attention effect | Gen craft |
|-------------|------------------|-----------|
| **Camera push** | Draws eye to end frame center | Push toward witness object |
| **Subject motion** | Hand reach > background drift | Action in midground |
| **Parallax** | FG moves faster — depth cue | `parallax_note` in camera block |
| **Busy background** | Steals attention | **Blocking** in Joe ads |

**Rule:** One **primary motion vector** per shot — camera OR subject OR FG parallax, not all three competing.

---

## 5. Faces, hands, objects — semantic hierarchy

| Element | Gaze priority | Ad use |
|---------|---------------|--------|
| **Face (direct gaze)** | Highest | Rare Joe — designed cast MWS+ only |
| **Hands acting** | High | Care, ritual, witness |
| **Witness object** | High when static + lit | Object grammar |
| **Text / logo** | High but **forbidden** in gen | Post only |
| **Background motion** | Low unless unmotivated | Flag scrutiny |

**Semantic > saliency:** Bright unrelated object in BG will **not** hold attention as long as acting hands in MG (Cerf; Einhäuser).

---

## 6. AToCC — attentional theory of continuity editing

Smith's AToCC: viewers don't build full 3D model — they track **currently attended features**.

### Cut hides in attention shift when coincident with:

| Cue | Pipeline |
|-----|----------|
| **Gaze shift** | Character looks off → cut to object (Kuleshov) |
| **Motion onset** | Hand starts reach → cut to insert |
| **Saccade / blink** | Cut on breathe phase end |
| **Off-screen sound** | Audio leads eye before cut |
| **Occlusion** | Subject exits frame edge |

**Editor output:** `cut_attention_cue: "gaze_shift" | "motion_onset" | "blink_breathe" | "offscreen_sound"`

**Blocking:** hard cut with no cue + subject position jump = viewer notices edit, transportation breaks.

---

## 7. Attentional synchrony — staging for clarity

When 21 viewers watch same Hollywood clip, gaze clusters tightly (Breeden dataset).

**For gen ads:** Ambiguous staging = **desynchronized** attention = weaker inference.

| Clear staging | Ambiguous staging |
|---------------|-------------------|
| One sharp subject plane | Multiple equal-weight subjects |
| Motivated light on action | Flat even light everywhere |
| FG soft, MG sharp | Everything sharp |
| Witness object in light path | Object in shadow |

**Production-designer:** `staging_clarity: "high"` required for Joe witness beats.

---

## 8. Cognitive load and attention capacity

Cowan ~4 chunks; film **tyranny** reduces need for effortful spatial tracking (PLOS One 2015).

| Load | Symptom | Fix |
|------|---------|-----|
| High | Viewer misses witness object | Widen, simplify BG |
| Medium | OK for time-passage montage | Max 3 elements in frame |
| Low | Quiet hold, single mug | Default Joe insert |

`attention_load: "low" | "medium" | "high"` per shot — editor balances curve.

---

## 9. Hook science (first 2–3 seconds)

| Second | Attention goal | Craft |
|--------|----------------|-------|
| 0–0.5 | Capture exogenous | Motion or contrast (not logo) |
| 0.5–2 | Establish situation | Upper-third subject + geography |
| 2–3 | First inference cue | Witness object or dual mugs |

Align with [storytelling-foundation.md](storytelling-foundation.md) transportation hooks.

---

## 10. Shot_packet attention fields

```json
{
  "camera": {
    "attention_driver": "hybrid",
    "subject_thirds_position": "upper-left",
    "primary_motion_vector": "hand_reach_midground",
    "attention_load": "low",
    "research_refs": ["research:center-bias", "research:attentional-synchrony"]
  }
}
```

**Editor sequence:**

```json
{
  "cut_attention_cue": "motion_onset",
  "from_shot": "S02",
  "to_shot": "S03",
  "research_ref": "research:atocc-continuity"
}
```

---

## 11. Scrutiny blocking rules

- `blocking`: primary subject below lower third on witness beat
- `blocking`: competing motion vectors (pan + busy BG + hand)
- `blocking`: cut with no attention cue and screen direction break
- `negotiate`: face ECU steals attention from witness object (Joe)

---

## 12. Research reference IDs

| ID | Source |
|----|--------|
| `research:center-bias` | Tatler 2007; Wang 2012 post-cut |
| `research:rule-of-thirds-film` | Breeden & Hanrahan upper-center |
| `research:attentional-synchrony` | Mital/Smith gaze clustering |
| `research:motion-attention` | Motion as gaze predictor |
| `research:semantic-over-saliency` | Cerf — meaning beats brightness |
| `research:atocc-continuity` | Smith AToCC cut hiding |
| `research:tyranny-of-film` | PLOS One 2015 filmmaker control |

---

## Related

- [direction-foundation.md](direction-foundation.md) — blocking places attention
- [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md) — FG/MG/BG depth
- [shot-sequence-grammar.md](shot-sequence-grammar.md) — cut rhythm
- [camera-grammar-for-gen.md](camera-grammar-for-gen.md) — move vocabulary
