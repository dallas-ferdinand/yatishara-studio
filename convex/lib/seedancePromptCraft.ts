/**
 * Seedance-ready prompt craft for Assistance.
 *
 * Distills how strong video planners describe work (subject → action → camera →
 * scene/light → style → constraints; duration-sized shots; I2V = motion only).
 * No external product wiring — craft rules only for direct-handoff prompts.
 */

export type PromptCraftAssessment = {
  ok: boolean;
  error?: string;
  hint?: string;
  warnings?: string[];
};

const ACTION_SIGNAL =
  /\b(?:shot\s*\d|scene\s*:|action\s*:|walks?|runs?|turns?|raises?|lowers?|opens?|closes?|pours?|spins?|drifts?|rises?|falls?|leans?|glances?|smiles?|reaches?|holds?|places?|lifts?|pushes?|pulls?|settles?|reveals?|unwraps?|zooms?|tracks?|doll(?:y|ies)|pans?|orbits?|moves?|motion|gesture|breath(?:es|ing)?|steam|smoke|hair|cloth(?:es|ing)?|hand|finger|shoulder|head)\b/i;

const CAMERA_SIGNAL =
  /\b(?:camera|shot\s*\d|wide\s*shot|medium\s*shot|close[- ]?up|macro|dolly|tracking|track(?:ing)?\s*shot|pan|tilt|orbit|push[- ]?in|pull[- ]?back|whip|locked[- ]?off|static\s*camera|handheld|crane|drone|lens|35mm|50mm|85mm|low\s*angle|high\s*angle|over[- ]?shoulder|settle|crash\s*zoom|snap\s*push)\b/i;

const VIBE_ONLY =
  /\b(?:cinematic|epic|beautiful|stunning|amazing|gorgeous|viral|aesthetic|premium|luxury|high[- ]?end|professional)\b/gi;

const LOOK_REDESCRIBE =
  /\b(?:wearing|dressed in|has\s+(?:brown|blonde|black|red|dark|light)\s+hair|outfit|wardrobe|facial\s+features|looks\s+like)\b/i;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function concreteTokenCount(text: string): number {
  const vibeStripped = text.replace(VIBE_ONLY, " ");
  return wordCount(vibeStripped);
}

/** Agent-facing craft block — how to plan and describe video prompts. */
export function seedancePromptCraftGuidance(args?: {
  hasStartFrame?: boolean;
  videoType?: string | null;
}): string {
  const i2v = Boolean(args?.hasStartFrame);
  const hyper = args?.videoType === "hypermotion_ad";
  return [
    "VIDEO PROMPT CRAFT (direct handoff — write the finished Seedance prompt in finalPrompt):",
    "Plan like a short director brief, not marketing copy. Spatial layer = who/where/look; temporal layer = what moves and how the camera travels.",
    i2v && hyper
      ? "Start frame + Hypermotion: use the frame as the opening visual anchor; do NOT redescribe its appearance. Preserve product identity and existing text pixels, then write the duration plan's full timed multi-beat edit with motion, camera, transitions, and audio. A start frame does not force a single continuous shot."
      : i2v
        ? "Start frame + Standard: do NOT redescribe appearance, wardrobe, or set dressing already in the image. Prompt the visible motion, one restrained camera move, audio, and constraints; a single continuous moment is usually strongest. Keep roughly 60–100 words."
      : "No start frame: lock subject with 2–3 stable traits, then scene/light, then timed action + camera.",
    "Structure multi-beat clips as Shot 1 / Shot 2 / … sized to the duration plan. One primary action and one camera move per shot — do not stack push+pan+orbit in the same beat.",
    "For every timed Hypermotion beat specify: start–end time, subject action, one camera move, speed behavior, transition out, visual match anchor when relevant, and the music/SFX or voiceover cue it supports.",
    "Prefer slow, continuous, body-specific motion (slowly raises a hand, gentle turn) over abstract mood words. Emotions → visible physical cues.",
    hyper
      ? [
          "Hypermotion edit grammar: choose a coherent rhythm from these techniques instead of stacking all of them.",
          "One-flow speed ramp = normal or slow entry → accelerated middle → controlled normal/slow landing on a readable detail.",
          "Ramp-to-cut = accelerate into a whip, foreground occlusion, or object wipe; cut at peak velocity; decelerate into the next shot.",
          "Elliptical action/graphic match = remove the middle of an action and cut between matching pose, shape, position, color, or motion direction; this is a compressed match cut, not a continuous speed ramp.",
          "Impact ramp = brief anticipation or micro-hold → sudden acceleration/reveal → clean settle.",
          "Detail hold = fast entry → short slow-motion texture/product hold → fast exit.",
          "Keep screen direction and product identity continuous across cuts. Use motion blur or occlusion to hide transitions, not morphing.",
          "Hook hard in the first second, vary velocity so the whole clip is not uniformly frantic, synchronize cut impacts to music/SFX and voiceover emphasis, then decelerate into a stable 1.5–2s hero/CTA lock.",
        ].join(" ")
      : "Standard register: let moments breathe; sparse beats over montage life-stories.",
    "End with style/quality and constraints (subtitle-free, no logo/watermark, no morphing) when useful. Put duration/aspect/resolution in settings, not as the whole prompt.",
    "Map attached references by number/role in the prompt text.",
  ].join(" ");
}

