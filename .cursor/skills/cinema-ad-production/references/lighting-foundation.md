# Lighting foundation — research canon for gaffer + DP

**Mandatory read:** gaffer (Phase C build), dp (height/light axis), director (merge coherence).  
Companion to [perceptual-foundation.md](perceptual-foundation.md) §3 — this is the **deep dive**.

Joe rule unchanged: **motivated light only** — no unmotivated product hero rim.

---

## 1. Why lighting is half the emotion (research)

Film lighting is under-theorized in academia but **over-practiced** in craft. These sources ground our pipeline:

| Source | Finding | Pipeline use |
|--------|---------|--------------|
| **Grodal** (2007), *Film Lighting and Mood* | Lighting alters **affordances** — can we read faces, navigate space, feel control? | Obscured face = reduced affordance = pressure without emotion labels |
| **Huttunen** (2022), *Baltic Screen Media Review* | 9 face lighting setups: **1–3 positive**, **4–9 negative** (arousal↑ valence↓) | Joe domestic = setups 1–3 only |
| **Wisessing et al.** (ACM ToG 2019; SAP) | Key brightness + key-fill ratio **alter emotion intensity and appeal** | Ratio is a dial, not decoration |
| **Projections** 14(1) (2020) | High-contrast lighting **amplifies empathic facial mimicry** | Ernesto turn visibility; softer Joe witness |
| **John Alton**, *Painting with Light* (1949) | Light as **sculpture** — shadow carves meaning | Shape vocabulary in prompts |
| **Landau** (2014), *Lighting for Cinematography* | Light invokes **subconscious emotional response** | `motivation_psychology` field |

---

## 2. Motivated vs symbolic light

**Motivated lighting** — source visible or logically implied in scene (window, lamp, practical). Viewer trusts the image. **Joe default.**

**Symbolic lighting** — light stands for abstract idea (hope = shaft of sun). Use sparingly; must still feel motivated in domestic realism.

**Forbidden unmotivated:**
- Product spotlight on witness object
- Rim with no source
- Beauty dish catalog gloss (style-supervisor + seedance anti-gloss)

---

## 3. Key-fill ratio — the primary emotional dial

| Ratio | Style | Key:fill stops | Perceptual register | Joe | Ernesto |
|-------|-------|----------------|---------------------|-----|---------|
| **2:1** | High-key soft | Fill 1 stop under key | Comfort, ordinary, readable | **Default morning** | Relief |
| **4:1** | Naturalistic | Fill 2 stops under | Truthful room, shape on face | Care scenes | Friction |
| **6:1** | Dramatic | Fill 2.5+ stops under | Pressure, focus | Rare insert | Turn |
| **8:1+** | Low-key chiaroscuro | Deep shadow side | Mystery, malice, distress | **Avoid** | Brief-only |

**Empirical note:** Brighter key conditions increased **appeal** across Wisessing experiments; ratio shifts **emotion intensity** without changing performance.

**Gaffer output:** `key_fill_ratio: "2:1"`, `contrast_register: "high_key_comfort"`.

---

## 4. Color temperature (Kelvin psychology)

| Kelvin | Source | Perceptual read | Ad use |
|--------|--------|-----------------|--------|
| **2700–3200K** | Tungsten, lamp, fire | Warmth, intimacy, evening safety | Kitchen lamp, bedside practical |
| **4000–4500K** | Mixed interior | Neutral domestic | Fluorescent + window mix |
| **5600K** | Daylight, window | Truth, morning, clarity | **Joe window key** |
| **6500K+** | Overcast, shade | Cool memory, distance | Time-passage grief beat |

**Rule:** One motivated temperature per shot. Mixed motivated (window 5600 + lamp 3200) = realism; unmotivated color clash = distrust.

**Prompt stem:** `motivated soft window daylight approximately 5600K camera-left; warm bounce fill from interior walls`.

---

## 5. Face lighting setups — Huttunen study (research IDs)

Nine setups tested on **expressionless face**. Use IDs in `lighting_setup_id`:

### Positive setups (1–3) — Joe domestic default

| ID | Setup | Description | Valence | Use |
|----|-------|-------------|---------|-----|
| `light-setup:1-front-soft` | Frontal soft | Even face read, low arousal | Highest pleasantness | Rare — flat but safe |
| `light-setup:2-45-rembrandt` | 45° key | **Rembrandt triangle** on shadow cheek | High | **Default character care** |
| `light-setup:3-90-split` | 90° side | Classic split — one hemisphere lit | High (surprising) | Dramatic but readable |

### Negative setups (4–9) — use only when brief demands pressure

| ID | Setup | Effect | Avoid in Joe |
|----|-------|--------|--------------|
| `light-setup:4-under` | Underlight | Arousal↑, pleasantness↓↓ | **Always** |
| `light-setup:5-overhead-hard` | Top hard | Eye shadow, mistrust | Character faces |
| `light-setup:6-underexposed` | Face too dark | Affordance break | Unless silhouette beat |
| `light-setup:7-underexposed-catch` | Dark + eye light | Eerie | Horror only |
| `light-setup:8-silhouette` | Backlit silhouette | Intimidating contour | Witness **object** only |
| `light-setup:9-silhouette-eyes` | Silhouette + catch | Highest arousal | Rare |

