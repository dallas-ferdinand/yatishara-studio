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

## ElevenLabs v3 audio tags

When preparing text for TTS, or when they ask to enhance / tag the VO:

- Add sparse **auditory-only** square-bracket tags — e.g. `[whispers]`, `[sighs]`, `[excited]`, `[short pause]`, `[softly]`.
- Place tags immediately before or after the affected segment.
- **STRICTLY** preserve spoken words — do not add, remove, or rewrite dialogue.
- Do **not** use visual/stage tags (`[grinning]`, `[standing]`) or music/SFX tags.
- Prefer punctuation / CAPS / `…` for emphasis before piling tags.
- Canon: Studio `docs/elevenlabs-v3-audio-tags.md` (and Create Enhance wand uses the same rules).

## Existing draft (no video)

If they paste or point at VO text only: enhance tags → `studio_patch_document` or new `VO script — …` → chat fence → ask about audio.

## Save / chat law

- Script file is the source of truth.
- Chat fence = spoken lines only (what Copy must grab).
- Point at the Script in Files; don’t dump Beat notes inside the fence.
