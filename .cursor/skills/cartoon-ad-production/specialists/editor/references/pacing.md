# Pacing

**Master timing canon:** [../../../references/timing-foundation.md](../../../references/timing-foundation.md) — macro tiers.

**Micro-pacing (within scene):** [../../../references/micro-pacing-foundation.md](../../../references/micro-pacing-foundation.md) — pattern_id, opener ratio, legato vs staccato.

Pattern picker: [scene-rhythm-patterns.md](scene-rhythm-patterns.md).

Camera beat mapping: [../../../references/camera-grammar-for-gen.md](../../../references/camera-grammar-for-gen.md#beat--camera-intent-editor--dp).

Sequence contrast: [../../../references/shot-sequence-grammar.md](../../../references/shot-sequence-grammar.md).

## Duration tier quick reference

| Tier | Shots | ASL | Gen clips | Peak at | End hold |
|------|-------|-----|-----------|---------|----------|
| 15s | 3–5 | 3.0–3.5s | = shot count | 6–8s | 2–3s |
| 30s | 5–7 | 4.0–4.5s | = shot count | 14–17s | 3–4s |
| 60s | 8–12 | 5.0–6.0s | = shot count | 33–39s | 5–8s |
| 90s | 10–18 | 5.0–7.0s | = shot count | 54–63s | 6–10s |
| 180s | 16–24 | 7.0–9.0s | = shot count | 65–75% | 10–15s |

**15s gen math:** 4 shots × 4s = 16s raw → trim 1s in post to hit 15s.

## Energy curve (assign per shot)

| Segment | Energy | Typical camera |
|---------|--------|----------------|
| Hook | open_invite | `parallax-drift`, `push-in-slow`, MWS |
| Friction | low_tension | `settle-travel-breathe` + `track-lateral` or locked insert |
| Turn | rising | `track-forward`, `handheld-subtle` |
| Relief | release | `pull-out-slow`, negative-space |
| Witness | quiet_hold | `push-in-slow` on object, CU insert |
| CTA | locked | `locked`, headroom |

## Shot duration bands

| Type | Duration | Typical camera |
|------|----------|----------------|
| Insert detail | 1.5–3s | `locked` settle only or `reveal-past-fg` |
| Behavior beat | 3–6s | `push-in-slow` with settle-travel-breathe |
| Scene master | 5–12s | `track-lateral`, `pull-out-slow` |
| Hold / silence | 2–4s | `locked` aligned to silence_beats |
| Dialogue line | 4–8s | `static-observe` settle + micro travel |

## Platform notes

| Platform | Max comfortable single hold | Move travel |
|----------|----------------------------|-------------|
| social vertical (9:16) | 4s without cut | 2.5–3s travel in 4s gen |
| broadcast | 6s | 3–4s travel OK |
| web | 5s | 2.5–3s travel |

## 15s social ad (3–5 shots)

- **One scene** only — hook → peak → end anchor
- ASL **≤3.5s** — no 6s masters
- **3+ different** move families across cut (often: locked → push → locked)
- **≥1 size jump** of 2+ steps (WS → CU insert)
- **One** sonic punctuation + **≥0.5s** silence into end frame
- CTA / end: `locked` with headroom **2–3s**
- Prefer **`locked`** over travel — max **2.5s** travel inside 4s gen

## 30s social ad (5–7 shots)

- 1–2 scenes max
- ASL **~4s**
- Peak at **14–17s**
- **≥1 pull or track** — not all pushes

## 60s shot budget

8–12 shots. Peak ~33–39s. Vary move families every **2** shots.

## 90s shot budget

10–18 shots. Vary move families every **2** shots (not 3). Alternate travel shot with locked insert.

## Ernesto turn

Turn scene gets longest single shot or two-shot sequence (min 8s combined). Favor `pull-out-slow` or `shallow-isolate` push on relief.

## Dull sequence warnings (scrutiny)

- MS → MS → MS without insert
- push → push → push
- All shots same `layer_device`
- No relief/pull shot before CTA
