# Micro-pacing foundation — shot rhythm *within* scenes

**Mandatory read:** editor (Phase C **first**), director (merge), dp, sound-designer, toon-translator (scrutiny).

**Problem this solves:** Two 5-second scenes with three shots each can feel completely different — not because average shot length differs, but because **duration ratios and pattern** differ. Agents often plan equal trims or copy gen defaults without a **scene rhythm pattern**, producing SC01 legato + SC02 staccato by accident.

Companion: [timing-foundation.md](timing-foundation.md) (macro tiers), [shot-sequence-grammar.md](shot-sequence-grammar.md) (energy curve across ad), [sound-foundation.md](sound-foundation.md) (silence ms).

---

## 1. Perceived pace ≠ mathematical ASL

| Scene | Shot durations | Total | Math ASL | **Perceived pace** |
|-------|----------------|-------|----------|-------------------|
| A | **3s + 1s + 1s** | 5s | 1.67s | **Slow** — opener anchors legato |
| B | **1.33s + 1.33s + 1.33s** | 5s | 1.67s | **Fast** — metronomic staccato |
| C | **1s + 1s + 3s** | 5s | 1.67s | **Dramatic** — accelerate then hold (slow-mo read) |
| D | **1s + 2s + 1s** | 5s | 1.67s | **Punch sandwich** — sting, breathe, sting |

**Rule:** The **first shot sets audience tempo expectation** (opening anchor). A long opener makes the whole scene feel slow even if later cuts are 1s. Equal cuts feel faster at the same ASL.

