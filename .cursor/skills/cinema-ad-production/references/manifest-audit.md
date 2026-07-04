# Manifest audit — gate between Phase B and Phase D

After Phase B sign-off, **before any `studio_generate_element_sheet`**, orchestrator launches a manifest audit subagent. Catches missing cast, locations, and props before sheet generation burns credits.

## When

```
Phase B signed off → manifest audit (this doc) → G-manifest pass → Phase D execute
```

## Launch

```
Task(subagent_type="generalPurpose", description="Manifest audit", prompt="...")
```

Save output to `generation/iterations/manifest-audit.json`.

## Input to subagent

- Signed-off `world_packet`
- Signed-off `story_packet`
- `planning-intake.md` (cast list, witness object, locations)
- [asset-manifest.md](asset-manifest.md) rules

## Audit checklist (all must pass)

| Check | Failure if |
|-------|------------|
| **Cast coverage** | Any on-camera character in story lacks manifest row |
| **Second cast** | Parent/patient, child, caregiver mentioned but not in manifest |
| **Locations** | Each distinct set in world_packet lacks `location` row |
| **Intercut sets** | Kitchen + bedroom laugh scene missing either location |
| **Witness prop** | Hero object from story_packet not in manifest as `prop` |
| **Hand props** | Observable actions reference object not in manifest (mug, meds, bag) |
| **sourceMode** | Real person with photos marked `designed`, or fictional marked `photographic` without refs |
| **Tricia lock** | Tricia element reclassified as designed |
| **sheet_required** | Row missing `sheet_required: true` for visual asset types |

## Output schema

```json
{
  "mode": "manifest_audit",
  "approve": false,
  "manifest_rows": [],
  "gaps": [
    {
      "severity": "blocking",
      "issue": "Character C02 (daughter) on camera in SC03 but missing from manifest",
      "fix": "Add character row C02 sourceMode designed with description"
    }
  ],
  "source_mode_routing": []
}
```

## Gate rule

- `approve: true` and zero `blocking` gaps → write `generation/asset-manifest.json` → proceed to Phase D
- Any `blocking` gap → fix manifest → re-audit (do not start sheet gen)

## Orchestrator duty

Do not self-audit. Launch Task subagent. `iteration_log.B` must include:

```json
{
  "event": "manifest_audit",
  "subagent_artifact": "generation/iterations/manifest-audit.json",
  "approve": true
}
```
