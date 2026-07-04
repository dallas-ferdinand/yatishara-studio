# Emotional temperature (not emotion labels)

**Research basis:** Cross-channel coherence per [perceptual-foundation.md](perceptual-foundation.md) §8 — temperature is how **camera, light, sound, and cut** align to produce viewer response without labeling feelings.

**Deep canons:** [storytelling-foundation.md](storytelling-foundation.md) · [lighting-foundation.md](lighting-foundation.md) · [sound-foundation.md](sound-foundation.md) · [attention-foundation.md](attention-foundation.md) · [research-canon-map.md](research-canon-map.md)

## What the pipeline plans shot-by-shot

**No.** Specialists do **not** write "sad", "happy", "tense" in shot packets or generation prompts. Joe foundation forbids emotion labels.

**Yes.** The pipeline plans **emotional temperature** per shot through observable and sensory channels:

| Channel | Who sets it | Example |
|---------|-------------|---------|
| Behavior | story-architect → shot `action` | "Pauses mid-reach; does not complete" |
| Pace / hold | editor | 3s hold on witness object |
| Sound | sound-designer | Near-silence 1.2s; single mug slide |
| Light | gaffer | Flat overcast vs warm window |
| Music | composer | `music:none` vs soft underscore |
| Camera | dp | Static observe vs push on pause |

Director merge ensures temperature is **coherent** across channels per [perceptual-foundation.md](perceptual-foundation.md) §8 — scrutiny checks **perceptual conflict**, not "is this sad enough."

## Per-shot emotional temperature block (optional in shot_packet)

```json
{
  "emotional_temperature": {
    "register": "quiet_hold",
    "behavior_proof": "hands stop before second mug",
    "sonic_register": "near_silence",
    "light_register": "soft_morning",
    "camera_register": "eye_level_observational",
    "perceptual_goal": "viewer completes unfinished ritual via Kuleshov pair S02→S03",
    "research_refs": ["research:kuleshov-sequence", "research:chion-synchresis"],
    "repertoire_refs": ["temp:quiet-hold", "temp:unfinished-ritual"]
  }
}
```

## Temperature repertoire (not feelings)

| ID | Register | Channels aligned |
|----|----------|------------------|
| `temp:ordinary-morning` | Routine | Warm light, domestic bed, no score |
| `temp:quiet-hold` | Pause before meaning | Silence beat, static camera |
| `temp:unfinished-ritual` | Absence | Two cups, reach, stop |
| `temp:time-passage` | Life moved on | Grade shift, different hands, same object |
| `temp:forward-relief` | Ernesto turn | Behavior change, lighter sound bed |

## Story architect (Phase A)

Scenes include `observable_actions` — that **is** the emotional plan. No separate emotion column in story_packet.

## Phase C

dp, sound, gaffer, editor translate temperature into technical choices. Scrutiny checks **channel conflict** (e.g. fast cut vs silence beat), not "is this sad enough."

## generation_prompt

Describe temperature through action, light, sound, pace — never adjectives the camera cannot see.
