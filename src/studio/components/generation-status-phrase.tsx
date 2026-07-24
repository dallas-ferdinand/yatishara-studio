"use client";

import { useEffect, useState } from "react";
import "./generation-status-phrase.css";

export type GenerationStatusMode = "image" | "video" | "audio";

const QUEUED = ["Queued", "Waiting", "Holding", "Warming", "Gathering"] as const;

const SAVING = {
  image: ["Saving", "Keeping", "Filing", "Stowing"],
  video: ["Saving", "Keeping", "Filing", "Archiving"],
  audio: ["Saving", "Keeping", "Filing", "Stowing"],
} as const;

/** Soft, contemplative one-word verbs — Cursor-like, not chaotic. */
const GENERATING = {
  image: [
    "Dreaming",
    "Imagining",
    "Escaping",
    "Pondering",
    "Wondering",
    "Musing",
    "Daydreaming",
    "Envisioning",
    "Visualizing",
    "Painting",
    "Sketching",
    "Composing",
    "Crafting",
    "Shaping",
    "Framing",
    "Softening",
    "Focusing",
    "Blooming",
    "Unfolding",
    "Whispering",
    "Wandering",
    "Reflecting",
    "Contemplating",
    "Considering",
    "Inventing",
    "Illuminating",
    "Capturing",
    "Revealing",
  ],
  video: [
    "Dreaming",
    "Imagining",
    "Escaping",
    "Pondering",
    "Wondering",
    "Musing",
    "Daydreaming",
    "Envisioning",
    "Visualizing",
    "Directing",
    "Staging",
    "Framing",
    "Composing",
    "Animating",
    "Sequencing",
    "Lighting",
    "Unfolding",
    "Wandering",
    "Reflecting",
    "Contemplating",
    "Inventing",
    "Shaping",
    "Timing",
    "Revealing",
    "Storytelling",
    "Choreographing",
  ],
  audio: [
    "Dreaming",
    "Imagining",
    "Escaping",
    "Pondering",
    "Wondering",
    "Musing",
    "Daydreaming",
    "Listening",
    "Humming",
    "Whispering",
    "Breathing",
    "Tuning",
    "Mixing",
    "Scoring",
    "Harmonizing",
    "Layering",
    "Softening",
    "Unfolding",
    "Wandering",
    "Reflecting",
    "Contemplating",
    "Resonating",
    "Echoing",
    "Voicing",
    "Shaping",
  ],
} as const;

function wordsFor(mode: GenerationStatusMode, stage: string): readonly string[] {
  if (stage === "queued") return QUEUED;
  if (stage === "saving") return SAVING[mode];
  return GENERATING[mode];
}

/** Cursor-style rotating one-word status while a generation is in flight. */
export function GenerationStatusPhrase({
  mode,
  stage,
  className = "",
}: {
  mode: GenerationStatusMode;
  stage: string;
  className?: string;
}) {
  const words = wordsFor(mode, stage);
  const [index, setIndex] = useState(() => Math.floor(Math.random() * words.length));
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    setIndex(Math.floor(Math.random() * words.length));
    setPhase("in");
  }, [mode, stage, words]);

  useEffect(() => {
    if (words.length <= 1) return;
    let fadeTimer: number | undefined;
    const tick = window.setInterval(() => {
      setPhase("out");
      fadeTimer = window.setTimeout(() => {
        setIndex((prev) => {
          if (words.length <= 1) return 0;
          let next = Math.floor(Math.random() * words.length);
          // Avoid immediate repeats when the pool is large.
          if (next === prev) next = (next + 1) % words.length;
          return next;
        });
        setPhase("in");
      }, 200);
    }, 2200);
    return () => {
      window.clearInterval(tick);
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
    };
  }, [words]);

  const label = words[index] ?? words[0] ?? "Working";

  return (
    <span
      className={[
        "studio-gen-status-phrase",
        phase === "in" ? "is-in" : "is-out",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

/** Stable screen-reader label — phrases rotate visually only. */
export function generationStatusAriaLabel(mode: GenerationStatusMode, stage: string): string {
  if (stage === "queued") return mode === "audio" ? "Audio queued" : `${mode} queued`;
  if (stage === "saving") return mode === "audio" ? "Saving audio" : `Saving ${mode}`;
  if (mode === "audio") return "Generating audio";
  if (mode === "image") return "Generating image";
  return "Generating video";
}
