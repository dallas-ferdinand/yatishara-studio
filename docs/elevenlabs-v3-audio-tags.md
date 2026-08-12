# ElevenLabs v3 audio tags (offline canon)

Studio voiceover TTS uses **`eleven_v3`**. Tags live **inline in the script text** as square brackets — not SSML, not a separate API field.

**Offline-first:** Studio Agent and Create Enhance must use this file / the embedded skill copy. Do not rely on fetching ElevenLabs docs at runtime.

Tags are open-ended natural language (you may infer close variants), but prefer the catalog below for ad VO.

## Syntax

```text
[whispers] I never knew it could be this way…
[sighs] It's just… difficult.
Are you serious? [appalled] I can't believe you did that!
```

Place tags **immediately before or after** the segment they affect. Prefer punctuation / CAPS / `…` / `!` / `?` for emphasis before stacking many tags. Keep tags **sparse** (usually 0–3 per short ad).

## Tag catalog — when to use (ad VO)

### Emotion / delivery

| Tag | Use when |
|-----|----------|
| `[happy]` / `[happily]` | Warm win, relief, good news, product payoff |
| `[excited]` / `[excitedly]` | Hook energy, reveal, limited offer, “you’ll love this” |
| `[sad]` | Loss, frustration beat before the turn (use sparingly in ads) |
| `[angry]` / `[annoyed]` | Problem beat: broken thing, bad service, wasted time |
| `[appalled]` | Strong disbelief at the problem (“you still do it that way?”) |
| `[surprised]` | Unexpected result / before-after flip |
| `[curious]` / `[curiously]` | Soft question to the viewer; invite lean-in |
| `[thoughtful]` | Reflective narrator, witness/memory line |
| `[sarcastic]` | Dry humor only if brand voice allows |
| `[mischievously]` | Playful tease; lifestyle jokes |
| `[professional]` | Corporate / service / HSE authority open |
| `[sympathetic]` | Empathy for the viewer’s pain (“that’s exhausting…”) |
| `[reassuring]` | After the turn — “we’ve got you”, calm CTA |
| `[questioning]` | Rhetorical question delivery |
| `[impressed]` | Reacting to the result / product proof |
| `[cute]` | Soft/playful lifestyle (kids, pets, cozy) — match voice |
| `[dismissive]` | Shrugging off the old way / competitor habit |
| `[warmly]` | Intimate close, thank-you, brand sign-off |

### Volume / register

| Tag | Use when |
|-----|----------|
| `[whispers]` / `[whisper]` / `[whispering]` | Secret, intimacy, ASMR-ish product moment; not for hard CTA |
| `[softly]` | Gentle care, night/home comfort |
| `[shouts]` / `[shout]` | Rare — only if voice can shout; hype/sports. Else prefer CAPS + `!` |

### Non-verbal voice (still spoken performance)

| Tag | Use when |
|-----|----------|
| `[laughs]` / `[laughing]` / `[chuckles]` / `[giggles]` | Light release after a joke or win |
| `[laughs harder]` / `[starts laughing]` / `[wheezing]` | Strong comedy only — easy to overdo in ads |
| `[sighs]` / `[sigh]` / `[frustrated sigh]` | Exhaustion at the problem; beat before relief |
| `[exhales]` / `[exhales sharply]` | Reset after stress; “okay… here’s the fix” |
| `[inhales deeply]` | Gathering courage / big news (use rarely) |
| `[clears throat]` | Fake formal start / comic reset |
| `[snorts]` | Comic disbelief |
| `[crying]` | Almost never for product ads |
| `[happy gasp]` | Delight at the reveal |
| `[gulps]` / `[swallows]` | Nervous beat (story ads) |

### Pacing

| Tag | Use when |
|-----|----------|
| `[short pause]` / `[pause]` / `[pauses]` | Beat between problem → product, or before CTA |
| `[long pause]` | Heavier drama / witness moment (15s ads: usually overkill) |
| `[rushed]` | Overwhelm / busy morning chaos |
| `[drawn out]` | Sarcasm or weary emphasis on one word |

Also use **ellipsis `...`**, **CAPS**, and punctuation for pace without a tag.

### Accent / performance (use only if brief asks)

| Tag | Use when |
|-----|----------|
| `[strong French accent]` / `[strong Russian accent]` / `[strong X accent]` | Character bit only — never force on a Trini/corporate VO unless asked |
| `[sings]` / `[singing]` / `[singing quickly]` | Jingle or sung CTA only if requested |
| `[woo]` | Party hype — rare |

## Banned for Studio Agent + Create Enhance (ad VO)

Do **not** use:

- Visual / stage: `[standing]`, `[grinning]`, `[pacing]`, `[smiling]`
- Music / SFX: `[music]`, `[applause]`, `[clapping]`, `[gunshot]`, `[explosion]`, `[leaves rustling]`
- Wrapping original words in brackets or inventing new dialogue

(ElevenLabs API can do SFX tags; our VO enhance path forbids them.)

## Enhance rules

1. **STRICTLY** preserve spoken words — tags only; no add/remove/rewrite.
2. Tags must be **auditory / voice-only**.
3. Place before or after the affected segment.
4. Match tags to the **voice’s range** (soft voice + `[shouts]` often fails or speaks the tag aloud).
5. Sparse beats: typically hook tag, problem sigh/pause, warm/reassuring CTA — not a tag on every clause.

## Studio wiring

| Surface | Behavior |
|---------|----------|
| Create → Audio → Voiceover → Enhance | Tags-only polish; charged text enhance (catalog in `composerEnhance`) |
| Agent skill `prompt-voiceover` | Full catalog embedded offline in the skill body |
| TTS | `convex/lib/elevenlabs.ts` → `model_id: eleven_v3` |

## Related

- Agent skill: `services/studio-agent/skills/prompt-voiceover.md`
- MercuryOS: `_system/integrations/elevenlabs.md`, skill `mercuryos-voiceover`
