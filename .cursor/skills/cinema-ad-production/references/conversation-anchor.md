# Conversation anchor

**Date:** 2026-07-03  
**Who:** Dallas  
**Canonical source:** `/opt/yatishara-studio/.cursor/skills/cinema-ad-production/`  
**MercuryOS mirror:** `/opt/mercuryos/.cursor/skills/cinema-ad-production/` (+ `.agents/skills/`)

## Evolution

1. **experimental-production** — initial scaffold for testing project-level skills (explicit invocation).
2. **cinema-ad-production** — full multi-specialist creative pipeline replacing experimental-production.

## Decisions

- **Location:** `.cursor/skills/cinema-ad-production/`
- **Invocation:** Explicit only (`disable-model-invocation: true`) on orchestrator and all specialists
- **Scope:** Prompt/storycraft for 1–3 minute ads; Production Bible output; Studio handoff documented
- **Director:** Joe Elliott (witness) or Ernesto (conversion) — routed at intake
- **Iteration:** 3 phases × 3 rounds each; builder + scrutiny modes per specialist

## Invoke

```
@cinema-ad-production — [brief or project slug]
```

## Related

- Narrative DNA: [convex/lib/storytellingFoundation.ts](../../../../convex/lib/storytellingFoundation.ts)
- Client delivery (downstream): MercuryOS `yatishara-ad-production`