**Joe ads with people:** `light-setup:2-45-rembrandt` or `light-setup:3-90-split` at **2:1–4:1**, never 4–9 on faces.

**Grodal affordance:** Setups 4–9 impede face reading → viewer feels less **in control** → distress/fear registers without labeling emotion in prompt.

---

## 6. Classic portrait patterns (craft + research-aligned)

| Pattern | Key angle | Fill | Best for |
|---------|-----------|------|----------|
| **Rembrandt** | 45° high | Soft bounce | Character dignity, care |
| **Loop** | 30–45° | Moderate | Friendly domestic |
| **Butterfly** | Front high | Strong fill below | Glamour — **avoid Joe** |
| **Split** | 90° side | Minimal | Tension, two-faced theme |
| **Broad vs short** | Key on near or far cheek | — | Near cheek lit = openness |

**Outside-in rule** (character-driven lighting): place primary source **through** window/doorway architecture — motivated, dimensional, production-efficient. Matches Caribbean/domestic locations in world_packet.

---

## 7. Light and shadow as sculpture (Alton)

Alton treated light as **paint** and shadow as **shape**:

- Shadow **reveals** object volume (witness chair grain, mug ceramic)
- Single-source side light = texture readable for prop scrutiny
- Negative fill (flag on fill side) increases ratio without new sources

**Prompt vocabulary:** `directional motivated window key sculpting object texture; soft bounce fill preserving shadow side shape; no flat overhead beauty light`.

---

## 8. Time passage — lighting continuity

| Story beat | Light shift | Continuity lock |
|------------|-------------|-----------------|
| Morning → afternoon | Harder angle, warmer | Same window direction |
| Day → evening | Practical lamp on, window blue | Lamp motivated in set |
| Years passage | Lower sun, softer wear | Same room geometry |
| Season shift | Color temp drift only | Architecture unchanged |

Document in `continuity_locks` + gaffer notes on `approved_asset_registry` locations.

---

## 9. Character-state lighting matrix (cross-channel)

Align with [emotional-temperature.md](emotional-temperature.md) — **no emotion adjectives in prompts**:

| `light_register` | key_fill | setup_id | color_temp | Shadow character |
|------------------|----------|----------|------------|------------------|
| `soft_morning` | 2:1 | 2-45-rembrandt | 5600K window | Soft, shape readable |
| `quiet_hold` | 2:1 | 1-front-soft or 2 | flat soft | Minimal contrast |
| `unfinished_ritual` | 4:1 | 3-90-split | 5600K | Slight tension on hands |
| `time_passage` | 2:1 flat | overcast | 6500K cool | Memory distance |
| `forward_relief` | 2:1 | 2-45-rembrandt | warmer 4000K lamp | Fill opens |
| `friction_pressure` | 6:1 | 3-90-split | mixed | Ernesto only |

**Scrutiny blocking:** `soft_morning` + 8:1 low-key; `ordinary-morning` + underlight; witness object with `light:product-spot-hero`.

---

## 10. Light planes (depth layering integration)

Per [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md):

| Plane | Gaffer duty |
|-------|-------------|
| Foreground | Silhouette or soft rim from practical — don't compete |
| Midground | Key light defines subject |
| Background | Falloff + separation; motivated window spill |

`light_planes: ["fg_soft_silhouette", "mg_window_key", "bg_fill"]`

---

## 11. Gaffer builder output schema

```json
{
  "key": "soft_window_left",
  "fill": "ambient_bounce_right",
  "contrast": "low_warm",
  "key_fill_ratio": "2:1",
  "contrast_register": "high_key_comfort",
  "lighting_setup_id": "light-setup:2-45-rembrandt",
  "color_temp_k": 5600,
  "motivation_psychology": "window key preserves face affordance — viewer reads care without ad-smile lighting",
  "light_planes": ["fg_soft", "mg_window_key", "bg_wall_bounce"],
  "research_refs": ["research:key-fill-empathy", "research:low-key-affect"],
  "repertoire_refs": ["light:window-key-soft", "contrast:low-warm"]
}
```

---

## 12. generation_prompt light line (director merge)

One motivated sentence — observable physics:

```
Lighting: motivated soft window key camera-left approximately 5600K, 2:1 ratio, Rembrandt falloff on face; warm interior bounce fill; documentary skin texture, no beauty dish, no unmotivated rim on witness object.
```

---

## 13. Research reference IDs

| ID | Source |
|----|--------|
| `research:grodal-affordance` | Grodal 2007 — lighting mood via affordance |
| `research:huttunen-face-setups` | Huttunen 2022 — positive setups 1–3 |
| `research:key-fill-empathy` | Wisessing ACM ToG; Projections 2020 |
| `research:low-key-affect` | Low-key suspense/malice empirical |
| `research:alton-motivated` | Alton — motivated/sculptural light |
| `research:color-temp-read` | 3200K warm / 5600K truth |

---

## Related

- [perceptual-foundation.md](perceptual-foundation.md) §8 cross-channel matrix
- [../specialists/gaffer/references/perceptual-lighting.md](../specialists/gaffer/references/perceptual-lighting.md)
- [../specialists/gaffer/references/lighting-setups.md](../specialists/gaffer/references/lighting-setups.md)
- [seedance-cinematic-look.md](seedance-cinematic-look.md) — anti-gloss complements lighting
