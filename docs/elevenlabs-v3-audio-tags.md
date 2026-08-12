# ElevenLabs v3 audio tags

Studio voiceover TTS uses **`eleven_v3`**. Tags live **inline in the script text** as square brackets — not SSML, not a separate API field.

Official reference: [Prompting Eleven v3](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v3)

## Syntax

```text
[whispers] I never knew it could be this way…
[sighs] It's just… difficult.
Are you serious? [appalled] I can't believe you did that!
```

Tags are open-ended natural language. Place them **immediately before or after** the segment they affect.

## Categories (non-exhaustive)

| Kind | Examples |
|------|----------|
| Emotion / delivery | `[happy]`, `[sad]`, `[excited]`, `[angry]`, `[annoyed]`, `[thoughtful]`, `[surprised]`, `[sarcastic]` |
| Volume / register | `[whispers]`, `[whisper]`, `[softly]`, `[shouts]` |
| Non-verbal voice | `[laughing]`, `[chuckles]`, `[sighs]`, `[clears throat]`, `[exhales]` |
| Pacing | `[short pause]`, `[long pause]`, `[pause]`, `[rushed]`, `[drawn out]` |

Prefer punctuation, CAPS, `?` / `!`, and ellipses for emphasis before stacking many tags.

## Enhance rules (Create wand + Agent)

**DO**

- Add sparse **auditory / voice-only** tags that fit the line’s emotion or subtext.
- Keep every original spoken word unchanged.
- Match tags to the chosen voice’s range (a soft voice + many `[shouts]` often fails or speaks the tag aloud).

**DO NOT**

- Alter, add, or remove spoken words.
- Wrap original narrative in brackets or turn descriptions into tags (e.g. do not rewrite “He laughed” into `[laughing] He laughed`).
- Use visual/stage tags: `[standing]`, `[grinning]`, `[pacing]`.
- Use music or SFX tags: `[music]`, `[applause]`, `[gunshot]`.
- Invent new dialogue lines.

Create **Enhance** for voiceover (`composerEnhance` kind `voiceover`) follows these rules. Studio Agent skill `prompt-voiceover` does the same when tagging for TTS.

## Studio wiring

| Surface | Behavior |
|---------|----------|
| Create → Audio → Voiceover → Enhance | Tags-only polish; charged text enhance |
| Agent skill `prompt-voiceover` | Frames → VO script → optional `studio_generate_audio` |
| TTS | `convex/lib/elevenlabs.ts` → `model_id: eleven_v3` |

## Related

- Agent skill: `services/studio-agent/skills/prompt-voiceover.md`
- MercuryOS: `_system/integrations/elevenlabs.md`, skill `mercuryos-voiceover`
