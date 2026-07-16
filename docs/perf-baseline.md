# Performance baseline contract

Hard budgets (see `docs/perf-budgets.json` and `src/lib/performance.ts`):

| Metric | Budget |
| --- | --- |
| LCP p75 | ≤ 2500 ms |
| INP p75 | ≤ 200 ms |
| CLS p75 | ≤ 0.1 |
| Initial route JS | ≤ 180 KB gzip (target; splitting in progress) |
| Initial CSS | ≤ 50 KB gzip (target) |
| Long task / LoAF | ≤ 200 ms |
| Authenticated workspace-ready | ≤ 3500 ms p75 on slow 4G |

## Production snapshot (2026-07-16)

Anonymous sign-in at `https://studio.yatishara.com` (desktop, unthrottled):

- TTFB ≈ 698 ms
- FCP ≈ 1260 ms
- Encoded JS ≈ 346 KB / largest chunk ≈ 205 KB
- Linked CSS+fonts ≈ 187 KB

Field telemetry: `PerformanceReporter` records LCP/INP/CLS/TTFB/LoAF and milestones (`auth-ready`, `workspace-ready`, `first-folder-ready`) into `window.__studioPerf`.

## Verification commands

```bash
npm test
npm run check:perf-budgets
npm run typecheck
```
