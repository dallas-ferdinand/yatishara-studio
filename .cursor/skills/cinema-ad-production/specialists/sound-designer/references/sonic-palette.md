# Sonic palette

Deep canon: [../../../references/sound-foundation.md](../../../references/sound-foundation.md).

## Sound Spheres (Sonnenschein) — map per shot

| Sphere | Pipeline field | Joe default |
|--------|----------------|-------------|
| 1 Dialogue | `dialogue` (post only) | Off in gen clip |
| 2 SFX | `primary_sound` | Witness object |
| 3 Foley | `secondary_sound` | Hands, cloth |
| 4 Ambience | `ambience` | Room tone bed |
| 5 Music | `music.presence` | **none** |
| 6 Silence | `silence_beats` | Designed absence |

## Ambience beds (sphere 4)

| ID | Description | rendering | research_ref |
|----|-------------|-----------|--------------|
| `sonic:kitchen-room-tone` | Fridge low hum, distant street | close_dry | `research:sonnenschein-spheres` |
| `sonic:room-tone-quiet` | Near silence, air | close_dry | `research:chion-added-value` |
| `sonic:domestic-ambience` | Light home activity distant | distant | — |
| `sonic:exterior-birds-distant` | Morning birds, soft wind | surround_presence | — |
| `sonic:workshop-hum` | Machine idle, metal tick | close | — |
| `sonic:hvac-low` | Office air | close | — |
| `sonic:rain-light-exterior` | Roof patter if window | off_screen | — |

## SFX — diegetic (sphere 2)

| ID | Action | synchresis surface | research_ref |
|----|--------|-------------------|--------------|
| `sfx:ceramic-mug-slide` | Mug on counter | ceramic + wood | `research:chion-synchresis` |
| `sfx:ceramic-mug-base-contact` | Mug set-down | ceramic + wood | `research:chion-synchresis` |
| `sfx:pour-liquid` | Water, tea, honey | glass/ceramic | — |
| `sfx:footstep-wood-soft` | Interior walk | wood floor visible | — |
| `sfx:door-latch` | Enter/exit | door hardware | — |
| `sfx:cloth-rustle` | Fold shirt, blanket | cotton cloth | — |
| `sfx:clock-tick-distant` | Time passage | clock off-screen | `research:chion-added-value` |
| `sfx:bird-single` | Accent exterior | window implied | — |
| `sfx:breath-exhale` | Visible relief — no voice | face/hands | — |

## Chion diegetic class

| Class | IDs | Use |
|-------|-----|-----|
| `on_screen` | mug, cloth, pour | **Priority** |
| `off_screen` | bird, clock, door | World expansion |
| `acousmatic` | rare tension | Brief only |
| `nondiegetic` | — | **Forbidden Joe** |

## Point of audition

| ID | POA | When |
|----|-----|------|
| `poa:character-close` | Intimate dry | Care, witness touch |
| `poa:observer-neutral` | Balanced room | Morning establish |
| `poa:object-intimate` | Macro foley loud | Mug ritual |
| `poa:distant` | Thin reverb | Time passage |

## Foley priority (domestic Joe ads)

1. Hands on objects (synchresis lock)
2. Footwear on surface
3. Liquid/pour
4. Door/window
5. Cloth

**Foley invisibility:** felt, not noticed — naturalistic timbre, not stylized SFX.

## Stream priority (Bregman)

One foreground transient per beat. Don't stack mug clink + door slam without cut gap 400ms+.

## Avoid in generation prompt

Music unless composer approved. No VO baked in generative clip. No horror stings (codal listening).