/**
 * Validate that finalPrompt is production-shaped before review.
 * Image/script/element keep a thinness floor; video requires craft signals.
 */
export function assessFinalPromptForReview(args: {
  mode: "image" | "video" | "script" | "element";
  finalPrompt: string;
  hasStartFrame?: boolean;
  videoType?: string | null;
}): PromptCraftAssessment {
  const prompt = args.finalPrompt.trim();
  if (!prompt) {
    return {
      ok: false,
      error: "final_prompt_too_thin",
      hint: "Write a full production prompt before review.",
    };
  }

  if (args.mode !== "video") {
    if (prompt.length < 80) {
      return {
        ok: false,
        error: "final_prompt_too_thin",
        hint: "Expand into a detailed production prompt before review.",
      };
    }
    return { ok: true };
  }

  const words = wordCount(prompt);
  const concrete = concreteTokenCount(prompt);
  const hasAction = ACTION_SIGNAL.test(prompt);
  const hasCamera = CAMERA_SIGNAL.test(prompt);
  const warnings: string[] = [];

  if (words < 28 || concrete < 22) {
    return {
      ok: false,
      error: "final_prompt_too_thin",
      hint:
        "Expand into a Seedance-ready brief: subject/action, scene or light, camera move, and constraints — not vibe words alone.",
    };
  }

  if (!hasAction && !hasCamera) {
    return {
      ok: false,
      error: "final_prompt_missing_craft",
      hint:
        "Add concrete motion and camera language (or Shot 1 / Shot 2 beats). Mood adjectives alone will not drive Seedance.",
    };
  }

  if (!hasAction) {
    return {
      ok: false,
      error: "final_prompt_missing_action",
      hint:
        "Describe what moves — body-specific actions or Shot beats with verbs. Avoid abstract emotion-only lines.",
    };
  }

  if (!hasCamera) {
    return {
      ok: false,
      error: "final_prompt_missing_camera",
      hint:
        "Name the camera: locked-off, slow dolly, tracking, push-in, etc. One move per shot.",
    };
  }

  if (args.hasStartFrame) {
    if (LOOK_REDESCRIBE.test(prompt)) {
      return {
        ok: false,
        error: "final_prompt_redescribes_start_frame",
        hint:
          "Start frame already holds look. Drop appearance/wardrobe prose; keep motion, camera, audio, and constraints (~60–100 words).",
      };
    }
    if (words > 130) {
      warnings.push(
        "I2V prompts work best around 60–100 words; longer text often dilutes camera/action obedience.",
      );
    }
  } else if (words > 220) {
    warnings.push(
      "Very long prompts can dilute obedience — prefer a tight shot list over essay prose.",
    );
  }

  if (args.videoType === "hypermotion_ad" && !/\b(?:hook|macro|product|cut|whip|orbit|lock)\b/i.test(prompt)) {
    warnings.push(
      "Hypermotion ads usually need a hard hook, product continuity, and a clear end lock in the prompt.",
    );
  }

  return { ok: true, warnings: warnings.length ? warnings : undefined };
}
