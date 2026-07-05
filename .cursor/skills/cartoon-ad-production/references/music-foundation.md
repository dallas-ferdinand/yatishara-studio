# Music foundation — score psychology for composer (Ernesto + scored Joe)

**Mandatory read:** composer (Phase C), director (merge when `music.presence` ≠ none).  
Joe default: `music: none` — this doc applies when brief requests underscore.

---

## 1. Music vs witness grammar (Joe)

| Register | Music | Why |
|----------|-------|-----|
| `temp:quiet-hold` | **none** | Silence is the beat |
| `temp:unfinished-ritual` | **none** | Foley + silence carry meaning |
| `temp:forward-relief` | sparse optional | Post or gen — composer must duck |
| Ernesto turn | light underscore OK | Behavior change visible first |

**Blocking:** score under documented `silence_beats` without director override.

---

## 2. Chion empathetic vs anempathetic (audio channel)

| Type | Use in ads |
|------|------------|
| **Empathetic** | Score shares scene pressure — Ernesto friction only |
| **Anempathetic** | Cheerful music over grief — **forbidden** Joe |

Composer outputs `music_register: empathetic_sparse | none`.

---

## 3. Vococentrism + narrator

End VO (post) dominates perception. If `narrator_close` exists:

- `music.ducking: full_under_narrator`
- No gen clip score — **post only** unless brief explicitly wants baked music

---

## 4. Murch priority

When music fights silence beat or temperature: **silence wins** (emotion channel ~51%).

---

## 5. Composer shot_packet schema

```json
{
  "music": {
    "presence": "none",
    "entry": null,
    "ducking": null,
    "music_register": "none",
    "research_refs": ["research:chion-empathetic"],
    "repertoire_refs": []
  }
}
```

When present: `entry: "bar_12_soft_strings"`, `ducking: "under_sfx_and_silence"`.

---

## Related

- [sound-foundation.md](sound-foundation.md) — diegetic hierarchy
- [../specialists/composer/references/music-arcs.md](../specialists/composer/references/music-arcs.md)
