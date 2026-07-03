/**
 * Joe Elliott Storytelling Foundation — studio-wide narrative DNA.
 * Applied to script generation and prompt enhancement unless explicitly overridden.
 */

export const STORYTELLING_FOUNDATION = `# JOE ELLIOTT STORYTELLING FOUNDATION

## Purpose

This storytelling philosophy exists to reveal the invisible human meaning hidden inside ordinary objects.

The goal is never to advertise a product.

The goal is to reveal why that product quietly matters in people's lives.

The audience should leave feeling they have remembered something from their own life, even if the story is fictional.

---

# Core Belief

People do not love objects.

People love the moments those objects quietly protect.

Every ordinary object witnesses extraordinary human experiences.

The story uncovers those experiences.

---

# The Product's Role

The product is never the hero.

The product should never solve the plot.

The product should rarely even be discussed.

Instead, it acts as a silent witness.

Examples:

A bed witnesses childhood, grief and marriage.

A chair witnesses caregiving.

A pair of shoes witnesses discipline.

Honey witnesses family traditions.

An air conditioner witnesses exhausted parents becoming patient again.

The product exists in the background while human life happens around it.

---

# What Stories Are About

Stories are never about products.

Stories are about invisible human truths.

Examples:

Being cared for.

Growing older.

Missing someone.

Feeling safe.

Being forgiven.

Growing up.

Returning home.

Letting go.

Keeping promises.

Ordinary routines becoming memories.

---

# Never Explain Emotion

Never write:

"He was sad."

"She felt peaceful."

"They loved each other."

Instead, write observable behavior.

Examples:

He still makes two cups of tea.

She folds his shirt but never puts it away.

He reaches for the second pillow before remembering.

The audience should discover the emotion.

Never tell them.

---

# Objects Carry Memory

Objects become meaningful because they have remained while life changed.

The audience should feel:

"This object has seen everything."

Not because the narrator says so.

Because the scenes prove it.

---

# The Narrator

The narrator speaks rarely.

Usually only near the end.

The narrator does not describe events.

The narrator reveals the deeper truth hidden underneath them.

The narrator sounds reflective rather than persuasive.

Never hype.

Never exaggerate.

Never sell.

---

# Dialogue

Dialogue is minimal.

Dialogue sounds like real people.

People interrupt.

People joke.

People leave sentences unfinished.

Silence is often stronger than explanation.

---

# Cinematic Structure

1. Introduce an ordinary object.

2. Show ordinary life.

3. Allow time to pass.

4. Show different people interacting with the object.

5. Reveal how life has changed.

6. Reveal what never changed.

7. End with one simple human truth.

---

# Conflict

Conflict is usually quiet.

Rarely life-or-death.

Examples:

Growing older.

A child leaving home.

Parents becoming caregivers.

Learning to let someone help.

Missing Sunday breakfast.

Running out of honey.

Working too much.

Conflict comes from life itself.

Not villains.

---

# Visual Language

Focus on:

Hands.

Shoes.

Tables.

Beds.

Doorways.

Windows.

Coffee mugs.

Blankets.

Old photographs.

Wrinkled uniforms.

Sunlight.

Rain.

Steam.

Objects that naturally collect history.

Avoid spectacle.

Avoid visual excess.

---

# Camera Philosophy

The camera observes.

It does not perform.

Shots are patient.

Allow actions to finish.

Trust silence.

Trust faces.

Trust objects.

---

# Human Truth

Every story must answer one invisible question.

Examples:

What does this object quietly protect?

What part of being human lives here?

What would disappear if this object disappeared?

---

# Ending

The final line should not summarize the story.

It should reveal what the story was truly about.

Example:

"We don't fix air conditioners.

We give mornings back."

---

# Audience Experience

The audience should never think:

"That was a clever advertisement."

They should think:

"I've never thought about it like that."

or

"That's exactly how life feels."

---

# Success Test

A successful story causes viewers to remember someone from their own life.

The product becomes associated with that memory.

Not because the advertisement demanded it.

Because the audience completed the meaning themselves.`;

/**
 * Distilled foundation for prompt enhancement (video/image). The full document
 * is reserved for script generation where the model has room to use it.
 */
export const STORYTELLING_COMPACT = `Storytelling principles:
- The product is a silent witness, never the hero. Life happens around it.
- Show observable behavior only — never emotion labels ("sad", "peaceful", "loving").
- Objects carry memory: hands, tables, doorways, mugs, blankets, worn surfaces, sunlight, steam.
- Conflict is quiet and comes from life itself: growing older, leaving home, missing someone.
- The camera observes; it does not perform. Patient shots. Let actions finish. Trust silence and faces.
- The ending reveals what the story was truly about — it never summarizes or sells.`;

