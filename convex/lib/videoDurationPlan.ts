/**
 * Duration-aware video planning for Assistance / Hypermotion.
 *
 * Seedance clips are 4–15s. Structure must scale with length:
 * short clips = one honest moment; longer clips = more beats, still sparse.
 */

import type { TimedBeat, VideoType } from "./guidedVideoTypes";

export type VideoDurationKind = "standard" | "hypermotion_ad";

export type VideoDurationPlan = {
  durationSeconds: number;
  kind: VideoDurationKind;
  /** Target timed-beat count for this length. */
  beatCount: number;
  minBeats: number;
  maxBeats: number;
  /** Seconds each beat should roughly hold. */
  secondsPerBeat: number;
  /** One-line pacing label for logs/prompts. */
  pacing: string;
  /** Agent-facing structure rules for this length. */
  agentGuidance: string;
  /** Compact compile hint stamped into prompts. */
  compileHint: string;
};

export function clampVideoDurationSeconds(raw: number | undefined): number {
  const n = Math.round(Number(raw) || 8);
  return Math.max(4, Math.min(15, Number.isFinite(n) ? n : 8));
}

/** Last explicit 4–15 second duration mentioned in a user message. */
export function explicitVideoDurationSeconds(
  userPrompt: string,
): number | undefined {
  const matches = [
    ...userPrompt.matchAll(
      /\b(\d{1,2})\s*(?:-|–|—)?\s*(?:seconds?|secs?|sec)\b/gi,
    ),
  ]
    .map((match) => Number(match[1]))
    .filter((duration) => Number.isFinite(duration) && duration >= 4 && duration <= 15);
  return matches.at(-1);
}

export function videoDurationKind(videoType?: VideoType | string | null): VideoDurationKind {
  return videoType === "hypermotion_ad" ? "hypermotion_ad" : "standard";
}

/**
 * Choose beat count from duration.
 * Hypermotion is denser (more cuts); standard stays sparse so moments breathe.
 */
export function beatCountForDuration(
  durationSeconds: number,
  kind: VideoDurationKind = "standard",
): { beatCount: number; minBeats: number; maxBeats: number } {
  const d = clampVideoDurationSeconds(durationSeconds);

  if (kind === "hypermotion_ad") {
    // Dense but still length-aware: ~1 beat / 2–2.5s, clamped 3–7.
    if (d <= 5) return { beatCount: 3, minBeats: 3, maxBeats: 3 };
    if (d <= 7) return { beatCount: 4, minBeats: 3, maxBeats: 4 };
    if (d <= 10) return { beatCount: 5, minBeats: 4, maxBeats: 5 };
    if (d <= 12) return { beatCount: 6, minBeats: 4, maxBeats: 6 };
    return { beatCount: 7, minBeats: 5, maxBeats: 7 };
  }

  // Standard: sparse — short clips get one continuous moment.
  if (d <= 6) return { beatCount: 1, minBeats: 1, maxBeats: 1 };
  if (d <= 9) return { beatCount: 2, minBeats: 1, maxBeats: 2 };
  if (d <= 12) return { beatCount: 3, minBeats: 2, maxBeats: 3 };
  return { beatCount: 3, minBeats: 2, maxBeats: 4 };
}

export function planVideoDuration(
  durationSeconds: number | undefined,
  videoType?: VideoType | string | null,
): VideoDurationPlan {
  const duration = clampVideoDurationSeconds(durationSeconds);
  const kind = videoDurationKind(videoType);
  const { beatCount, minBeats, maxBeats } = beatCountForDuration(duration, kind);
  const secondsPerBeat = duration / beatCount;

  if (kind === "hypermotion_ad") {
    const pacing =
      duration <= 5
        ? "ultra-tight hook"
        : duration <= 8
          ? "rapid product cuts"
          : duration <= 12
            ? "kinetic reveal arc"
            : "full scroll-stop sequence";
    return {
      durationSeconds: duration,
      kind,
      beatCount,
      minBeats,
      maxBeats,
      secondsPerBeat,
      pacing,
      agentGuidance: [
        `Clip length is ${duration}s (${pacing}).`,
        `Plan exactly ${beatCount} timed beats (allowed ${minBeats}–${maxBeats}), ~${secondsPerBeat.toFixed(1)}s each.`,
        duration <= 5
          ? "One scroll-stop hook → one texture/detail hit → one hero lock. No slow builds, no long holds."
          : duration <= 8
            ? "Hook hard in the first second, keep cuts under ~2s, end on a clear product lock-up."
            : "Open with a hard hook, escalate energy through mid beats, settle on brand/product clarity at the end.",
        "Give every beat one intentional speed behavior and transition out: one-flow ramp, ramp-to-cut, elliptical match cut, impact ramp, detail hold, or a clean hard cut. Vary velocity rather than ramping everything.",
        "Preserve screen direction and visual match anchors across cuts; reserve roughly 1.5–2s for a stable readable final hero/CTA lock when the duration allows.",
        "Fit the story to the seconds available — never invent a multi-scene arc that needs more time than the clip.",
        "In finalPrompt, list timed beats with start–end seconds that sum to the full duration.",
      ].join(" "),
      compileHint: `${duration}s hypermotion · ${beatCount} beats · ${pacing}`,
    };
  }

  const pacing =
    duration <= 6
      ? "single continuous moment"
      : duration <= 9
        ? "setup → pay-off"
        : "setup → turn → settle";
  return {
    durationSeconds: duration,
    kind,
    beatCount,
    minBeats,
    maxBeats,
    secondsPerBeat,
    pacing,
    agentGuidance: [
      `Clip length is ${duration}s (${pacing}).`,
      beatCount === 1
        ? "Show ONE continuous moment only — one camera setup, at most one slow move. No multi-scene story, no time jumps."
        : `Use ${beatCount} beats (allowed ${minBeats}–${maxBeats}), ~${secondsPerBeat.toFixed(1)}s each so every beat can breathe.`,
      duration <= 6
        ? "Do not attempt a full narrative arc in a short clip."
        : duration <= 9
          ? "Two beats max: the ordinary moment, then the quiet reveal/pay-off."
          : "At most three beats: establish, turn, settle. No montage life-stories.",
      "In finalPrompt, state the duration up front and describe action that honestly fits those seconds.",
    ].join(" "),
    compileHint: `${duration}s video · ${beatCount} beat${beatCount === 1 ? "" : "s"} · ${pacing}`,
  };
}

