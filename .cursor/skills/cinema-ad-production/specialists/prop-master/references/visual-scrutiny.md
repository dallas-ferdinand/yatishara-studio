# Visual scrutiny protocol

Text planning is not enough. AI-agentic workflow requires **looking at pixels**.

## When required

| Asset type | Who scrutinizes | After |
|------------|-----------------|-------|
| Prop sheet | prop-master | each image gen round |
| Character ref sheet | character-continuity + prop-master | each round |
| Set establishing still | production-designer + style-supervisor | each round |
| Video clip (Phase E) | director + dp + prop-master | each Seedance output |

## How to view

1. **Local file** — `Read` tool on `.png` / `.jpg` path
2. **Studio asset** — `studio_get_asset` signed URL, then `Read` or browser
3. **Never** approve from filename or prompt alone

## visual_scrutiny block

```json
{
  "mode": "visual_scrutiny",
  "role": "prop-master",
  "asset_id": "",
  "file_path": "",
  "approve": false,
  "checks": {
    "matches_material": true,
    "correct_wear": true,
    "correct_scale": true,
    "no_text": true,
    "no_wrong_background": true,
    "angles_complete": true,
    "style_bible_match": true
  },
  "failures": ["glossy plastic not worn glass", "blue label unreadable but present"],
  "revision_prompt_delta": "",
  "severity": "blocking"
}
```

## Iteration

- `approve: false` + `severity: blocking` → revise prompt, re-execute
- Round 3 still failing → director + Dallas human gate
- `approve: true` → add to `approved_asset_registry`

## Video clip scrutiny (Phase E)

Compare clip to:

- Approved prop sheet (object geometry stable?)
- shot_packet `generation_prompt`
- continuity_locks

Flag drift: wrong mug color, hero product became center ad, face wrong era.
