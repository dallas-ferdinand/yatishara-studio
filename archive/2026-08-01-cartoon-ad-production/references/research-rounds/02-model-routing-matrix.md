# Model routing matrix — L2 deep canon

**Explicit answer:** **Keep Seedance 2.0 as default I2V** for this cartoon ad pipeline. Do **not** wholesale-switch to Kling. Use Kling 3.0 **tactically**; consider Hailuo 2.3 for illustration-native hero plates only.

**Why:** Pipeline is start-frame-first + multimodal prop/location refs — Seedance's core strength. Ads are 5–10s keyed clips, not 60s uncut narrative.

Sources: [VibeDex comparison](https://vibedex.ai/blog/seedance-2-vs-kling-3-2026), [AI Journal benchmark](https://aijourn.com/seedance-2-0-vs-kling-3-0-vs-veo-3-1-ai-video-benchmark-test-for-2026/), [Elser AI anime](https://www.elser.ai/blog/kling-vs-seedance-vs-veo-for-anime-videos), [Atlas Hailuo 2.3](https://www.atlascloud.ai/blog/guides/hailuo-2-3-api-guide), Studio `convex/lib/videoModels.ts`.

---

## Model comparison (cartoon-ad dimensions)

| Dimension | Seedance 2.0 | Kling 3.0 I2V | Hailuo 2.3 | Notes |
|-----------|--------------|---------------|------------|-------|
| **Default in Studio** | ✅ Yes | MCP override only | Not integrated | |
| **Start frame I2V** | ✅ first_frame | ✅ required | ✅ | All support I2V |
| **Multimodal refs** | 9 img + 3 vid + 3 audio | Elements (2–4 img) | Subject ref | Seedance most flexible |
| **Character sheets on video** | ❌ filter / drift | Element Binding stronger | Varies | Cast → start frame only |
| **Stylized/cel fidelity** | Good | Good; can feel conservative | **Best anime/illustration** | Hailuo for style > identity |
| **Cross-shot identity** | Strong w/ ref pack | Strong for face-forward | Weaker lock | |
| **Multi-shot in one gen** | Yes | **6 cuts / 15s** | No | Kling for dialogue coverage |
| **Motion at high speed** | Ink breaks | Good physics | Animation principles | Cel = low motion always |
| **Cost per clip** | ~$0.70 tier | ~$1.12 tier | Varies | |
| **Ease of use** | Steep (@ tags) | Simpler prompts | Specialist | |

### Benchmark caveats

Leaderboards measure blind pairwise preference on standardized prompts — **not** multi-clip continuity under a production bible. Real ads sidestep long-sequence drift by **short clips + editorial assembly**.

Vendor blogs conflict. **Workflow architecture beats raw Elo** for cartoon ads.

---

## Routing policy (implement as orchestrator rules)

| Priority | Model | Trigger |
|----------|-------|---------|
| **P0 Default** | `seedance-2.0` | Designed cast, startFrameAssetId ready, prop/loc refs attached, unstyled handoff |
| **P1 Fallback** | `kling-3.0-i2v` | Seedance photoreal filter block; face-forward spokesperson; 6-shot in-scene dialogue sequence |
| **P2 Specialist** | Hailuo 2.3 (future) | Pure illustration hero; identity secondary; env B-roll |
| **Never** | T2V any model | Cast on camera |

### Decision tree

```
Cast on camera?
  NO → Seedance or env plate (no start frame required)
  YES → startFrameAssetId mandatory
    sourceMode photographic?
      YES → storyboard MWS+ face ≤25%; on block → Kling
      NO (designed) → MCU OK on storyboard; Seedance default
    Multi-cut dialogue same location?
      TRY Kling 6-shot OR Seedance multi-shot single pass
    Reference-heavy (sheet + loc + style anchor)?
      Seedance
```

---

## Per-model prompt discipline

### Seedance 2.0

- `@Image1 as first frame` — start frame carries identity
- Prop/location sheets as `[Image N]` refs (Studio MCP attach policy)
- **60–100 words** motion-only when start frame set
- Style anchor as additional ref when grade drifts
- Motion: cel animation → strength low; no dramatic head turns
- Negatives (one per retry): `no wardrobe change`, `no ink flicker`, `no facial distortion`

### Kling 3.0 I2V

- **2500 char cap** — compact element stubs (`kling-prompt-length.md`)
- Element Binding for face-forward when Seedance blocks
- Best for: occlusion-heavy face shots, native multi-shot storyboard
- **No** multimodal ref package like Seedance — start frame + prompt discipline

### Hailuo 2.3 (when added)

- Illustration/anime aesthetic leader
- Use for: style-native env plates, held-pose B-roll
- **Not** default for cast continuity campaigns

---

## Production-state fields (recommended)

```json
{
  "video_model_policy": {
    "default": "seedance-2.0",
    "per_shot_overrides": {
      "S03": { "model": "kling-3.0-i2v", "reason": "seedance_filter_block" }
    }
  },
  "shot_ledger": [
    {
      "shot_id": "S01",
      "model": "seedance-2.0",
      "startFrameAssetId": "...",
      "seed": null,
      "approved_clip_asset_id": "...",
      "rejection_count": 2
    }
  ]
}
```

---

## When to reconsider default model

Re-evaluate Seedance default only if **all** true:

1. >50% shots need Kling fallback on a designed (non-photographic) cast
2. Style anchor + start frame + handoff prompts already optimized
3. Rejection is identity-not-motion (not fixable by E.5 regen)

Until then: **fix pipeline layers** ([04-multi-layer-consistency-system.md](04-multi-layer-consistency-system.md)) before switching models.