Research: Murch — rhythm is ~70% of editing; cuts are emotional **blinks** separating ideas ([In the Blink of an Eye](https://www.premiumbeat.com/blog/walter-murch-how-to-edit-film/)). Staccato = detached rapid cuts (urgency); legato = extended phrases (contemplation) ([Muriel staccato analysis](https://andrewdavy.wordpress.com/2013/05/22/staccato-editing-style-opening-from-feature-film-muriel-1964/)). Editors shape **tension–release cycles** via timing, pacing, and phrasing (Pearlman, *On Rhythm in Film Editing*).

---

## 2. Fourth clock — micro-pacing (within scene)

| Clock | Owner | Unit |
|-------|-------|------|
| Story | story-architect | scene `duration_sec` |
| **Micro-pacing** | **editor** | **shot `duration_sec` ratios per scene** |
| Editorial (macro) | editor | whole-ad shot list + energy curve |
| Generation | editor + dp | `generation_duration_sec` + `timing_beats` |

**Golden rule:** Before assigning dp/gaffer builds, editor publishes **`scene_rhythms[]`** — pattern id + per-shot `duration_sec` + `rhythm_role` per shot.

---

## 3. Rhythm registers (legato / staccato / phrasing)

| Register | Shot length feel | Cut feel | Use when |
|----------|------------------|----------|----------|
| **legato** | Long phrases; opener ≥50% of scene | Cuts feel like sentence ends | Joe establish, witness hold, geography |
| **staccato** | Equal short beats (≤40% scene each) | Detached, urgent | Ernesto friction, social hook punch |
| **accelerating** | Each shot shorter than prior | Tension climb | Pre-turn, pre-peak |
| **decelerating** | Each shot longer than prior | Release, absorption | Post-peak, end anchor approach |
| **dramatic_hold** | Fast cluster → **long final** | Action → slow-mo / emphasis | Kick-kick-**hold**, witness reveal |

---

## 4. Pattern catalog (scene-level)

Assign **`pattern_id`** on every multi-shot scene.

| pattern_id | Duration template (3-shot) | Perceived read | Story use |
|------------|---------------------------|----------------|-----------|
| `legato_opener` | **3 + 1 + 1** (or 4+1+1) | Slow scene, quick tail stings | Establish person/place before detail cuts |
| `staccato_equal` | **1.33 + 1.33 + 1.33** | Fast, nervous, modern | Friction montage, social energy |
| `fast_fast_slow` | **1 + 1 + 3** | Action → **dramatic hold** | Kick-punch-**slow impact**; slow-mo emphasis |
| `slow_fast_fast` | **3 + 1 + 1** | Same as legato_opener | Geography → two inference punches |
| `accelerate_3` | **2 + 1.5 + 1** | Rising urgency | Approach to peak beat |
| `decelerate_3` | **1 + 1.5 + 2.5** | Settling into truth | Post-peak witness |
| `breathe_punch_breathe` | **2 + 1 + 2** | Controlled contrast | Kuleshov glance → object → hold |
| `single_legato` | **5** (one shot) | Pure hold | End anchor, silent witness |

**Scaling:** For 4+ shots, extend pattern logically — e.g. `staccato_equal` = equal splits; `accelerate_N` = monotonic decrease.

### Opener weight (diagnostic)

```
opener_ratio = shot_1_duration_sec / scene_duration_sec
```

| opener_ratio | Predicted register |
|--------------|-------------------|
| **≥ 0.55** | legato (scene feels slow) |
| **0.35–0.54** | mixed / breathe_punch |
| **≤ 0.34** | staccato or accelerating |

**Scrutiny blocking:** Same ad has adjacent scenes with **contrasting registers** (legato_opener vs staccato_equal) without `pace_shift_intent` in sequence map.

---

## 5. Worked example — your two scenes (fix)

**Broken plan (accidental):**

| Scene | Pattern (unintended) | Shots | Problem |
|-------|---------------------|-------|---------|
| SC01 | `slow_fast_fast` | 3s, 1s, 1s | Legato — feels slow |
| SC02 | `staccato_equal` | 1.33s × 3 | Staccato — feels fast |

Viewer experience: **pacing whiplash** — scene 1 lingers, scene 2 rattles.

**Fixed plan A — consistent staccato friction:**

| Scene | pattern_id | Shots | Register |
|-------|------------|-------|----------|
| SC01 | `staccato_equal` | 1.67s × 3 | staccato |
| SC02 | `staccato_equal` | 1.67s × 3 | staccato |

**Fixed plan B — intentional arc (decelerate into witness):**

| Scene | pattern_id | Shots | Register |
|-------|------------|-------|----------|
| SC01 | `fast_fast_slow` | 1s, 1s, 3s | dramatic_hold (action → hold) |
| SC02 | `decelerate_3` | 1.5s, 2s, 2.5s | decelerating into end anchor |

Document in sequence map: `pace_shift_intent: "SC01 Ernesto friction staccato → SC02 Joe witness legato"`

---

## 6. Shot-level fields (editor → shot_packet)

Every shot in a multi-shot scene gets:

```json
{
  "rhythm": {
    "pattern_id": "slow_fast_fast",
    "role_in_scene": "opener_anchor",
    "position_in_scene": 1,
    "shots_in_scene": 3,
    "perceived_pace_register": "legato",
    "cut_cue": "breathe_end",
    "opener_ratio": 0.6
  }
}
```

### role_in_scene values

| role | Typical duration | Camera gen bias |
|------|------------------|-----------------|
| `opener_anchor` | Longest in scene | slow push or legato drift; full settle-travel-breathe |
| `staccato_beat` | Short equal | **locked-off**; trim hard from 4s gen |
| `acceleration_beat` | Shorter than prior | short track; minimal settle |
| `deceleration_hold` | Longest at end | **slow** travel or locked extended breathe; slow-mo read |
| `punch_beat` | Short between holds | match-action cut; sharp foley |

---

## 7. Bake timing into prompts (generation alignment)

**Editorial `duration_sec` drives CAMERA prose** — not the other way around.

| Editorial duration | `generation_duration_sec` | CAMERA / timing_beats | CONSTRAINTS |
|--------------------|---------------------------|----------------------|-------------|
| **≤1.5s** | 4 (trim 3s+) | `locked-off tripod`; 0.0–0.4s settle; **no travel** | Hard trim; single micro-action |
| **1.5–2.5s** | 4 (trim 1.5–2.5s) | One short move OR locked; travel ≤1.5s | |
| **2.5–4s** | 4–5 | Standard settle-travel-breathe | |
| **≥4s legato** | 5–6 | Full slow dolly; extended breathe 1s+ | |
| **deceleration_hold** (dramatic) | 5–6 | `slow motion weight`; travel at **0.3×** speed language | Hold final frame 1.5s+ |

### generation_prompt timing line (add to CAMERA block)

```
# 1s staccato beat example:
CAMERA: locked-off MS. 0.0–0.3s settle. 0.3–1.0s static hold on hands. No travel. Trim to 1.0s editorial.

# 3s opener anchor example:
CAMERA: MWS→MS. 0.0–0.6s settle. 0.6–2.8s slow dolly forward through space. 2.8–3.0s breathe. Editorial 3.0s.

# fast_fast_slow hold (3s dramatic):
CAMERA: CU locked. 0.0–0.5s settle. 0.5–3.0s slow-motion weighted hold — minimal motion, extended breathe. Editorial 3.0s dramatic hold.
```

**toon-translator blocking:** editorial ≤1.5s but CAMERA has >2s travel phase. **blocking:** legato opener with locked-only 1s insert following — pattern mismatch.

---

## 8. Sound micro-pacing

Align `silence_beats` and foley to **cut cues**:

| rhythm_role | Sound |
|-------------|-------|
| `opener_anchor` | sparse bed; foley late in shot |
| `staccato_beat` | single transient at cut; **short** silence gap (200–400ms) |
| `deceleration_hold` | near-silence through hold; **600–1200ms** pre-cut |
| `punch_beat` | sharp transient; match-action sync |

**Staccato scene:** max **one** foreground transient per shot. **Legato opener:** no transient before 60% of shot elapsed.

---

## 9. Cross-scene consistency (whole ad)

| Check | Rule |
|-------|------|
| Adjacent scenes | Same `perceived_pace_register` OR documented `pace_shift_intent` |
| Energy curve | `staccato_equal` scenes → friction/hook; `legato_opener` → establish/witness |
| Ernesto → Joe handoff | Friction may be staccato; witness **must** decelerate |
| 15s tier | Prefer **one** pattern for whole spot — no SC01/SC02 whiplash |

---

## 10. scene_rhythms[] (editor Phase C output)

Publish **before** parallel dp/gaffer builds:

```json
{
  "scene_rhythms": [
    {
      "scene_id": "SC01",
      "scene_duration_sec": 5,
      "pattern_id": "slow_fast_fast",
      "perceived_pace_register": "legato",
      "opener_ratio": 0.6,
      "shot_durations": [
        { "shot_id": "S01", "duration_sec": 3, "role_in_scene": "opener_anchor" },
        { "shot_id": "S02", "duration_sec": 1, "role_in_scene": "staccato_beat" },
        { "shot_id": "S03", "duration_sec": 1, "role_in_scene": "punch_beat" }
      ],
      "mathematical_asl_sec": 1.67,
      "pace_shift_intent": null
    },
    {
      "scene_id": "SC02",
      "scene_duration_sec": 5,
      "pattern_id": "slow_fast_fast",
      "perceived_pace_register": "legato",
      "opener_ratio": 0.6,
      "shot_durations": [
        { "shot_id": "S04", "duration_sec": 3, "role_in_scene": "opener_anchor" },
        { "shot_id": "S05", "duration_sec": 1, "role_in_scene": "staccato_beat" },
        { "shot_id": "S06", "duration_sec": 1, "role_in_scene": "punch_beat" }
      ],
      "mathematical_asl_sec": 1.67,
      "pace_shift_intent": "mirror SC01 — consistent legato witness grammar"
    }
  ]
}
```

---

## 11. Scrutiny blockers (editor + toon-translator)

- `blocking`: multi-shot scene missing `pattern_id`
- `blocking`: `sum(shot.duration_sec)` ≠ `scene.duration_sec` ±0.2s
- `blocking`: opener_ratio ≥0.55 but `perceived_pace_register: staccato` (label mismatch)
- `blocking`: adjacent scenes different register without `pace_shift_intent`
- `blocking`: editorial ≤1.5s + CAMERA long travel
- `blocking`: `fast_fast_slow` pattern but last shot <2s
- `negotiate`: mathematical ASL matches but pattern_ids differ (viewer whiplash risk)

---

## 12. Research refs

| ID | Source | Use |
|----|--------|-----|
| `research:murch-rhythm` | Murch, *In the Blink of an Eye* | Cuts as blinks; rhythm hierarchy |
| `research:murch-blink` | Murch blink / thought boundary | Cut on breathe / idea completion |
| `research:pearlman-rhythm` | Pearlman, rhythm as tension–release | Pattern phrasing |
| `research:staccato-legato` | Editing theory / Muriel case | Register vocabulary |
| `research:match-on-action` | OpenALG film appreciation | Fast cuts hide on physical action |
| `research:pacing-variation` | BlockReel / editing workflows | Vary pace across film; hold = emphasis |

---

## Related

- [../specialists/editor/references/pacing.md](../specialists/editor/references/pacing.md)
- [../specialists/editor/references/scene-rhythm-patterns.md](../specialists/editor/references/scene-rhythm-patterns.md)
- [timing-foundation.md](timing-foundation.md)
- [cartoon-translation-foundation.md](cartoon-translation-foundation.md)
