# Lens, framing, and shot size

Full grammar: [../../../references/camera-grammar-for-gen.md](../../../references/camera-grammar-for-gen.md).

## Focal length

| ID | Focal | Prompt phrase | Use when |
|----|-------|---------------|----------|
| `lens:24mm-environment` | 24mm | 24mm wide-angle | Establish room, isolation in space |
| `lens:35mm-default` | 35mm | 35mm naturalistic lens | Scene masters, two-shots |
| `lens:50mm-intimate` | 50mm | 50mm intimate lens | Observation, witness, hands |
| `lens:85mm-compression` | 85mm | 85mm with shallow depth of field | Distant faces, compression (rare in short ads) |
| `lens:macro-detail` | macro | macro close-up | Steam, texture, worn surface inserts |

## Shot size (framing)

| ID | Size | Prompt phrase |
|----|------|---------------|
| `frame:ews` | Extreme wide | extreme wide shot |
| `frame:ws` | Wide | wide shot |
| `frame:fs` | Full | full shot, head to toe |
| `frame:mws` | Medium wide | medium wide shot |
| `frame:ms` | Medium | medium shot, waist up |
| `frame:mcu` | Medium close-up | medium close-up |
| `frame:cu` | Close-up | close-up |
| `frame:ecu` | Extreme close-up | extreme close-up |
| `frame:ots` | OTS | over-the-shoulder shot |
| `frame:pov` | POV | POV from character eyeline |
| `frame:top-down` | Top-down | top-down overhead |
| `frame:insert` | Insert | insert shot on object |
| `frame:wide-master` | Wide master | wide master, full geography |
| `frame:medium-close-hands` | Hands | medium close on hands and object |
| `frame:negative-space-object` | Negative space | subject small in frame, environment breathes |

## Height / angle

| ID | Height | Prompt phrase |
|----|--------|---------------|
| `height:eye-level` | Eye level | eye-level camera |
| `height:counter-level` | Counter | counter-level, table height |
| `height:chair-level` | Chair | chair-height camera |
| `height:low` | Low | low angle |
| `height:high` | High | high angle |
| `height:overhead` | Overhead | overhead bird's-eye |

**Avoid:** `angle:dutch` — AI geometry warp.

## Open → end framing (for moves)

When movement changes size, DP sets both:

- `shot_size_open` — storyboard composition
- `shot_size_end` — generation_prompt travel target

Example: `mws` → `cu` with `move:push-in-slow` on witness chair.
