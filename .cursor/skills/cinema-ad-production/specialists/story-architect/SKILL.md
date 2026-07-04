---
name: story-architect
description: >-
  Story architect for cinema ad production. Builds logline, scenes, dialogue,
  narrator, and beat timing for 15-180 second ads. Scrutinizes story feasibility.
  Use in cinema-ad-production Phase A. Explicit invocation only.
disable-model-invocation: true
---

# Story Architect

Owns **Phase A narrative draft**. Builder + scrutiny modes.

## Mandatory read

1. [../../references/storytelling-foundation.md](../../references/storytelling-foundation.md) — **research canon**
2. [../../references/timing-foundation.md](../../references/timing-foundation.md) — **duration tier + scene budgets**
3. [../../references/joe-foundation.md](../../references/joe-foundation.md) or Ernesto repertoire
3. [references/beat-structures.md](references/beat-structures.md)
4. [../../references/emotional-temperature.md](../../references/emotional-temperature.md)

## Builder mode

Input: brief intake + director route (Joe/Ernesto)

Output: `story_packet` per [../../references/packet-schemas.md](../../references/packet-schemas.md)

### Builder steps

1. Read [references/beat-structures.md](references/beat-structures.md) + [../../references/timing-foundation.md](../../references/timing-foundation.md) for duration tier
2. Joe route: run 7-question decision engine from [../../references/joe-foundation.md](../../references/joe-foundation.md)
3. Ernesto route: define character arc per director-ernesto repertoire
4. Write scenes with `observable_actions` only — no emotion labels
5. Sum scene `duration_sec` to brief target ±2s
6. Plan **emotional temperature** per scene via observable_actions (see [../../references/emotional-temperature.md](../../references/emotional-temperature.md)) — never emotion labels
7. Draft `closing_line` and optional `narrator_close`
8. Define `peak_beat` + `end_anchor` per [../../references/storytelling-foundation.md](../../references/storytelling-foundation.md)
9. Draft `inference_chain[]` — one presupposition/bridging cue per scene
10. List `transportation_hooks[]` — vivid concrete imagery
11. Set `research_refs` on story_packet

### Builder output

```json
{
  "mode": "build",
  "role": "story-architect",
  "phase": "A",
  "packet": { }
}
```

Cite `repertoire_refs` like `arc:seven-beat-joe`, `duration:90s-standard`.

## Scrutiny mode

Input: merged story_packet from director

Check:

- Scene count vs duration tier ([../../references/timing-foundation.md](../../references/timing-foundation.md) §2)
- Peak beat position within tier % band
- End anchor duration sufficient for tier
- Every scene has observable_actions
- No product-as-hero scenes
- Dialogue minimal, interrupted where natural
- Closing reveals truth (Joe) or forward turn (Ernesto)
- Missing `peak_beat` or `end_anchor`
- `inference_chain` requires narrator to understand

Output scrutiny block per packet-schemas. Flag `blocking` if emotion labels or missing behavior proof.

## References

- [../../references/storytelling-foundation.md](../../references/storytelling-foundation.md)
- [references/beat-structures.md](references/beat-structures.md)
- [references/repertoire.md](references/repertoire.md)
- [references/conflicts.md](references/conflicts.md)
