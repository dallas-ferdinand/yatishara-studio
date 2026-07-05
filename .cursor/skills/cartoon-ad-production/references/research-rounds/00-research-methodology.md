# Research methodology — layered rounds

Purpose: prevent narrow, single-pass research. Every production problem gets **three passes** before it becomes a gate, specialist rule, or prompt field.

## The three-pass ladder

| Pass | Question | Output |
|------|----------|--------|
| **L1 — Inventory** | What are ALL factors that could affect this outcome? | Topic map + owner specialist |
| **L2 — Mechanism** | How does each factor actually fail or succeed in gen video? | Ranked causes + fixes with sources |
| **L3 — Pipeline binding** | What field, gate, scrutiny item, or MCP call enforces the fix? | Schema field, checklist row, gate regex, model routing rule |

**Rule:** No L3 item without L2 evidence. No L2 claim without L1 category placement.

## Topic map (cartoon ad studio)

| L1 category | Primary owner | L2 deep canon | L3 enforcement |
|-------------|---------------|---------------|----------------|
| **Identity drift** (face, hair, wardrobe) | character-continuity | [01-consistency-root-causes.md](01-consistency-root-causes.md) §Identity | E.5 scrutiny, start-frame workflow, sourceMode framing |
| **Style drift** (line, palette, cel) | style-supervisor | [01-consistency-root-causes.md](01-consistency-root-causes.md) §Style | FULL/PRESERVE split, style anchor, visual_scrutiny |
| **Spatial drift** (walls warp, props morph) | continuity-supervisor + dp | [01-consistency-root-causes.md](01-consistency-root-causes.md) §Spatial | stability line, depth_layers, low motion |
| **Framing drift** (shot size, head room, lead room) | dp + character-continuity | [03-framing-proportions-field-guides.md](03-framing-proportions-field-guides.md) | storyboard FRAME block, shot_size_open/end |
| **Cross-shot drift** (shot N ≠ shot N+1) | editor + continuity-supervisor | [04-multi-layer-consistency-system.md](04-multi-layer-consistency-system.md) | shot ledger, chain re-anchor, batch by shot type |
| **Model mismatch** (wrong I2V for brief) | orchestrator | [02-model-routing-matrix.md](02-model-routing-matrix.md) | `videoModel` override policy |
| **Reference misuse** (face sheets on video) | toon-translator | start-frame-workflow | MCP attach policy, gates |

## Research round log (2026-07)

| Round | Scope | Status |
|-------|-------|--------|
| R1 | Seedance consistency causes + fixes | ✅ [01-consistency-root-causes.md](01-consistency-root-causes.md) |
| R2 | Model comparison (Seedance / Kling / Hailuo) | ✅ [02-model-routing-matrix.md](02-model-routing-matrix.md) |
| R3 | TV animation framing + safe zones | ✅ [03-framing-proportions-field-guides.md](03-framing-proportions-field-guides.md) |
| R4 | Full consistency stack (7 layers) | ✅ [04-multi-layer-consistency-system.md](04-multi-layer-consistency-system.md) |
| R5 | Phase E clip scrutiny rubric | ✅ continuity-supervisor + style-supervisor checklists |
| R6 | Automated gate extensions | ✅ productionGates warnings |

## When to open a new research round

- **>30% shot rejection** on a production → R1 identity + R4 stack audit
- **Inter-shot "different show" feel** → R4 cross-shot + style anchor gap
- **Seedance filter blocks** → R2 model routing, Kling fallback
- **Framing complaints** (floating heads, cropped chins) → R3 field guides
- **New model added to Studio** → R2 comparison before default change

## Specialist research duty

Each specialist **must** cite their L2 canon in scrutiny reports. Vague "looks off" without mechanism category = invalid scrutiny entry.