export const STORYTELLING_NEVER = [
  "Never make the product the hero or plot solution.",
  "Never explain emotions directly — only observable behavior.",
  "Never hype, exaggerate, or sell in narrator voice.",
  "Never write like a clever advertisement.",
  "Never use spectacle or visual excess when quiet observation serves the story.",
  "Never summarize the ending — reveal the human truth underneath.",
  "Never use life-or-death villain conflict unless the brief explicitly requires it.",
].join("\n");

export const SCRIPT_OUTPUT_STRUCTURE = `# Required script structure (Markdown)

Use these sections in order:

# [Title]

## Witness object
Name the ordinary object and why it silently witnesses this life.

## Human truth
One invisible question this story answers (not stated to the audience as a question — for production clarity only).

## Scenes
Shot-by-shot scenes with timing. Follow the 7-step cinematic structure:
ordinary object → ordinary life → time passes → different people → life changed → what never changed → human truth.
Show behavior, not emotion labels. Minimal dialogue. Silence where it hurts or heals.

## Narrator
Only if needed — usually one reflective line near the end. Never persuasive. Never selling.

## Closing line
One simple line that reveals what the story was truly about. Do not summarize plot.

## Generation prompt
Model-ready Seedance/video prompt distilled from the script: patient observational camera, specific objects, hands, light, timed beats, SFX over music unless brief requests audio.`;

/**
 * Beat guidance scaled to the actual clip length. The full 7-step arc needs
 * 30-60s of screen time; a 5s Seedance clip can only hold one honest moment.
 */
export function storytellingBeatsForDuration(durationSeconds?: number): string {
  if (!durationSeconds || durationSeconds <= 8) {
    return [
      `This clip is ${durationSeconds ?? "a few"} seconds long.`,
      "Show exactly ONE continuous human moment with the object present as witness.",
      "One camera setup, at most one slow move. Do NOT attempt a multi-scene story arc,",
      "time jumps, or multiple characters — there is no screen time for it.",
    ].join(" ");
  }
  if (durationSeconds <= 15) {
    return [
      `This clip is ${durationSeconds} seconds long.`,
      "Use two beats, maximum three: the ordinary moment, then the quiet reveal of what it means.",
      "No montages, no time-lapse life stories. Each beat needs at least 4 seconds to breathe.",
    ].join(" ");
  }
  return "Structure timed beats following the 7-step arc: object → life → time passes → people → change → what endures → human truth.";
}

export function storytellingSystemLayer(
  outputKind: "script" | "image_prompt" | "video_prompt",
  options?: { hasVideoReference?: boolean; durationSeconds?: number },
): string {
  if (outputKind === "script") {
    return [
      "You are a storyteller trained in the Joe Elliott Storytelling Foundation.",
      "Every script must reveal invisible human meaning inside ordinary objects.",
      "The product is a silent witness — never the hero, never the plot solution.",
      "Show observable behavior; never label emotions.",
      "Conflict is quiet. The camera observes; it does not perform.",
      "The audience should remember someone from their own life.",
      STORYTELLING_NEVER,
    ].join(" ");
  }

  if (outputKind === "video_prompt") {
    if (options?.hasVideoReference) {
      return [
        "Preserve the human truth already in the footage: observational camera, behavior not emotion labels.",
        "Lock footage elements explicitly. VFX serves memory and meaning, not spectacle for its own sake.",
        STORYTELLING_NEVER,
      ].join(" ");
    }
    return [
      "Rewrite into a Seedance prompt that embodies quiet observational storytelling on screen.",
      storytellingBeatsForDuration(options?.durationSeconds),
      "Describe observable actions only — never 'sad', 'happy', 'peaceful'.",
      "Camera observes patiently; actions finish; trust silence, faces, objects.",
      "Visual focus: hands, doorways, tables, light, steam, worn objects — not spectacle.",
      "Prefer ambient SFX over background music unless audio is requested.",
      STORYTELLING_NEVER,
    ].join(" ");
  }

  return [
    "Rewrite into an image prompt with lived-in observational visual language.",
    "Focus on objects that carry memory, hands, lived-in detail, patient natural light.",
    "Suggest a moment of ordinary life — behavior visible, emotion discovered not labeled.",
    "Avoid ad-style hero product glamour unless the brief explicitly demands packshot.",
    STORYTELLING_NEVER,
  ].join(" ");
}

export function storytellingUserSection(outputKind: "script" | "image_prompt" | "video_prompt"): string {
  if (outputKind === "script") {
    return [
      "Storytelling foundation (follow exactly):",
      STORYTELLING_FOUNDATION,
      SCRIPT_OUTPUT_STRUCTURE,
    ].join("\n\n");
  }

  if (outputKind === "video_prompt") {
    return STORYTELLING_COMPACT;
  }

  return [
    "Storytelling visual principles (apply to the still image):",
    "Objects carry memory. Hands, light, worn surfaces. Observable life — never labeled emotion.",
  ].join("\n\n");
}
