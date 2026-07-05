# Perceptual sound — sound designer

**Deep canon:** [../../../references/sound-foundation.md](../../../references/sound-foundation.md) — Chion full taxonomy, Murch, Thom, Sound Spheres, Bregman.  
Summary: [../../../references/perceptual-foundation.md](../../../references/perceptual-foundation.md) §4–5.

## Builder: extend `shot_packet.sound`

```json
{
  "primary_sound": "soft ceramic mug base contact on wooden table",
  "secondary_sound": "cotton cloth fold off-screen",
  "ambience": "quiet_kitchen_room_tone",
  "bed": "quiet_kitchen_room_tone",
  "sfx": ["ceramic_mug_slide"],
  "silence_beats": ["0.8-1.2s after slide"],
  "sound_sphere": "foley_primary",
  "point_of_audition": "object_intimate",
  "diegetic_class": "on_screen",
  "synchresis_lock": true,
  "stream_priority": "primary_foley",
  "rendering": "close_dry",
  "listening_mode_primary": "causal",
  "synchresis_pair": "visible mug on counter — slide must match ceramic surface DP exposes",
  "off_screen": ["distant_bird_single"],
  "research_refs": ["research:chion-synchresis", "research:murch-dense-clarity"]
}
```

## Chion ensemble rules

1. **Every SFX must have a visible or implied source** in the same shot or prior glance shot (Kuleshov pair).
2. **Sound adds value** — mug slide makes pause *feel* unfinished; don't stack redundant beds.
3. **Reduced listening** — room tone **quality** (warm/cool, near/far) carries temperature without melody.
4. **No vococentrism in gen clip** — no baked dialogue/VO; speech belongs in post.

## Listening mode by beat

| Beat | Primary mode | Design |
|------|--------------|--------|
| Ordinary morning | causal + reduced | Soft bed + one identifiable foley |
| Quiet hold | reduced | Near-silence — **audience hears absence** |
| Unfinished ritual | causal | One sharp foley → silence beat |
| Time passage | semantic (optional) | Clock tick — implies duration without words |
| Relief | reduced | Bed opens — less texture, more air |

## Silence = camera punctuation

| Camera phase | Sound |
|--------------|-------|
| settle (0.0–0.6s) | bed only or near-silence |
| travel | light motion foley if scripted |
| breathe (last 0.8s) | **silence beat** before cut |

## Scrutiny with DP (synchresis)

- `blocking`: SFX for surface camera hides (mug slide but counter not in frame)
- `blocking`: score in shot when `temp:quiet-hold` without director override
- `blocking`: loud bed fights `silence_beats`

## Prompt stem

> Diegetic sound only. [SFX] on visible [surface]. [Duration]s near-silence after [action] — audience hears the pause.
