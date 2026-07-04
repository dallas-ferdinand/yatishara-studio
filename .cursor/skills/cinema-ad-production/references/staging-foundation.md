# Staging & production design foundation

**Mandatory read:** production-designer, location-scout, prop-master (Phase B), director (world merge).  
Purpose: **Environmental storytelling** — sets as inference engines, not catalogs.

---

## 1. Environmental storytelling (research + craft)

| Source | Principle | Pipeline |
|--------|-----------|----------|
| **Grodal** affordance | Spaces invite or block action | Lived-in vs sterile |
| **Bordwell** inference | Set cues presuppositions | Two mugs = two people |
| **Production design canon** (Lafferty, Ede) | **History in objects** | Wear, patina, use marks |
| **Narrative transportation** | Vivid concrete detail transports | Specific Caribbean domestic |

Joe sets must look **witnessed by life** — not styled for camera.

---

## 2. Lived-in vs ad-staged spectrum

| Signal | Lived-in ✓ | Ad-staged ✗ |
|--------|------------|-------------|
| Surfaces | Wear, rings, stains | Gloss, perfect symmetry |
| Objects | Functional clutter | Prop hero placement |
| Light | Motivated practicals | Unmotivated rim |
| Color | Grade continuity | Hyper-saturated catalog |
| People space | Clear paths of use | No affordance for action |

**Scrutiny blocking:** `staging:catalog` on Joe route.

`lived_in_score: 1–5` — require ≥4 for domestic Joe.

---

## 3. Witness object in set geometry

| Principle | Implementation |
|-----------|----------------|
| **Permanence** | Object has fixed logical home (counter, shelf) |
| **Repeatability** | Same placement across time-passage shots |
| **Non-hero scale** | Normal domestic size — not oversized pack shot |
| **Shared light** | Same window key as people |

`witness_object_placement` in world_packet per scene.

---

## 4. Location count vs duration (cognitive load)

| Duration | Max distinct locations | Notes |
|----------|------------------------|-------|
| 60s | 2 | Combine geography |
| 90s | 3 | Standard Joe |
| 180s | 4–5 | Repeat anchors |

Story-architect + production-designer negotiate — see conflicts.md.

---

## 5. Set archetypes (Joe domestic)

| ID | Inference support | Key props |
|----|-------------------|-----------|
| `set:kitchen-morning` | Routine, care | Mugs, counter, window |
| `set:bedside-quiet` | Intimacy without face sell | Lamp, chair, blanket |
| `set:porch-exterior` | Geography, time | Steps, light, plants |
| `set:dining-memory` | Gathering, absence | Chairs, table setting |

Each archetype includes `window_direction`, `staging_depth`, `witness_zone`.

---

## 6. Time passage — set continuity

What **changes** vs **never changes**:

| Changes | Never changes |
|---------|---------------|
| Hands, faces, wardrobe season | Room geometry |
| Grade warmth (subtle) | Witness object identity |
| Clutter level (more lived) | Window direction |
| Practical lamp on/off | Object home position |

Document in `continuity_bible` + `continuity_locks`.

---

## 7. Prop language vs witness object

| Type | Role | Phase |
|------|------|-------|
| **Witness object** | Story anchor | story_packet |
| **Hero prop** | Visual lock for gen | asset manifest |
| **Set dressing** | Lived-in affordance | world_packet |

Prop-master owns **visual scrutiny** — production-designer owns **spatial logic**.

---

## 8. world_packet staging fields

```json
{
  "sets": [{
    "scene_id": "SC01",
    "archetype": "set:kitchen-morning",
    "witness_object_placement": "counter MG near window",
    "window_direction": "camera-left",
    "staging_depth": "counter-frontal",
    "lived_in_score": 4,
    "inference_cues": ["two mugs", "worn cutting board"],
    "research_refs": ["research:environmental-storytelling", "research:lived-in-affordance"]
  }]
}
```

---

## 9. Research reference IDs

| ID | Source |
|----|--------|
| `research:environmental-storytelling` | Set cues → inference |
| `research:lived-in-affordance` | Grodal + production design |
| `research:witness-object-geometry` | Joe placement grammar |

---

## Related

- [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md)
- [direction-foundation.md](direction-foundation.md)
- [../specialists/production-designer/SKILL.md](../specialists/production-designer/SKILL.md)
