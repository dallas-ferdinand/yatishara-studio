# Kling prompt length (gateway)

## What the limit is

**Vercel AI Gateway / Kling** caps the assembled motion prompt at **2500 characters**. This is **not** a Studio UI limit. Seedance does not document the same cap.

Studio sends one string to the gateway:

1. Start-frame prefix (when `startFrameAssetId` set)
2. **`shot_packet.generation_prompt`** — director definition (never delete from packet)
3. Compact element stubs (Kling video) or full element bibles (Seedance / images)
4. `[Image N]` reference tags

## What we do NOT do

- **Do not** shorten `generation_prompt` in the signed shot packet to fit Kling.
- **Do not** drop angle beats, hard-cut timings, or camera grammar from Phase C to “make it fit.”
- **Do not** treat “cut the prompt” as the iteration strategy.

Full definition lives in `generation/v2/iterations/C-r*-director-*.json` and production bible. The shot packet is source of truth.

## What we DO on Kling video

Studio **compact appendix only** for `videoModel: kling-3.0-i2v`:

- Characters with start frame → one-line stub (`likeness locked in start frame`)
- Props/locations → one-line + first sentence of element description + sheet tag
- Prop/location sheets still attach as `[Image N]` refs

If assembled prompt still exceeds 2500 after compact appendix:

1. **Iterate the shot** — tighter beat prose in a new C round (same beats, fewer words)
2. **Regen E.5** if composition changed
3. **Retry video** with full `generation_prompt` from revised packet
4. Log in `production-state.json` → `kling_prompt_iterations[]` with `shot_id`, `chars`, `action`

Pre-flight: `studio_estimate_generation` with `videoModel: kling-3.0-i2v` — if API returns prompt-length error, fix before spend.

## Orchestrator checklist (Phase E + Kling)

| Step | Action |
|------|--------|
| Packet | Keep full `generation_prompt` from signed C |
| Estimate | Same slug + `startFrameAssetId` + `referenceElementIds` |
| Generate | Pass **entire** `generation_prompt` as MCP `prompt` — Studio compacts appendix |
| Fail length | New C micro-round or beat-level tighten — not packet amputation |
| Fail motion | Regen video / storyboard per phase-gates scrutiny loop |
| Audit | Poll `resolvedModel` = `klingai/kling-v3.0-i2v` |

## Rate limit

Gateway: **1 video req/min** below $100 balance. Wait ≥65s between `studio_generate_video` calls.
