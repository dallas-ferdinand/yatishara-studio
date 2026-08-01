# Perceptual angles & shot size — DP

Canon: [../../../references/perceptual-foundation.md](../../../references/perceptual-foundation.md) §1–2.

## Builder: add to every `shot_camera_specs` entry

```json
{
  "angle_psychology_rationale": "eye-level peer observation — viewer simulates standing in room, not judging from above",
  "proxemic_zone": "social",
  "gaze_resonance": "observational_third_person",
  "research_refs": ["research:embodied-simulation", "research:proxemics-shot-size"]
}
```

## Gaze resonance levels (Gallese & Guerra)

| Level | Setup | Empathy | Route |
|-------|-------|---------|-------|
| `observational_third_person` | Eye-level, no POV trap | Trust, witness | **Joe default** |
| `over_shoulder` | OTS two-shot | Relational, not face-ad | Care dialogue |
| `subjective_pov` | POV from character | High identification | Rare — Ernesto turn only |
| `withheld_reverse` | No reverse on reaction | Alienation | **Avoid Joe** |

## Angle selection by beat (not decoration)

| Beat | Height | Size | Rationale |
|------|--------|------|-----------|
| Witness hook | eye-level | MWS | Environment + object; viewer explores |
| Friction | eye-level or chair-level | MS | Peer intimacy without dominance |
| Turn (Ernesto) | eye-level → slight low | MS → MWS | Dignity without hero worship |
| Relief | eye-level | MWS → WS pull | Release to geography |
| Insert | counter-level | CU/ECU hands | Causal listening for foley |

## Scrutiny

- `blocking`: low angle on person (Joe — performs power, breaks witness)
- `blocking`: high angle on care scene without friction justification
- `blocking`: subjective POV on Joe witness ad
- `negotiate`: CU face on photographic cast (Seedance + proxemics — use OTS/hands)

## Prompt stem (merge into SCENE/CAMERA)

> eye-level observational camera — viewer stands as quiet witness in the room, not looking down or up at subject