/** Agent system-prompt block for the current brief duration. */
export function videoDurationAgentGuidance(
  durationSeconds: number | undefined,
  videoType?: VideoType | string | null,
): string {
  return planVideoDuration(durationSeconds, videoType).agentGuidance;
}

type BeatSeed = {
  action: (subject: string) => string;
  camera: string;
};

function hypermotionBeatSeeds(count: number): BeatSeed[] {
  const library: BeatSeed[] = [
    {
      action: (s) => `Extreme macro hook on ${s}; instant scroll-stop texture`,
      camera: "snap push-in",
    },
    {
      action: (s) => `Rapid cut to material/detail surfaces of ${s}`,
      camera: "orbit whip",
    },
    {
      action: (s) => `Kinetic mid reveal of ${s} in environment`,
      camera: "tracking glide",
    },
    {
      action: (s) => `Secondary angle on ${s} with aggressive energy`,
      camera: "whip pan",
    },
    {
      action: (s) => `Product continuity beat — ${s} stays hero through motion`,
      camera: "crash zoom",
    },
    {
      action: (s) => `Texture/utility close-up of ${s}`,
      camera: "macro drift",
    },
    {
      action: (s) => `Final lock-up of ${s}; brand clarity`,
      camera: "settle hold",
    },
  ];
  if (count <= 3) {
    return [library[0]!, library[1]!, library[6]!];
  }
  if (count === 4) {
    return [library[0]!, library[1]!, library[2]!, library[6]!];
  }
  if (count === 5) {
    return [library[0]!, library[1]!, library[2]!, library[3]!, library[6]!];
  }
  if (count === 6) {
    return [library[0]!, library[1]!, library[2]!, library[3]!, library[4]!, library[6]!];
  }
  return library.slice(0, 7);
}

function standardBeatSeeds(count: number): BeatSeed[] {
  if (count <= 1) {
    return [
      {
        action: (s) => `One continuous moment with ${s} present; held framing, readable action`,
        camera: "locked / slow drift",
      },
    ];
  }
  if (count === 2) {
    return [
      {
        action: (s) => `Establish ordinary moment around ${s}`,
        camera: "held wide-medium",
      },
      {
        action: (s) => `Quiet pay-off / reveal with ${s} still in frame`,
        camera: "gentle push or hold",
      },
    ];
  }
  return [
    {
      action: (s) => `Establish the scene with ${s} as witness`,
      camera: "held frame",
    },
    {
      action: (s) => `Turn — small change in behavior around ${s}`,
      camera: "subtle reframing",
    },
    {
      action: (s) => `Settle on the human truth with ${s} still present`,
      camera: "final hold",
    },
  ];
}

/** Default timed beats scaled to duration (hypermotion or standard). */
export function defaultBeatsForDuration(
  durationSeconds: number | undefined,
  subject: string,
  videoType?: VideoType | string | null,
): TimedBeat[] {
  const plan = planVideoDuration(durationSeconds, videoType);
  const label = subject.trim() || "the product";
  const seeds =
    plan.kind === "hypermotion_ad"
      ? hypermotionBeatSeeds(plan.beatCount)
      : standardBeatSeeds(plan.beatCount);
  const slice = plan.durationSeconds / seeds.length;
  return seeds.map((seed, index) => ({
    startSec: Number((index * slice).toFixed(2)),
    endSec: Number(
      (index === seeds.length - 1 ? plan.durationSeconds : (index + 1) * slice).toFixed(2),
    ),
    action: seed.action(label),
    camera: seed.camera,
  }));
}

/** Clamp/trim beats to duration and the plan's max beat budget. */
export function clampBeatsToDurationPlan(
  beats: TimedBeat[] | undefined,
  durationSeconds: number | undefined,
  videoType?: VideoType | string | null,
): TimedBeat[] {
  const plan = planVideoDuration(durationSeconds, videoType);
  if (!beats?.length) return [];
  return beats
    .map((beat) => ({
      ...beat,
      startSec: Math.max(0, Math.min(plan.durationSeconds, beat.startSec)),
      endSec: Math.max(0, Math.min(plan.durationSeconds, beat.endSec)),
      action: String(beat.action ?? "").trim(),
    }))
    .filter((beat) => beat.action && beat.endSec > beat.startSec)
    .slice(0, plan.maxBeats);
}
