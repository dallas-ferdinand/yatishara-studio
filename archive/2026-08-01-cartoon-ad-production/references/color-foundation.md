# Color foundation — grade psychology for colorist + director

**Mandatory read:** colorist (Phase C), director (merge), gaffer (continuity with light).  
Shorter canon — color is **supporting** channel; temperature coherence matters more than stylization.

---

## 1. Color and perception (research)

| Source | Finding | Pipeline use |
|--------|---------|--------------|
| **Elliot & Maier** | Color-in-context — same hue, different meaning by scene | Grade serves beat, not fixed LUT |
| **Bordwell** | Color as **motif** across film | Time passage = subtle shift |
| **Grodal** | Unnatural color breaks affordance | Joe: naturalistic only |
| **Seedance anti-gloss** | Hyper-saturation = ad distrust | [cartoon-look-foundation.md](cartoon-look-foundation.md) |

Joe: **documentary-natural** grades — not teal-orange blockbuster, not catalog pop.

---

## 2. Grade registers (align to emotional temperature)

| `grade_register` | Look | Temperature | Use |
|------------------|------|-------------|-----|
| `warm_morning_natural` | Soft warm, lifted shadows | ordinary-morning | Joe default |
| `flat_memory` | Desat slightly, soft contrast | time_passage | Grief/distance |
| `neutral_truthful` | Balanced, skin-true | quiet_hold | Observation |
| `cool_exterior_breath` | Slight cool in shadows | passage / end | Caribbean exterior |
| `friction_tighter` | Contrast + saturation -5% | Ernesto pressure | Brief only |

**Scrutiny blocking:** `warm_morning` + `friction_tighter` same shot; hyper-sat catalog gloss.

---

## 3. Time passage color grammar

| Story shift | Grade shift | Light alignment |
|-------------|-------------|-----------------|
| Morning → afternoon | +warmth, harder shadow | Same window dir |
| Day → years later | Slight desat, softer | Lower sun angle in prompt |
| Memory beat | `flat_memory` | Overcast motivation |

`color_continuity_lock` in shot_packet — grade can't jump without story beat.

---

## 4. Colorist output schema

```json
{
  "grade": "warm_morning_natural",
  "grade_register": "warm_morning_natural",
  "motivation": "natural window morning — not stylized",
  "continuity_lock": "match SC01 window warmth in SC03",
  "research_refs": ["research:color-in-context"]
}
```

**generation_prompt:** one line — `natural warm morning grade, documentary skin tones, no teal-orange stylization`.

---

## 5. Research reference IDs

| ID | Source |
|----|--------|
| `research:color-in-context` | Elliot — context-dependent color meaning |
| `research:grade-time-passage` | Motif shift across beats |

---

## Related

- [lighting-foundation.md](lighting-foundation.md) — Kelvin + grade must agree
- [emotional-temperature.md](emotional-temperature.md)
- [../specialists/colorist/SKILL.md](../specialists/colorist/SKILL.md)
