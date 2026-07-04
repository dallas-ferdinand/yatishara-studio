# Shot sequence grammar — energy curve, rhythm, dull-sequence flags

**Mandatory read:** editor (Phase C first), director (merge), dp (contrast).  
Links: [perceptual-foundation.md](perceptual-foundation.md) §6–7, [attention-foundation.md](attention-foundation.md), [storytelling-foundation.md](storytelling-foundation.md).

---

## 1. Energy curve — ad arc

Every ad needs a **macro rhythm** — not flat MS-MS-MS.

### Joe 90s standard curve

| Phase | Energy | Shots | Function |
|-------|--------|-------|----------|
| `hook` | High exogenous | S01–S02 | Attention capture + geography |
| `establish` | Medium | S03–S04 | Situation model + identification |
| `friction` | Medium-low | S05–S07 | Quiet conflict, unfinished ritual |
| `peak` | **Highest** | S08–S10 | Peak-end candidate — behavior proof |
| `passage` | Low-medium | S11–S12 | Time passage inference |
| `witness` | Low hold | S13–S14 | Object grammar, silence |
| `end_anchor` | Release | S15+ | Closing revelation setup |

**Editor output:** `energy_curve: ["hook", "establish", "friction", "peak", "passage", "witness", "end_anchor"]`

### Ernesto curve

`hook → friction → pressure → turn → relief → close`

---

## 2. Settle — travel — breathe (micro rhythm per shot)

Every generative shot (typically 4s) has **internal phases**:

| Phase | Time (4s shot) | Camera | Sound |
|-------|----------------|--------|-------|
| **Settle** | 0.0–0.6s | Minimal motion; frame readable | Bed only |
| **Travel** | 0.6–3.2s | ONE move executes | Light foley if scripted |
| **Breathe** | 3.2–4.0s | Hold end frame | **Silence beat** |

`rhythm_pattern: "settle-travel-breathe"` in camera block.

**Cut rule:** Prefer cut **after breathe** on adjacent shot's settle — AToCC attention handoff.

---

## 3. Cut contrast — Kuleshov at sequence level

Adjacent shots should **contrast** on at least one dimension:

| Dimension | Example contrast | Dull if same 3x |
|-----------|------------------|-----------------|
| Shot size | WS → CU | MS → MS → MS |
| Energy | hook → hold | All medium |
| Proxemic zone | public → intimate | All social |
| Motion | push → locked | All drift |
| Sound | foley → silence | Constant bed |
| Temperature | ordinary → quiet_hold | Flat |

**Scrutiny flag:** `dull_sequence: true` when 3+ consecutive shots share size + energy + motion family.

---

## 4. Kuleshov pairs — sequence planning

Plan **before** parallel Phase C builds:

```json
{
  "kuleshov_pairs": [
    {
      "glance_shot_id": "S05",
      "object_shot_id": "S06",
      "projected_register": "unfinished_ritual",
      "cut_attention_cue": "gaze_shift",
      "research_ref": "research:kuleshov-sequence"
    }
  ]
}
```

| Pair type | Glance | Object | Register |
|-----------|--------|--------|----------|
| Ritual incomplete | Hands pause | Second mug | unfinished_ritual |
| Absence | Empty chair | Window | time_passage |
| Witness | Neutral face MWS | Prop insert | quiet_hold |
| Relief | Behavior change | Open door | forward_relief |

---

## 5. Match-action vs intellectual montage

| Cut type | Use | Joe frequency |
|--------|-----|---------------|
| **Match-action** | Hand reaches → hand on mug | **Default** |
| **Graphic match** | Same object, new hands | Time passage |
| **Intellectual** | Object → unrelated geography | Rare — breaks transport |
| **Jump cut** | Time compress | Max 1 per ad |

Joe favors **continuity** over Eisenstein collision — transportation needs coherent world.

---

## 6. Duration grammar

| Shot role | `generation_duration_sec` | Editorial trim |
|-----------|---------------------------|----------------|
| Hook | 4 | May trim settle |
| Quiet hold | 4–6 | Keep full breathe |
| Insert | 4 | Tight |
| Time passage | 4 | Graphic match |
| End anchor | 4–6 | Pre-VO space |

Sum `generation_duration_sec` ≥ story `duration_sec`; editor trims in post.

---

## 7. Peak-end placement in sequence

Align with [storytelling-foundation.md](storytelling-foundation.md):

- **Peak shots** = highest energy + strongest behavior proof in curve
- **End anchor shots** = lowest exogenous motion + witness object + silence
- Narrator VO **after** end anchor in post — not in gen clip

---

## 8. Sequence map template (editor Phase C)

```json
{
  "energy_curve": ["hook", "establish", "friction", "peak", "passage", "witness", "end_anchor"],
  "kuleshov_pairs": [],
  "dull_sequence_flags": [],
  "murch_priority_notes": "Sacrifice screen direction S09 if silence beat needs hold",
  "peak_shot_ids": ["S08", "S09"],
  "end_anchor_shot_id": "S15",
  "timing_budget": {
    "duration_tier": "90s_brand_standard",
    "target_duration_sec": 90,
    "planned_asl_sec": 5.6,
    "shot_count": 16,
    "generation_clip_count": 16,
    "raw_generation_sec": 64,
    "peak_position_sec": 58,
    "end_anchor_start_sec": 80
  },
  "research_refs": ["research:kuleshov-sequence", "research:peak-end-rule", "research:atocc-continuity"]
}
```

---

## 9. Scrutiny blocking

- `blocking`: shot durations sum ≠ `story_packet.duration_sec` ±2s
- `blocking`: shot count outside [timing-foundation.md](timing-foundation.md) tier budget
- `blocking`: `dull_sequence` 4+ shots same register
- `blocking`: Kuleshov object shot before glance shot
- `negotiate`: cut before breathe phase completes

---

## Related

- [../specialists/editor/references/perceptual-editing.md](../specialists/editor/references/perceptual-editing.md)
- [../specialists/editor/references/pacing.md](../specialists/editor/references/pacing.md)
- [camera-grammar-for-gen.md](camera-grammar-for-gen.md)
