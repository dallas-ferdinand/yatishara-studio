# Perceptual editing — editor

Canon: [../../../references/perceptual-foundation.md](../../../references/perceptual-foundation.md) §6–7.

## Kuleshov pairs (plan at shot-list time)

For each cut A→B, document:

```json
{
  "cut_id": "S02_to_S03",
  "kuleshov_pair": {
    "glance_shot_id": "S02",
    "object_shot_id": "S03",
    "projected_register": "unfinished_ritual",
    "research_ref": "research:kuleshov-sequence"
  }
}
```

**Glance shot** — hands, face (neutral), pause, look off-screen.  
**Object shot** — what context assigns meaning (second mug, empty chair, witness prop).

Neutral performance + strong object = Joe grammar (audience completes feeling).

## Murch Rule of Six — cut decisions

When pacing conflicts with continuity, sacrifice bottom-up:

1. **Temperature coherence** (emotion channel) — never break for geography
2. **Story beat advances**
3. **Rhythm** — blink-aligned; cut on breathe end
4. Eye-trace — viewer focus lands naturally
5. 2D plane / screen direction
6. 3D spatial continuity

## Blink rhythm (4s generative shots)

- Cut **after** camera `breathe` phase and `silence_beats` — thought completes
- Don't cut mid-travel unless Eisenstein-style montage brief (rare in Joe)

## Proxemic cut strategy

Plan **size jumps** that signal invitation or release:

| Transition | Viewer feels |
|------------|--------------|
| WS → CU insert | Attention invited to detail |
| CU → WS | Release to context |
| MS → MS (repeat) | **Dull** — flag in scrutiny |

## Editor scrutiny (perceptual)

- `blocking`: cut breaks Kuleshov pair (object shot before glance)
- `blocking`: 3+ cuts same proxemic zone without insert punctuator
- `negotiate`: cut before silence beat completes (Murch rhythm violation)

## Sequence map output (Phase C)

One JSON block per ad:

```json
{
  "energy_curve": ["hook", "friction", "turn", "relief", "witness", "cta"],
  "kuleshov_pairs": [],
  "murch_priority_notes": "Sacrifice screen direction on S04 if silence beat needs hold"
}
```
