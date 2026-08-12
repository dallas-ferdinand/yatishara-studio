---
id: prompt-voiceover
title: Studio voiceover from video
when: User wants a voiceover / VO / narrator script from an edited video chip, or to enhance/tag VO for ElevenLabs v3, or to generate VO audio after a script
tools: studio_get_asset, studio_view_media, studio_pull_frames, studio_create_document, studio_patch_document, studio_get_document, studio_estimate_generation, studio_generate_audio, studio_explore_voices, inspect
category: prompt
---

# Studio voiceover from video

Goal: read the edit’s progression, write a clean spoken VO, save a Script file, paste copyable lines in chat, then optionally generate ElevenLabs v3 audio — only when they say yes.

## When

- “Write a voiceover for this”, “VO for this edit”, “narrate this video”, “script VO from the chip”
- Enhance / tag an existing VO for ElevenLabs (`[whispers]`, `[pause]`, …)
- “Generate the audio” / “make the VO” after a script exists

Not for: Seedance baked-in dialogue, Desk read-aloud, DM voice notes.

## Progression (mandatory for video chip)

1. **Resolve the video** — `studio_get_asset` / `studio_view_media` on the attached chip. Need durationSec + name. Audio-only chip → skip frames; write from brief + conversation.
2. **Pull frames (VO cadence)** — `studio_pull_frames` on the video:
   - `count = clamp(round(durationSec / 2), 4, 8)` evenly across the full clip (inspect max is 8).
   - Prefer full `startSec`/`endSec` window. Use `timesSec` only when beats are already known.
   - Do **not** use the edit-QC default of 3 frames.
3. **Inspect** the returned frame assets (`inspect`, max 8). Note any existing bed audio if relevant — do not invent spoken dialogue from silence.
4. **Draft VO** for the clip length at ~2–2.5 spoken words per second. Fit hook → body → CTA to visual beats. Preserve exact names, offers, dates, contact facts from the brief/chat.
5. **Always save** via `studio_create_document` into **CWD**:
   - Title: `VO script — <short>` (project/clip name — not generic “Script”).
   - Body shape below. Never `remember` the script body.
6. **Always paste spoken lines in chat** inside a single ` ```text ` fence so Copy works. Timings / beat notes stay **outside** the fence (short prose). Never put timestamps or stage directions inside the fence.
7. **Ask once:** “Generate ElevenLabs audio for this?”  
   - **Yes** → need a voice (`studio_explore_voices` / saved voice if missing) → `studio_estimate_generation` → `studio_generate_audio` (`audioType: voiceover`, `elevenVoiceId`, prompt = spoken text including any v3 tags). Quote $ / TTD only.  
   - **No** → stop. Never spend without that yes.

If they already said “generate the audio / make the VO audio” in the same ask, treat that as yes and proceed after the script is saved.

## Document markdown shape

~~~
# VO script — <short>

## Beat notes
(Optional: 1–3 lines of timing/intent for humans. Not for Copy.)

## Voiceover
```text
Spoken lines only. No timestamps. No stage directions.
Optional [v3 audio tags] when writing for TTS or after enhance.
```

## References
- [Edit](asset://{videoId})
- [Frame · …](asset://{frameId}) …
~~~

Clean markdown only. Asset ids from attached/generated. No pipe-meta. No HTML. Close fences.

## ElevenLabs v3 audio tags (offline — no web)

You have **no online docs**. Use **only** this catalog when tagging for TTS or when they ask to enhance the VO.

**Rules**

- Add sparse **auditory-only** square-bracket tags. Place immediately before or after the affected segment.
- **STRICTLY** preserve spoken words — do not add, remove, or rewrite dialogue.
- Prefer punctuation / CAPS / `…` / `!` / `?` for emphasis before piling tags (usually **0–3 tags** per short ad).
- Match tags to the voice’s range (soft voice + `[shouts]` often fails or speaks the tag aloud).
- **Banned:** visual/stage (`[grinning]`, `[standing]`, `[pacing]`, `[smiling]`) and music/SFX (`[music]`, `[applause]`, `[gunshot]`, `[explosion]`).

### Emotion / delivery — when to use

| Tag | Use when |
|-----|----------|
| `[happy]` / `[happily]` | Warm win, relief, product payoff |
| `[excited]` / `[excitedly]` | Hook energy, reveal, limited offer |
| `[sad]` | Pre-turn pain (sparingly) |
| `[angry]` / `[annoyed]` | Broken thing, bad service, wasted time |
| `[appalled]` | Strong disbelief at the problem |
| `[surprised]` | Before-after flip |
| `[curious]` / `[curiously]` | Soft question; invite lean-in |
| `[thoughtful]` | Reflective / witness narrator |
| `[sarcastic]` | Dry humor only if brand allows |
| `[mischievously]` | Playful tease |
| `[professional]` | Corporate / service / HSE open |
| `[sympathetic]` | Empathy for viewer pain |
| `[reassuring]` | Calm post-turn / CTA |
| `[questioning]` | Rhetorical question delivery |
| `[impressed]` | Reacting to product proof |
| `[cute]` | Soft lifestyle if voice fits |
| `[dismissive]` | Shrug off the old way |
| `[warmly]` | Intimate close / sign-off |

### Volume / register

| Tag | Use when |
|-----|----------|
| `[whispers]` / `[whisper]` / `[whispering]` | Secret / intimate moment — not a hard CTA |
| `[softly]` | Gentle care, night/home comfort |
| `[shouts]` / `[shout]` | Rare hype only if the voice can shout — else CAPS + `!` |

### Non-verbal voice

| Tag | Use when |
|-----|----------|
| `[laughs]` / `[laughing]` / `[chuckles]` / `[giggles]` | Light release after a joke or win |
| `[laughs harder]` / `[starts laughing]` / `[wheezing]` | Strong comedy only — easy to overdo |
| `[sighs]` / `[sigh]` / `[frustrated sigh]` | Exhaustion at the problem before relief |
| `[exhales]` / `[exhales sharply]` | Reset into the fix |
| `[inhales deeply]` | Rare big-news beat |
| `[clears throat]` | Comic / formal reset |
| `[snorts]` | Comic disbelief |
| `[crying]` | Almost never for product ads |
| `[happy gasp]` | Delight at the reveal |
| `[gulps]` / `[swallows]` | Nervous story beat |

### Pacing

| Tag | Use when |
|-----|----------|
| `[short pause]` / `[pause]` / `[pauses]` | Problem → product, or before CTA |
| `[long pause]` | Heavy drama (often too much in 15s) |
| `[rushed]` | Busy / overwhelm chaos |
| `[drawn out]` | Weary or sarcastic stretch on a word |

### Accent / performance — only if brief asks

`[strong French accent]` / `[strong X accent]` · `[sings]` / `[singing]` / `[singing quickly]` · `[woo]`

You may infer close variants (e.g. `[excitedly]` from `[excited]`) but stay auditory and sparse.

Same canon lives in Studio `docs/elevenlabs-v3-audio-tags.md` and Create Enhance (`elevenlabsV3AudioTags.ts`).

## Existing draft (no video)

If they paste or point at VO text only: enhance tags → `studio_patch_document` or new `VO script — …` → chat fence → ask about audio.

## Save / chat law

- Script file is the source of truth.
- Chat fence = spoken lines only (what Copy must grab).
- Point at the Script in Files; don’t dump Beat notes inside the fence.
