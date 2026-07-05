# Storytelling foundation — research canon for story-architect + directors

**Mandatory read:** story-architect (Phase A), director-joe, director-ernesto (merge), editor (sequence).  
Companion to [joe-foundation.md](joe-foundation.md) — this is the **academic deep dive** behind witness-object craft.

Joe rule unchanged: **show behavior, never label emotion** — audience completes meaning.

---

## 1. Why stories persuade differently than arguments

| Source | Finding | Pipeline use |
|--------|---------|--------------|
| **Green & Brock** (2000), *JPSP* | **Narrative transportation** — absorption reduces counterarguing; story-consistent beliefs persist | Joe ads transport via **ordinary realism**, not hype |
| **Gerrig** (1993), *Experiencing Narrative Worlds* | Reader becomes **traveler** — temporarily leaves origin world | Witness object anchors return |
| **Bordwell** (2008), *Poetics of Cinema* | Film narration is **inferential** — spectator fills gaps | Observable actions = inference fuel |
| **Graesser et al.** (1994) | **Situation models** built from automatic inferences in first hundreds of ms | One action beat per 4–6s screen time |
| **Kahneman et al.** (1993) | **Peak-end rule** — memory = peak intensity + ending, not average | Design witness peak + closing revelation |
| **Deighton, Romer, McQueen** | Brand stories work when product is **in story world**, not argued | Product as silent witness |

---

## 2. Narrative transportation — the ad mechanism

Transportation = integrative melding of **attention + imagery + affect** (Green & Brock).

### What increases transportation (textual factors → film craft)

| Factor | Film/ad translation | Joe implementation |
|--------|----------------------|------------------|
| **Vivid imagery** | Concrete domestic detail | Worn wood, steam, two mugs |
| **Character identification** | Viewer recognizes own life | Caribbean/domestic specificity without stereotype |
| **Plot coherence** | Cause-effect readable without VO | Behavior proof chains |
| **Emotional engagement** | Temperature via channels, not labels | Silence + pause + object |
| **Realism / perceived realism** | Motivated light, diegetic sound | No ad-staging gloss |

### What reduces transportation

| Anti-transport | Blocking flag |
|----------------|---------------|
| Overt persuasion / sell language | `blocking` in narrator_close |
| Product-as-hero plot | `blocking` in story scrutiny |
| Emotion labels | `blocking` — breaks inference |
| Spectacle camera performing | director-joe reject |
| Cognitive overload (>1 new idea per 6s) | editor scrutiny |

**Story-architect output:** `transportation_hooks[]` — concrete vivid moments that carry viewer into story world.

---

## 3. Show don't tell — inference psychology

Bordwell's **constructivist** model: films cue operations; spectators **infer** beyond given information.

### Inference types in short ads

| Type | Cue | Viewer completes |
|------|-----|------------------|
| **Presupposition** | Two mugs on table | Someone else expected |
| **Bridging** | Hands pause mid-reach | Ritual unfinished |
| **Predictive** | Empty chair + window light | Absence over time |
| **Elaborative** | Same honey jar, new hands | Years passed |

**Rule:** Every `observable_action` must support **at least one** inference type. No action that only restates logline.

### Automatic vs strategic inference

McKoon & Ratcliff / Gerrig: **automatic inferences** form in first ~300ms — basic situation model.  
Strategic inferences need time — **don't require** strategic inference in 4s generative shots.

**Duration rule:** One inferential beat per 4–6 seconds (15s: per 3–4s). See [timing-foundation.md](timing-foundation.md) for tier budgets.

---

## 4. Peak-end rule — ad memory architecture

Kahneman: retrospective judgment dominated by **peak affect** + **end affect**; **duration neglected**.

### Joe ad structure mapped to peak-end

| Phase | Function | Peak-end role |
|-------|----------|---------------|
| SC01–02 | Transport in | Build situation model |
| SC03–04 | **Peak candidate** | Unfinished ritual / time passage — highest behavioral proof |
| SC05–06 | **End anchor** | Closing revelation + witness object unchanged |
| Post VO | End extension | Narrator reveals truth — **not** product sell |

**Story-architect fields:**

```json
{
  "peak_beat": {
    "scene_id": "SC04",
    "observable_action": "hands stop before second mug",
    "inference_type": "bridging",
    "research_ref": "research:peak-end-rule"
  },
  "end_anchor": {
    "scene_id": "SC06",
    "observable_action": "witness object unchanged in frame",
    "closing_line": "one line human truth",
    "research_ref": "research:peak-end-rule"
  }
}
```

**Ernesto route:** peak = friction maximum; end = **behavior change proof** (relief observable).

**Scrutiny blocking:** no identifiable peak beat; ending summarizes plot; brand hard-sell in final frame.

---

## 5. Audience projection — Joe decision engine (#6)

