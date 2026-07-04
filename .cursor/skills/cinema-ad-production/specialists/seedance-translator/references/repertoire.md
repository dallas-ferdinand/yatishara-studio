# Seedance translator — repertoire

Scrutiny-only role. Cite these IDs in `repertoire_refs` when logging fixes.

| ID | Pattern | Blocking trigger |
|----|---------|------------------|
| `ST-001` | I2V word budget | >100 words |
| `ST-002` | Look prefix split | Full Alexa on `generation_prompt` |
| `ST-003` | SCENE/CAMERA headers | Missing either header |
| `ST-004` | No zoom | Any zoom language |
| `ST-005` | Still vs motion split | Travel verbs in `storyboard_prompt` |
| `ST-006` | FRAME header | Missing on cast storyboard |
| `ST-007` | Single camera move | Two spatial moves in CAMERA block |
| `ST-008` | PRESERVE line | Missing abbreviated preservation on I2V |
| `ST-009` | Emotion leak | Emotion labels in prompts |
| `ST-010` | Prop lock | Refs attached, no PROP LOCK / CONSTRAINTS clause |
| `ST-011` | Timing beats | Spatial move without settle-travel-breathe |
| `ST-013` | Timing overflow | Beat times exceed gen duration |
