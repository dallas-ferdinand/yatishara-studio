# Direction foundation — staging, blocking, mise-en-scène, operations

**Mandatory read:** director-joe, director-ernesto (merge), production-designer, dp, editor.  
Purpose: How directors **stage inference cues** and run **merge operations** across phases.

Not celebrity performance direction — **observable staging for gen cinema**.

---

## 1. Mise-en-scène as narrative argument

**Bordwell & Thompson:** mise-en-scène = everything in front of camera — staging, light, costume, depth — arranges **meaning in space**.

| Element | Director duty | Research basis |
|---------|---------------|----------------|
| **Blocking** | Who/what where, when they move | Attention + inference cues |
| **Staging depth** | FG/MG/BG roles | [depth-and-layering-for-gen.md](depth-and-layering-for-gen.md) |
| **Light motivation** | Truth vs pressure | [lighting-foundation.md](lighting-foundation.md) |
| **Set affordance** | Can viewer read ritual? | Grodal affordance |
| **Color temperature** | Time + memory | color-foundation |

Director merge **does not invent** department craft — **adjudicates** into one coherent mise-en-scène per shot.

---

## 2. Blocking — observable behavior in space

Blocking = arranging bodies, hands, objects in **screen space** to support `observable_actions`.

### Joe witness blocking rules

| Rule | Staging |
|------|---------|
| Witness object **in light path** | MG or BG — never hidden shadow |
| Hands **enter from consistent screen side** | Continuity for match cuts |
| Caregiver **not centered hero** | Offset upper third — observer grammar |
| **Two-object ritual** | Both objects visible before pause beat |
| Product **never advances toward camera alone** | No product walk-to-hero |

### Ernesto friction blocking

| Beat | Staging shift |
|------|---------------|
| Friction | Tighter frame, less negative space |
| Turn | Behavior change **in same blocking** — proof |
| Relief | Negative space returns |

**Output in shot_packet `action`:** verb + object + spatial relation — "hands pause above second mug, counter MG, window BG".

---

## 3. Axis of action & screen direction (simplified)

180° rule preserves spatial coherence — viewer tracks **left/right relations** without effort (reduces cognitive load).

| Convention | Pipeline |
|------------|----------|
| Establish line on master | First shot in scene sets axis |
| Match screen side | Character A always camera-left |
| Eyeline match | Look screen-right → cut to object screen-right |
| Cross axis | Only with intentional disorientation brief |

**Scrutiny blocking:** eyeline promises object off-screen right, cut shows object left with no motivation.

`screen_direction_lock: "A_left_B_right"` in continuity_locks.

---

## 4. Coverage philosophy — short ads (not TV drama)

Traditional coverage: master + singles + inserts. **90s Joe ad:**

| Coverage type | Count | Function |
|---------------|-------|----------|
| **Geography master** | 1–2 | Transport + situation model |
| **Behavior MS/MWS** | 4–6 | Inference beats |
| **Witness insert** | 2–4 | Peak-end object grammar |
| **Time-passage wide** | 1–2 | Same angle, new hands |
| **Close** | 1 | End anchor |

**No redundant singles** — every shot advances inference or attention reset.

Editor owns shot list; director confirms **each shot earns its duration**.

---

## 5. Directing attention — operational checklist (Phase C merge)

Per shot, director verifies:

1. **Attention driver** named (see [attention-foundation.md](attention-foundation.md))
2. **One primary subject** in sharp plane
3. **Witness object** readable if beat requires
4. **Cut cue** documented for next shot
5. **Temperature coherent** across channels (§8 matrix)
6. **SCENE / CAMERA split** in prompts — no duplicate moves
7. **No emotion labels** in any line
8. **referenceElementIds** from orchestrator — director does not invent

---

## 6. Director merge operations by phase

### Phase A — Story operation

| Step | Action |
|------|--------|
| 1 | Run Joe 7-question engine |
| 2 | Verify `peak_beat` + `end_anchor` |
| 3 | Reject emotion labels |
| 4 | Sign off `inference_chain` |

### Phase B — World operation

| Step | Action |
|------|--------|
| 1 | Witness object placement in set geometry |
| 2 | Window direction locked for gaffer |
| 3 | Lived-in affordance — not catalog |
| 4 | Location count vs duration |

### Phase C — Shotcraft operation

| Step | Action |
|------|--------|
| 1 | Read editor shot list + Kuleshov pairs **first** |
| 2 | Fuse dp/gaffer/sound/composer/color/motion |
| 3 | Write `storyboard_prompt` + `generation_prompt` |
| 4 | Perceptual coherence check (all foundations) |
| 5 | Override conflicts — document in `director_notes` |

### Phase E scrutiny operation

| Step | Action |
|------|--------|
| 1 | Visual scrutiny vs prop-master |
| 2 | Seedance face block → start-frame path |
| 3 | Max 3 regen rounds |

---

## 7. Conflict adjudication — Murch-aligned

When specialists `negotiate`, director applies [perceptual-foundation.md](perceptual-foundation.md) Rule of Six:

| Priority | Typical winner |
|----------|----------------|
| Temperature coherence | sound silence > dp flashy move |
| Story beat | editor cut > 3D continuity |
| Rhythm | breathe end > screen direction |

Document `overrides[]` with `rationale` citing research_ref when possible.

---

## 8. Staging witness object — Joe grammar

| Placement | Meaning | Camera |
|-----------|---------|--------|
| **BG static** | Silent witness | MWS observational |
| **MG hands interact** | Ritual | MS, counter height |
| **FG soft blur** | Memory texture | parallax-drift |
| **ECU texture** | Peak object moment | macro insert — no face |

Object **never** largest brightest subject unless peak-end beat — even then, motivated window light only.

---

## 9. Ernesto direction differences

| Dimension | Joe | Ernesto |
|-----------|-----|---------|
| Center of story | Witness object | Character behavior arc |
| Camera | Observes | Tracks friction → turn |
| Peak | Unfinished ritual | Visible behavior change |
| Close | Object unchanged | Forward motion proof |

Same operational merge — different `director_route` priorities.

---

## 10. generation_prompt director fusion (recap)

```
SCENE: [MG action + observable verbs]. [FG soft clause]. [BG context]. [Light line]. [Sound line]. [Color]. [Locks].

CAMERA: [size arc], [lens], [height]. ONE [move]. [Parallax]. [timing_beats]. [Stability].
```

Director is **only role** that writes final prompt prose — specialists supply blocks.

---

## 11. Research reference IDs

| ID | Source |
|----|--------|
| `research:mise-en-scene-meaning` | Bordwell & Thompson staging |
| `research:blocking-inference` | Observable action → situation model |
| `research:axis-continuity` | 180° spatial coherence |
| `research:coverage-economy` | Short-form coverage discipline |
| `research:director-merge-six` | Murch priority in adjudication |

---

## Related

- [storytelling-foundation.md](storytelling-foundation.md) — what story means
- [attention-foundation.md](attention-foundation.md) — where eye goes
- [joe-foundation.md](joe-foundation.md) — Joe rules
- [../specialists/director-joe/SKILL.md](../specialists/director-joe/SKILL.md)
- [../specialists/director-ernesto/SKILL.md](../specialists/director-ernesto/SKILL.md)