Transportation + inference produce **audience projection**: viewer supplies memory from own life.

| Technique | Observable cue | Projection triggered |
|-----------|------------------|---------------------|
| Incomplete ritual | Second cup, no pour | Their own caregiver |
| Time passage | Same room, different hands | Their own years |
| Object unchanged | Witness prop static | What endured |
| No face ECU sell | Designed cast at MWS+ | Someone they know |

**Forbidden:** casting that forces single demographic reading; dialogue explaining projection.

`audience_projection_prompt`: one line — what memory viewer supplies (internal doc, not generation_prompt).

---

## 6. Seven-beat Joe arc — transportation design

| Beat | Story function | Transportation lever |
|------|----------------|---------------------|
| 1 Ordinary object | Anchor | Vivid object imagery |
| 2 Ordinary life | Identification | Behavior proof |
| 3 Time passes | Plot motion | Inference (change) |
| 4 Different people | Expansion | Social recognition |
| 5 Life changed | Contrast | What changed vs not |
| 6 What never changed | Return anchor | Witness object |
| 7 Human truth | End + revelation | Peak-end close |

Map to scenes in [../specialists/story-architect/references/beat-structures.md](../specialists/story-architect/references/beat-structures.md).

---

## 7. Ernesto arc — transformation transportation

When brief needs **character conversion** (not object memory):

| Beat | Observable proof | Research alignment |
|------|------------------|------------------|
| Friction visible | Behavior, not label | Transportation via conflict |
| Pressure continues | Environment tightens | Situation model update |
| Turn begins | **New behavior** | Story-consistent belief shift |
| Relief proof | Repeated new behavior | End anchor |
| Close | Forward motion | Peak-end |

Route per [ernesto-routing.md](ernesto-routing.md). Ernesto still forbids emotion labels — behavior proof only.

---

## 8. Dialogue and narrator — vococentrism control

Chion **vococentrism**: speech dominates perception.

| Route | Dialogue | Narrator |
|-------|----------|----------|
| Joe | Minimal; interrupted | Single end block; reveals truth |
| Ernesto | Sparse; friction lines | Optional; never explains turn |

**Gen clip:** no baked VO (protects synchresis + inference). Narrator = post only.

---

## 9. Cognitive load in short ads

Miller / Cowan working memory ≈ 4 chunks; ads compress further.

| Load rule | Implementation |
|-----------|----------------|
| **One proposition per shot** | Editor shot list |
| **Max 2 new entities per scene** | Story scrutiny |
| **Repeat witness object** | Continuity lock |
| **No mid-ad premise shift** | Phase A sign-off |

`cognitive_load_score`: low | medium — flag medium if >3 locations or >4 speaking beats.

---

## 10. Story_packet schema extensions

```json
{
  "human_truth": "invisible meaning — internal",
  "witness_object": "honey jar",
  "transportation_hooks": ["steam on mug", "worn counter edge"],
  "peak_beat": { "scene_id": "SC04", "observable_action": "", "research_ref": "research:peak-end-rule" },
  "end_anchor": { "scene_id": "SC06", "closing_line": "", "research_ref": "research:peak-end-rule" },
  "audience_projection_prompt": "viewer remembers their own morning ritual with parent",
  "inference_chain": [
    { "scene_id": "SC02", "cue": "two mugs", "inference": "someone else expected", "type": "presupposition" }
  ],
  "research_refs": ["research:narrative-transportation", "research:bordwell-inference"]
}
```

---

## 11. Director merge — story coherence check

Before Phase A sign-off:

- [ ] `peak_beat` identifiable and observable
- [ ] `end_anchor` reveals truth, not product
- [ ] Every scene has `observable_actions` — zero emotion labels
- [ ] `inference_chain` readable without narrator
- [ ] Witness object present or implied in ≥60% of scenes
- [ ] Transportation hooks vivid and concrete

---

## 12. Research reference IDs

| ID | Source |
|----|--------|
| `research:narrative-transportation` | Green & Brock 2000 |
| `research:gerrig-traveler` | Gerrig 1993 narrative worlds |
| `research:bordwell-inference` | Bordwell constructivist narration |
| `research:graesser-inference` | Automatic situation-model inferences |
| `research:peak-end-rule` | Kahneman peak-end + duration neglect |
| `research:audience-projection` | Joe engine #6 — viewer supplies memory |
| `research:cognitive-load-ads` | Working memory limits in short form |

---

## Related

- [joe-foundation.md](joe-foundation.md) — operational Joe rules
- [emotional-temperature.md](emotional-temperature.md) — channel registers
- [attention-foundation.md](attention-foundation.md) — where eye goes
- [direction-foundation.md](direction-foundation.md) — staging inference cues
- [shot-sequence-grammar.md](shot-sequence-grammar.md) — energy + Kuleshov at sequence level
