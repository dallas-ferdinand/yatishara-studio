/**
 * Assistance workflow catalog + completeness policy.
 *
 * Modes (image/video/script/element) share one brief pipeline.
 * Video types (standard | hypermotion_ad) inject specialized requirements.
 */
import {
  type AssistedBriefPayload,
  type AssistedBriefPatch,
  type AssistedMode,
  type AttachmentRole,
  type CompilerKind,
  type GuidedQuestion,
  type ProposedStyleDecision,
  type TimedBeat,
  type VideoType,
  emptyBriefPayload,
  emptyAudioPlan,
  emptyBrandDecisions,
} from "./guidedVideoTypes";
import {
  clampBeatsToDurationPlan,
  clampVideoDurationSeconds,
  defaultBeatsForDuration,
  planVideoDuration,
  videoDurationAgentGuidance,
} from "./videoDurationPlan";
import { seedancePromptCraftGuidance } from "./seedancePromptCraft";

export const MAX_QUESTIONS_PER_TURN = 3;

export type AttachmentPresence = {
  roles: AttachmentRole[];
  hasProduct: boolean;
  hasLogo: boolean;
  hasStyle: boolean;
  hasAnyMedia: boolean;
};

export type PolicyContext = {
  mode: AssistedMode;
  videoType?: VideoType;
  payload: AssistedBriefPayload;
  attachments: AttachmentPresence;
  offeredOptionalIds: string[];
  skippedOptionalIds: string[];
  lockedFields: string[];
};

export type PolicyResult = {
  complete: boolean;
  blockers: string[];
  questions: GuidedQuestion[];
  warnings: string[];
};

export type WorkflowDefinition = {
  slug: string;
  compiler: CompilerKind;
  label: string;
  description: string;
  modes: AssistedMode[];
  systemContext: string;
  evaluate: (ctx: PolicyContext) => PolicyResult;
  compilePrompt: (payload: AssistedBriefPayload, attachments: AttachmentPresence) => string;
};

const BASE_ASSISTANT_RULES = [
  "You are Studio Assistance — a multi-turn creative collaborator in chat.",
  "Done WITH the user in chat, not FOR them via forms. Users reply in the composer and may attach media there.",
  "Chat voice: short, casual, human. 1–2 sentences max. Light emoji ok (❤️ 😂 🙂 😏). Never narrate tool updates.",
  "Think like a creative director every turn: infer what a successful finished outcome requires from this specific request, then update the agent plan before asking or reviewing.",
  "Never invent logo, CTA, contact number, offer text, or product identity.",
  "Ask about unresolved facts that affect truth, identity, usability, or the core outcome. Make noncritical creative choices yourself and mark them as assumptions.",
  "Return schema-valid JSON only. Decision is ask | review_ready.",
  "Ask at most one short high-leverage chat question per turn. Avoid both shallow rushing and unnecessary interrogation.",
  "Only review_ready when the intended outcome is clear, material unknowns are resolved, and the proposed deliverable has enough concrete substance to succeed. A user's request to proceed does not authorize inventing missing facts.",
].join(" ");

const ILLUSTRATED_STYLE =
  /\b(?:illustrat(?:ed|ion)(?:[_ -]?[23]d)?|cartoon|anime|cel[- ]?shad(?:ed|ing)|comic(?: book)?|vector art|2d animation|3d animation|stylized animation|toon)\b/i;
const PHOTOREAL_STYLE =
  /\b(?:photo[- ]?real(?:istic|ism)?|photographic|live[- ]?action|true[- ]to[- ]life|lifelike|real[- ]world photography)\b/i;
const NEGATED_STYLE =
  /\b(?:no|not|avoid|without|non)[ -]+(?:photo[- ]?real(?:istic|ism)?|photographic|live[- ]?action|illustrat(?:ed|ion)|cartoon|anime)\b/gi;

function explicitStyle(text: string | undefined): "photoreal" | "illustrated" | undefined {
  const asserted = String(text ?? "").replace(NEGATED_STYLE, " ");
  if (PHOTOREAL_STYLE.test(asserted)) return "photoreal";
  if (ILLUSTRATED_STYLE.test(asserted)) return "illustrated";
  return undefined;
}

/**
 * Detect only an explicit request that contradicts supplied style context.
 * Generic words such as "cinematic" and "realistic motion" intentionally do not count.
 */
export function detectExplicitStyleConflict(args: {
  userRequest?: string;
  currentVisualDirection?: string;
  styleContext?: string[];
}): ProposedStyleDecision {
  const requested = explicitStyle(args.userRequest);
  const supplied = explicitStyle(
    [args.currentVisualDirection, ...(args.styleContext ?? [])]
      .filter(Boolean)
      .join("\n"),
  );
  if (requested === "photoreal" && supplied === "illustrated") {
    return {
      decision: "ask",
      value: "photoreal",
      conflict: "photoreal_requested_with_illustrated_context",
      reason: "The request explicitly asks for photoreal output, but the supplied style context is illustrated.",
    };
  }
  if (requested === "illustrated" && supplied === "photoreal") {
    return {
      decision: "ask",
      value: "illustrated",
      conflict: "illustrated_requested_with_photoreal_context",
      reason: "The request explicitly asks for illustrated output, but the supplied style context is photoreal.",
    };
  }
  return {
    decision: requested ? "change" : "keep",
    value: requested,
    conflict: "none",
  };
}

export function baseAssistantSystemPrompt(mode: AssistedMode, videoType?: VideoType): string {
  const modeLine =
    mode === "video"
      ? `Mode: video. Video type: ${videoType ?? "standard"}.`
      : `Mode: ${mode}.`;
  return `${BASE_ASSISTANT_RULES}\n${modeLine}`;
}

function hasRole(attachments: AttachmentPresence, role: AttachmentRole): boolean {
  return attachments.roles.includes(role);
}

function optionalAlreadyHandled(
  ctx: PolicyContext,
  optionalId: string,
): boolean {
  return (
    ctx.offeredOptionalIds.includes(optionalId) ||
    ctx.skippedOptionalIds.includes(optionalId)
  );
}

function clampBeats(
  beats: TimedBeat[] | undefined,
  duration: number,
  videoType: VideoType = "hypermotion_ad",
): TimedBeat[] {
  return clampBeatsToDurationPlan(beats, duration, videoType);
}

function defaultHypermotionBeats(duration: number, subject: string): TimedBeat[] {
  return defaultBeatsForDuration(duration, subject, "hypermotion_ad");
}

function audioContradiction(payload: AssistedBriefPayload): string | undefined {
  const a = payload.audio;
  if (a.voiceover === "include" && !a.voiceoverCopy?.trim()) {
    // VO copy is nice-to-have; model can invent temporary VO placeholders only when include is set via assumption — not a blocker.
  }
  return undefined;
}

function evaluateGenericImage(ctx: PolicyContext): PolicyResult {
  const blockers: string[] = [];
  const questions: GuidedQuestion[] = [];
  const warnings: string[] = [];
  const subject = ctx.payload.subject?.trim() || "";
  const hasCreativeDirection = Boolean(
    ctx.payload.visualDirection?.trim() ||
      ctx.payload.offer?.trim() ||
      ctx.payload.brand.offerText?.trim() ||
      ctx.payload.keyMessage?.trim() ||
      ctx.payload.objective?.trim() ||
      ctx.payload.setting?.trim() ||
      ctx.attachments.roles.includes("style") ||
      ctx.attachments.roles.includes("product"),
  );
  const promotionalDesign = /\b(?:flyer|poster|menu|promo(?:tional)?|advert(?:isement|ising)?|social (?:post|story)|sale graphic)\b/i.test(
    [
      ctx.payload.subject,
      ctx.payload.objective,
      ctx.payload.keyMessage,
      ctx.payload.offer,
      ctx.payload.notes,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!subject && !ctx.attachments.hasAnyMedia) {
    blockers.push("Need a subject description or a reference image.");
    questions.push({
      id: "subject_or_ref",
      kind: "text",
      field: "subject",
      prompt: "What should the flyer or image feature?",
      required: true,
    });
  } else if (!hasCreativeDirection) {
    blockers.push("Need visual direction, offer, or a clear creative goal.");
    questions.push({
      id: "image_creative_direction",
      kind: "text",
      field: "visualDirection",
      prompt: "What look or mood should this have, and is there an offer or headline?",
      required: true,
    });
  }
  if (
    promotionalDesign &&
    !ctx.payload.production.aspectRatio?.trim() &&
    !ctx.lockedFields.includes("production.aspectRatio")
  ) {
    blockers.push("Promotional layout format has not been confirmed by the user.");
    questions.push({
      id: "promotional_format",
      kind: "choice",
      field: "production.aspectRatio",
      prompt: "What format should the flyer use?",
      required: true,
      options: [
        { value: "9:16", label: "Story / status — 9:16 vertical" },
        { value: "4:5", label: "Social feed — 4:5 portrait" },
        { value: "1:1", label: "Square post — 1:1" },
        { value: "16:9", label: "Landscape — 16:9" },
      ],
    });
  }

  return {
    complete: blockers.length === 0,
    blockers,
    questions: questions.slice(0, MAX_QUESTIONS_PER_TURN),
    warnings,
  };
}

function evaluateGenericScript(ctx: PolicyContext): PolicyResult {
  const blockers: string[] = [];
  const questions: GuidedQuestion[] = [];
  if (!ctx.payload.subject?.trim() && !ctx.payload.keyMessage?.trim() && !ctx.payload.objective?.trim()) {
    blockers.push("Need a brief for the script.");
    questions.push({
      id: "script_brief",
      kind: "text",
      field: "objective",
      prompt: "What's the script for? Share the goal, product, or story.",
      required: true,
    });
  }
  return {
    complete: blockers.length === 0,
    blockers,
    questions: questions.slice(0, MAX_QUESTIONS_PER_TURN),
    warnings: [],
  };
}

function evaluateGenericElement(ctx: PolicyContext): PolicyResult {
  const blockers: string[] = [];
  const questions: GuidedQuestion[] = [];
  if (!ctx.payload.subject?.trim()) {
    blockers.push("Element needs a name/subject.");
    questions.push({
      id: "element_name",
      kind: "text",
      field: "subject",
      prompt: "Name this element (character, prop, location, or style).",
      required: true,
    });
  }
  if (!ctx.attachments.hasAnyMedia) {
    questions.push({
      id: "element_refs",
      kind: "upload",
      prompt: "Optional: upload reference photos so we can lock identity.",
      uploadRole: "reference",
      allowLeaveOut: true,
      required: false,
    });
  }
  return {
    complete: blockers.length === 0,
    blockers,
    questions: questions.slice(0, MAX_QUESTIONS_PER_TURN),
    warnings: [],
  };
}

function evaluateStandardVideo(ctx: PolicyContext): PolicyResult {
  const blockers: string[] = [];
  const questions: GuidedQuestion[] = [];
  const warnings: string[] = [];
  const duration = ctx.payload.production.durationSeconds ?? 8;

  if (!ctx.payload.subject?.trim() && !ctx.attachments.hasAnyMedia) {
    blockers.push("Need a subject or video/image reference.");
    questions.push({
      id: "video_subject",
      kind: "text",
      field: "subject",
      prompt: "What should this video show?",
      required: true,
    });
  }
  if (duration < 4 || duration > 15) {
    blockers.push("Duration must be 4–15 seconds.");
  }
  const audioIssue = audioContradiction(ctx.payload);
  if (audioIssue) warnings.push(audioIssue);

  return {
    complete: blockers.length === 0,
    blockers,
    questions: questions.slice(0, MAX_QUESTIONS_PER_TURN),
    warnings,
  };
}

function evaluateHypermotion(ctx: PolicyContext): PolicyResult {
  const blockers: string[] = [];
  const questions: GuidedQuestion[] = [];
  const warnings: string[] = [];
  const duration = ctx.payload.production.durationSeconds ?? 8;
  const subject = ctx.payload.subject?.trim() || "";
  const brand = ctx.payload.brand;

  if (!subject && !ctx.attachments.hasProduct && !ctx.attachments.hasAnyMedia) {
    blockers.push("Hypermotion ads need a product/subject.");
    questions.push({
      id: "hypermotion_subject",
      kind: "text",
      field: "subject",
      prompt: "What product or subject is this Hypermotion ad for?",
      required: true,
    });
  }

  if (!ctx.payload.objective?.trim() && !ctx.payload.keyMessage?.trim()) {
    blockers.push("Need the intended outcome or key message.");
    questions.push({
      id: "hypermotion_objective",
      kind: "text",
      field: "objective",
      prompt: "What's the goal — awareness, click-through, launch, or something else?",
      required: true,
    });
  }

  if (duration < 4 || duration > 15) {
    blockers.push("Duration must be 4–15 seconds.");
  }

  if (!ctx.payload.production.aspectRatio) {
    blockers.push("Aspect ratio is required.");
  }
  if (!ctx.payload.production.resolution) {
    blockers.push("Resolution is required.");
  }

  if (!brand.productFidelity) {
    blockers.push("Choose product fidelity: exact match vs stylized.");
    questions.push({
      id: "product_fidelity",
      kind: "choice",
      field: "brand.productFidelity",
      prompt: "Should the product look exact (match refs) or conceptual (stylized)?",
      required: true,
      options: [
        { value: "exact", label: "Exact — match product refs" },
        { value: "conceptual", label: "Conceptual — stylized take" },
      ],
    });
  } else if (
    brand.productFidelity === "exact" &&
    !ctx.attachments.hasProduct &&
    !ctx.attachments.hasAnyMedia
  ) {
    // Any attached image/reference (including flyer artwork) can satisfy exact
    // fidelity for promo jobs; only block when there is no media at all.
    blockers.push("Exact fidelity needs a product image or element.");
    questions.push({
      id: "product_upload",
      kind: "upload",
      prompt: "Upload your product image so we can lock identity.",
      uploadRole: "product",
      required: true,
    });
  }

  // Optional brand extras — offer once with leave-out.
  if (brand.logo === "undecided" && !optionalAlreadyHandled(ctx, "logo")) {
    questions.push({
      id: "logo",
      kind: "upload",
      field: "brand.logo",
      prompt: "Want a logo end-card? Upload your logo here, or leave it out.",
      uploadRole: "logo",
      allowLeaveOut: true,
      required: false,
      options: [
        { value: "omit", label: "Leave logo out", leaveOut: true },
      ],
    });
  } else if (brand.logo === "include" && !hasRole(ctx.attachments, "logo") && !ctx.attachments.hasLogo) {
    blockers.push("Logo include selected but no logo uploaded.");
    questions.push({
      id: "logo_upload_required",
      kind: "upload",
      prompt: "Upload the logo to include, or switch to leave it out.",
      uploadRole: "logo",
      allowLeaveOut: true,
      required: true,
      options: [{ value: "omit", label: "Leave logo out", leaveOut: true }],
    });
  }

  if (brand.ctaMode === "undecided" && !optionalAlreadyHandled(ctx, "cta")) {
    questions.push({
      id: "cta",
      kind: "choice",
      field: "brand.ctaMode",
      prompt: "Add a call to action? Custom text, contact number, or leave it out.",
      allowLeaveOut: true,
      required: false,
      options: [
        { value: "custom", label: "Custom CTA text" },
        { value: "contact", label: "Contact number / handle" },
        { value: "omit", label: "Leave CTA out", leaveOut: true },
      ],
    });
  } else if (brand.ctaMode === "custom" && !brand.ctaText?.trim()) {
    blockers.push("Custom CTA needs text.");
    questions.push({
      id: "cta_text",
      kind: "text",
      field: "brand.ctaText",
      prompt: "Type the CTA (e.g. Shop now, Get the app).",
      required: true,
    });
  } else if (brand.ctaMode === "contact" && !brand.contactValue?.trim()) {
    blockers.push("Contact CTA needs a number or handle.");
    questions.push({
      id: "cta_contact",
      kind: "text",
      field: "brand.contactValue",
      prompt: "Enter the contact number or social handle to show.",
      required: true,
    });
  }

  if (
    !brand.offerText?.trim() &&
    !optionalAlreadyHandled(ctx, "offer") &&
    brand.ctaMode !== "undecided"
  ) {
    // Only nudge offer after CTA decision, once.
    if (!ctx.offeredOptionalIds.includes("offer")) {
      questions.push({
        id: "offer",
        kind: "text",
        field: "brand.offerText",
        prompt: "Any on-screen offer or promo line? Leave blank to skip.",
        allowLeaveOut: true,
        required: false,
      });
    }
  }

  const durationPlan = planVideoDuration(duration, "hypermotion_ad");
  const beats = clampBeats(ctx.payload.timedBeats, duration, "hypermotion_ad");
  if (beats.length < durationPlan.minBeats) {
    warnings.push(
      `Will expand to ${durationPlan.beatCount} timed Hypermotion beats for a ${durationPlan.durationSeconds}s clip on compile.`,
    );
  } else if (beats.length > durationPlan.maxBeats) {
    warnings.push(
      `Beat count will be trimmed to ${durationPlan.maxBeats} for a ${durationPlan.durationSeconds}s clip.`,
    );
  }

  // Audio must be explicit for hypermotion (defaults are fine if set).
  if (!ctx.payload.audio) {
    blockers.push("Audio plan missing.");
  }

  return {
    complete: blockers.length === 0 && questions.filter((q) => q.required).length === 0,
    blockers,
    questions: questions.slice(0, MAX_QUESTIONS_PER_TURN),
    warnings,
  };
}

function compileHypermotionPrompt(
  payload: AssistedBriefPayload,
  attachments: AttachmentPresence,
): string {
  const durationPlan = planVideoDuration(payload.production.durationSeconds, "hypermotion_ad");
  const duration = durationPlan.durationSeconds;
  const subject = payload.subject?.trim() || "the product";
  let beats = clampBeats(payload.timedBeats, duration, "hypermotion_ad");
  if (beats.length < durationPlan.minBeats) {
    beats = defaultHypermotionBeats(duration, subject);
  }

  const fidelity =
    payload.brand.productFidelity === "exact"
      ? "Exact product fidelity — match reference identity, materials, proportions."
      : "Conceptual product look — stylized but recognizable.";

  const audioLines: string[] = [];
  audioLines.push(
    payload.audio.voiceover === "include"
      ? `Voiceover: include${payload.audio.voiceoverCopy ? ` — "${payload.audio.voiceoverCopy.trim()}"` : ""}.`
      : "Voiceover: none.",
  );
  audioLines.push(
    payload.audio.sfx === "include"
      ? `SFX: include${payload.audio.sfxNotes ? ` — ${payload.audio.sfxNotes.trim()}` : " kinetic hits and whooshes"}.`
      : "SFX: none.",
  );
  audioLines.push(
    payload.audio.music === "include"
      ? `Music: include${payload.audio.musicMood ? ` — ${payload.audio.musicMood.trim()}` : " driving hypermotion underscore"}.`
      : "Music: none.",
  );

  const brandLines: string[] = [];
  if (payload.brand.logo === "include" || attachments.hasLogo) {
    brandLines.push("End with clear logo mark from reference.");
  } else {
    brandLines.push("No logo end-card.");
  }
  if (payload.brand.ctaMode === "custom" && payload.brand.ctaText?.trim()) {
    brandLines.push(`On-screen CTA: "${payload.brand.ctaText.trim()}".`);
  } else if (payload.brand.ctaMode === "contact" && payload.brand.contactValue?.trim()) {
    brandLines.push(
      `On-screen contact, rendered verbatim with all punctuation: "${payload.brand.contactValue.trim()}".`,
    );
  } else {
    brandLines.push("No on-screen CTA text.");
  }
  if (payload.brand.offerText?.trim()) {
    brandLines.push(`Offer line: "${payload.brand.offerText.trim()}".`);
  }

  const editCueForBeat = (index: number): string => {
    const isLast = index === beats.length - 1;
    if (isLast) {
      const holdSeconds = Math.min(
        2,
        Math.max(1.5, beats[index]!.endSec - beats[index]!.startSec),
      );
      return `decelerate into a stable hero/CTA lock; readable hold ~${holdSeconds.toFixed(1)}s; no transition out`;
    }
    if (index === 0) {
      return "impact ramp: brief anticipation → fast hook acceleration → clean detail landing; ramp-to-cut at peak motion";
    }
    if (index % 3 === 1) {
      return "elliptical action/graphic match: remove the middle; match shape, position, and motion direction into the next shot";
    }
    if (index % 3 === 2) {
      return "one-flow speed ramp: normal/slow entry → accelerated middle → controlled slow landing on texture";
    }
    return "ramp-to-cut through foreground occlusion or object wipe; preserve screen direction and product identity";
  };
  const beatBlock = beats
    .map(
      (b, i) =>
        `${i + 1}. ${b.startSec.toFixed(1)}–${b.endSec.toFixed(1)}s: ${b.action}${
          b.camera ? ` | Camera: ${b.camera}` : ""
        } | Speed/edit: ${editCueForBeat(i)} | Audio: land the transition on a music/SFX accent without masking voiceover`,
    )
    .join("\n");
  const resolutionLabel = String(payload.production.resolution ?? "").includes(
    "1920",
  )
    ? "1080p"
    : "720p";

  return [
    `Hypermotion ad · ${durationPlan.compileHint} · ${payload.production.aspectRatio ?? "9:16"} · ${resolutionLabel}`,
    `Subject: ${subject}`,
    payload.objective ? `Objective: ${payload.objective}` : null,
    payload.keyMessage ? `Message: ${payload.keyMessage}` : null,
    payload.hook ? `Hook: ${payload.hook}` : null,
    payload.setting ? `Setting: ${payload.setting}` : null,
    payload.visualDirection ? `Look: ${payload.visualDirection}` : null,
    fidelity,
    "",
    `Timed beats for ${duration}s (${durationPlan.pacing}; rapid cuts, macro texture, one coherent product continuity):`,
    beatBlock,
    "Edit rhythm: vary velocity; do not speed-ramp every moment. Keep match anchors and screen direction coherent, use blur/occlusion to hide cuts, and never morph the product or existing text.",
    "",
    "Audio:",
    ...audioLines,
    "",
    "Brand lock:",
    ...brandLines,
    "",
    "Constraints: one coherent edited Hypermotion sequence; no photoreal skin unless refs require; no chaotic camera stacking; one primary camera move per beat; no product/text morphing; preserve a readable final lock.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function compileStandardVideoPrompt(payload: AssistedBriefPayload): string {
  const durationPlan = planVideoDuration(payload.production.durationSeconds, "standard");
  const duration = durationPlan.durationSeconds;
  const subject = payload.subject?.trim() || payload.keyMessage?.trim() || "the scene";
  let beats = clampBeats(payload.timedBeats, duration, "standard");
  if (beats.length < durationPlan.minBeats) {
    beats = defaultBeatsForDuration(duration, subject, "standard");
  }
  const beatBlock = beats
    .map(
      (b, i) =>
        `${i + 1}. ${b.startSec.toFixed(1)}–${b.endSec.toFixed(1)}s: ${b.action}${
          b.camera ? ` | Camera: ${b.camera}` : ""
        }`,
    )
    .join("\n");
  const audio =
    payload.audio.voiceover === "include" ||
    payload.audio.sfx === "include" ||
    payload.audio.music === "include"
      ? `Audio: VO ${payload.audio.voiceover}, SFX ${payload.audio.sfx}, music ${payload.audio.music}.`
      : "Audio: silent.";
  return [
    `${durationPlan.compileHint} of ${subject}.`,
    payload.hook ? `Hook: ${payload.hook}` : null,
    payload.setting ? `Setting: ${payload.setting}` : null,
    payload.visualDirection ? `Look: ${payload.visualDirection}` : null,
    audio,
    "",
    `Structure (${durationPlan.pacing}):`,
    beatBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

function compileImagePrompt(
  payload: AssistedBriefPayload,
  attachments?: AttachmentPresence,
): string {
  const hasProductRef = Boolean(attachments?.roles.includes("product"));
  const fidelity =
    payload.brand.productFidelity ?? (hasProductRef ? "exact" : undefined);
  const promotionalDesign = /\b(?:flyer|poster|menu|promo(?:tional)?|advert(?:isement|ising)?|social (?:post|story)|sale graphic)\b/i.test(
    [
      payload.subject,
      payload.objective,
      payload.keyMessage,
      payload.offer,
      payload.notes,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return [
    promotionalDesign
      ? `Create a finished ${payload.production.aspectRatio ?? "portrait"} promotional flyer layout, not a plain hero product photo. Use a clear visual hierarchy, intentional graphic design, and ample readable negative space.`
      : null,
    payload.subject?.trim() ||
      (hasProductRef ? "Hero product from the attached reference photo" : "Subject"),
    payload.objective ? `Objective: ${payload.objective.trim()}` : null,
    payload.audience ? `Audience: ${payload.audience.trim()}` : null,
    payload.platform ? `Placement: ${payload.platform.trim()}` : null,
    payload.offer?.trim()
      ? `Offer: ${payload.offer.trim()}`
      : payload.brand.offerText?.trim()
        ? `Offer: ${payload.brand.offerText.trim()}`
        : null,
    payload.hook ? `Headline/hook: ${payload.hook.trim()}` : null,
    payload.visualDirection ? `Look: ${payload.visualDirection}` : null,
    payload.setting ? `Setting: ${payload.setting}` : null,
    payload.keyMessage ? `Message: ${payload.keyMessage}` : null,
    payload.brand.ctaMode === "custom" && payload.brand.ctaText?.trim()
      ? `CTA text: "${payload.brand.ctaText.trim()}"`
      : payload.brand.ctaMode === "contact" && payload.brand.contactValue?.trim()
        ? `Contact text, render verbatim with all punctuation: "${payload.brand.contactValue.trim()}"`
        : null,
    payload.notes ? `Additional requirements: ${payload.notes.trim()}` : null,
    promotionalDesign
      ? "Render all supplied headline, offer, date, price, and CTA copy prominently and exactly as written. Do not omit promotional text or invent unsupported copy."
      : null,
    fidelity === "exact"
      ? "Use the attached product reference image(s) as the exact hero product — match plating, ingredients, and presentation closely."
      : fidelity === "conceptual"
        ? "Use attached references for inspiration; product may be stylized."
        : null,
  ]
    .filter(Boolean)
    .join(". ");
}

function compileScriptBrief(payload: AssistedBriefPayload): string {
  return [
    payload.objective || payload.subject || "Script brief",
    payload.keyMessage ? `Message: ${payload.keyMessage}` : null,
    payload.audience ? `Audience: ${payload.audience}` : null,
    payload.notes ? `Notes: ${payload.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const WORKFLOWS: Record<string, WorkflowDefinition> = {
  image: {
    slug: "image",
    compiler: "generic_image",
    label: "Image",
    description: "Guided still generation",
    modes: ["image"],
    systemContext:
      "Shape a strong still quickly: capture hero subject/offer and mood. When a product photo is attached, treat it as the hero and prefer review_ready once subject+offer/look are clear — do not keep asking optional polish questions.",
    evaluate: evaluateGenericImage,
    compilePrompt: (payload, attachments) => compileImagePrompt(payload, attachments),
  },
  script: {
    slug: "script",
    compiler: "generic_script",
    label: "Script",
    description: "Guided script / document brief",
    modes: ["script"],
    systemContext:
      "Help shape a script brief: goal, audience, tone, and output type. Do not write the full script until review is approved.",
    evaluate: evaluateGenericScript,
    compilePrompt: (payload) => compileScriptBrief(payload),
  },
  element: {
    slug: "element",
    compiler: "generic_element",
    label: "Element",
    description: "Guided element sheet build",
    modes: ["element"],
    systemContext:
      "Help name the element and collect identity references before building a sheet.",
    evaluate: evaluateGenericElement,
    compilePrompt: (payload) =>
      `Build element sheet for: ${payload.subject ?? "unnamed"}. ${payload.notes ?? ""}`.trim(),
  },
  video_standard: {
    slug: "video_standard",
    compiler: "generic_video",
    label: "Standard video",
    description: "General guided video",
    modes: ["video"],
    systemContext: [
      "Help gather a clear subject, duration, and audio preferences for a single video clip.",
      "Always plan to the chosen duration (4–15s): short clips = one continuous moment;",
      "longer clips may use 2–3 beats. Never invent a story arc that needs more screen time than the clip.",
      "When writing finalPrompt, use Shot beats with concrete verbs and one camera move per beat — Seedance-ready, not mood copy.",
    ].join(" "),
    evaluate: evaluateStandardVideo,
    compilePrompt: (payload) => compileStandardVideoPrompt(payload),
  },
  video_hypermotion_ad: {
    slug: "video_hypermotion_ad",
    compiler: "hypermotion_ad",
    label: "Hypermotion ad",
    description: "Scroll-stopping rapid-cut product ad",
    modes: ["video"],
    systemContext: [
      "Video type: Hypermotion ad.",
      "Grammar: scroll-stopping opening, rapid cuts, extreme macro/product textures,",
      "aggressive but coherent camera energy, clear product continuity, single 4–15s clip.",
      "Scale beat count to duration (about 3 beats at 4–5s up to 7 at 13–15s); stretch action to fit the seconds,",
      "do not keep a fixed 4-beat template when length changes.",
      "finalPrompt still names one camera move per beat (hook → texture/product → lock); kinetic energy without stacking every move at once.",
      "Optional but important: logo, CTA/contact, offer — always offer leave-out.",
      "Do not invent brand assets. Prefer product refs for exact fidelity.",
    ].join(" "),
    evaluate: evaluateHypermotion,
    compilePrompt: compileHypermotionPrompt,
  },
};

export function resolveWorkflow(
  mode: AssistedMode,
  videoType?: VideoType,
): WorkflowDefinition {
  if (mode === "video") {
    if (videoType === "hypermotion_ad") return WORKFLOWS.video_hypermotion_ad;
    return WORKFLOWS.video_standard;
  }
  if (mode === "image") return WORKFLOWS.image;
  if (mode === "script") return WORKFLOWS.script;
  return WORKFLOWS.element;
}

export function resolveCompilerKind(
  mode: AssistedMode,
  videoType?: VideoType,
): CompilerKind {
  return resolveWorkflow(mode, videoType).compiler;
}

export function evaluateBrief(ctx: PolicyContext): PolicyResult {
  const workflow = resolveWorkflow(ctx.mode, ctx.videoType);
  const result = workflow.evaluate(ctx);
  // Drop required questions from blockers when we're still asking — complete means no blockers AND no required pending questions.
  const requiredPending = result.questions.filter((q) => q.required);
  return {
    ...result,
    complete: result.blockers.length === 0 && requiredPending.length === 0,
  };
}

export function compileBriefPrompt(
  mode: AssistedMode,
  videoType: VideoType | undefined,
  payload: AssistedBriefPayload,
  attachments: AttachmentPresence,
): string {
  return resolveWorkflow(mode, videoType).compilePrompt(payload, attachments);
}

export function workflowSystemContext(
  mode: AssistedMode,
  videoType?: VideoType,
  durationSeconds?: number,
  options?: { hasStartFrame?: boolean },
): string {
  const workflow = resolveWorkflow(mode, videoType);
  const parts = [
    baseAssistantSystemPrompt(mode, videoType),
    `Workflow: ${workflow.systemContext}`,
  ];
  if (mode === "video") {
    parts.push(
      `Duration plan: ${videoDurationAgentGuidance(
        durationSeconds ?? clampVideoDurationSeconds(undefined),
        videoType,
      )}`,
    );
    parts.push(
      seedancePromptCraftGuidance({
        videoType,
        hasStartFrame: options?.hasStartFrame,
      }),
    );
  }
  return parts.join("\n");
}

const TEXT_FIELDS = [
  "subject",
  "objective",
  "audience",
  "keyMessage",
  "offer",
  "platform",
  "hook",
  "setting",
  "visualDirection",
  "notes",
] as const;

function safeText(value: unknown, maxLength = 4_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

/**
 * Format North American Numbering Plan numbers for readable on-screen copy
 * while preserving labels such as "Call or WhatsApp".
 */
export function formatNanpContactNumbers(value: string): string {
  return value.replace(
    /(^|[^\d])(?:\+?1[\s().-]*)?(\(?\d{3}\)?)[\s.-]*(\d{3})[\s.-]*(\d{4})(?=$|[^\d])/g,
    (_match, leading: string, rawArea: string, exchange: string, line: string) => {
      const area = rawArea.replace(/\D/g, "");
      return `${leading}+1 (${area}) ${exchange}-${line}`;
    },
  );
}

/**
 * Extract the first NANP / WhatsApp contact from free text for CTA prefill.
 */
export function extractContactFromText(text: string): string | undefined {
  const source = text?.trim();
  if (!source) return undefined;
  const match = source.match(
    /(?:whatsapp\s*)?(?:\+?1[\s().-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/i,
  );
  if (!match?.[0]) return undefined;
  const formatted = formatNanpContactNumbers(match[0].trim());
  const number = formatted.match(/\+1 \(\d{3}\) \d{3}-\d{4}/)?.[0];
  if (!number) return formatted.slice(0, 80);
  return /whatsapp/i.test(match[0]) || /whatsapp/i.test(source.slice(Math.max(0, (match.index ?? 0) - 24), (match.index ?? 0) + match[0].length + 8))
    ? `WhatsApp ${number}`
    : number;
}

const ASSISTANCE_ASPECT_RATIOS = new Set([
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "4:5",
  "21:9",
]);

export function normalizeAssistanceAspectRatio(
  value: unknown,
): string | undefined {
  const text = safeText(value, 40)?.toLowerCase();
  if (!text) return undefined;
  const aliases: Record<string, string> = {
    vertical: "9:16",
    portrait: "9:16",
    story: "9:16",
    status: "9:16",
    landscape: "16:9",
    horizontal: "16:9",
    square: "1:1",
  };
  const canonical = aliases[text] ?? text.replace(/\s+/g, "");
  return ASSISTANCE_ASPECT_RATIOS.has(canonical) ? canonical : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * Treat model output as untrusted data. Unknown fields and invalid nested values are dropped.
 */
export function normalizeBriefPatch(value: unknown): AssistedBriefPatch | undefined {
  const raw = recordValue(value);
  if (!raw) return undefined;
  const patch: AssistedBriefPatch = {};

  for (const field of TEXT_FIELDS) {
    const text = safeText(raw[field]);
    if (text !== undefined) patch[field] = text;
  }

  if (Array.isArray(raw.timedBeats)) {
    const beats = raw.timedBeats
      .slice(0, 7)
      .map(recordValue)
      .filter((beat): beat is Record<string, unknown> => Boolean(beat))
      .flatMap((beat) => {
        const startSec = typeof beat.startSec === "number" ? beat.startSec : NaN;
        const endSec = typeof beat.endSec === "number" ? beat.endSec : NaN;
        const action = safeText(beat.action, 1_000);
        if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || !action || endSec <= startSec) {
          return [];
        }
        const camera = safeText(beat.camera, 500);
        return [{ startSec: Math.max(0, startSec), endSec: Math.max(0, endSec), action, camera }];
      });
    if (beats.length) patch.timedBeats = beats;
  }

  const brand = recordValue(raw.brand);
  if (brand) {
    const next: AssistedBriefPatch["brand"] = {};
    if (brand.productFidelity === "exact" || brand.productFidelity === "conceptual") {
      next.productFidelity = brand.productFidelity;
    }
    if (brand.logo === "include" || brand.logo === "omit" || brand.logo === "undecided") {
      next.logo = brand.logo;
    }
    if (
      brand.ctaMode === "custom" ||
      brand.ctaMode === "contact" ||
      brand.ctaMode === "omit" ||
      brand.ctaMode === "undecided"
    ) {
      next.ctaMode = brand.ctaMode;
    }
    for (const field of ["ctaText", "contactValue", "offerText"] as const) {
      const text = safeText(brand[field], 1_000);
      if (text !== undefined) {
        next[field] =
          field === "contactValue" ? formatNanpContactNumbers(text) : text;
      }
    }
    if (Object.keys(next).length) patch.brand = next;
  }

  const audio = recordValue(raw.audio);
  if (audio) {
    const next: AssistedBriefPatch["audio"] = {};
    for (const field of ["voiceover", "sfx", "music"] as const) {
      if (audio[field] === "include" || audio[field] === "none") next[field] = audio[field];
    }
    for (const field of ["voiceoverCopy", "musicMood", "sfxNotes"] as const) {
      const text = safeText(audio[field], 2_000);
      if (text !== undefined) next[field] = text;
    }
    if (Object.keys(next).length) patch.audio = next;
  }

  const production = recordValue(raw.production);
  if (production) {
    const next: AssistedBriefPatch["production"] = {};
    if (
      typeof production.durationSeconds === "number" &&
      Number.isFinite(production.durationSeconds) &&
      production.durationSeconds > 0 &&
      production.durationSeconds <= 300
    ) {
      next.durationSeconds = production.durationSeconds;
    }
    const aspectRatio = normalizeAssistanceAspectRatio(production.aspectRatio);
    if (aspectRatio) next.aspectRatio = aspectRatio;
    for (const field of [
      "resolution",
      "quality",
      "styleSheetElementId",
      "referenceIntent",
      "scriptType",
      "elementType",
    ] as const) {
      const text = safeText(production[field], 1_000);
      if (text !== undefined) next[field] = text;
    }
    if (typeof production.skipPromptEnhancement === "boolean") {
      next.skipPromptEnhancement = production.skipPromptEnhancement;
    }
    if (Object.keys(next).length) patch.production = next;
  }

  return Object.keys(patch).length ? patch : undefined;
}

/**
 * Merge a model/user patch into the brief.
 * Locked fields are skipped unless `forceUnlock` lists them (current user turn).
 */
export function mergeBriefPayload(args: {
  current: AssistedBriefPayload;
  patch?: AssistedBriefPatch | null;
  lockedFields: string[];
  forceUnlock?: string[];
}): { payload: AssistedBriefPayload; newlyInferred: string[] } {
  const locked = new Set(args.lockedFields);
  const unlock = new Set(args.forceUnlock ?? []);
  const newlyInferred: string[] = [];
  const next: AssistedBriefPayload = {
    ...emptyBriefPayload(args.current.production),
    ...args.current,
    brand: { ...args.current.brand },
    audio: { ...args.current.audio },
    production: { ...args.current.production },
    timedBeats: args.current.timedBeats ? [...args.current.timedBeats] : undefined,
  };

  const patch = normalizeBriefPatch(args.patch);
  if (!patch) return { payload: next, newlyInferred };

  function canWrite(path: string): boolean {
    if (unlock.has(path)) return true;
    return !locked.has(path);
  }

  function assignScalar<K extends keyof AssistedBriefPayload>(
    key: K,
    value: AssistedBriefPayload[K] | undefined,
  ) {
    if (value === undefined) return;
    if (!canWrite(String(key))) return;
    if (next[key] !== value) newlyInferred.push(String(key));
    (next as Record<string, unknown>)[String(key)] = value;
  }

  assignScalar("subject", patch.subject);
  assignScalar("objective", patch.objective);
  assignScalar("audience", patch.audience);
  assignScalar("keyMessage", patch.keyMessage);
  assignScalar("offer", patch.offer);
  assignScalar("platform", patch.platform);
  assignScalar("hook", patch.hook);
  assignScalar("setting", patch.setting);
  assignScalar("visualDirection", patch.visualDirection);
  assignScalar("notes", patch.notes);

  if (patch.timedBeats && canWrite("timedBeats")) {
    next.timedBeats = patch.timedBeats;
    newlyInferred.push("timedBeats");
  }

  if (patch.brand) {
    for (const [key, value] of Object.entries(patch.brand)) {
      if (value === undefined) continue;
      const path = `brand.${key}`;
      if (!canWrite(path)) continue;
      (next.brand as Record<string, unknown>)[key] = value;
      newlyInferred.push(path);
    }
  }
  if (patch.audio) {
    for (const [key, value] of Object.entries(patch.audio)) {
      if (value === undefined) continue;
      const path = `audio.${key}`;
      if (!canWrite(path)) continue;
      (next.audio as Record<string, unknown>)[key] = value;
      newlyInferred.push(path);
    }
  }
  if (patch.production) {
    for (const [key, value] of Object.entries(patch.production)) {
      if (value === undefined) continue;
      const path = `production.${key}`;
      if (!canWrite(path)) continue;
      (next.production as Record<string, unknown>)[key] = value;
      newlyInferred.push(path);
    }
  }

  return { payload: next, newlyInferred };
}

const MODE_COMPATIBLE_PATHS: Record<AssistedMode, Set<string>> = {
  image: new Set([
    ...TEXT_FIELDS,
    "production.aspectRatio",
    "production.resolution",
    "production.quality",
    "production.styleSheetElementId",
    "production.referenceIntent",
    "production.skipPromptEnhancement",
  ]),
  video: new Set([
    ...TEXT_FIELDS,
    "timedBeats",
    "brand.productFidelity",
    "brand.logo",
    "brand.ctaMode",
    "brand.ctaText",
    "brand.contactValue",
    "brand.offerText",
    "audio.voiceover",
    "audio.sfx",
    "audio.music",
    "audio.voiceoverCopy",
    "audio.musicMood",
    "audio.sfxNotes",
    "production.durationSeconds",
    "production.aspectRatio",
    "production.resolution",
    "production.quality",
    "production.styleSheetElementId",
    "production.referenceIntent",
    "production.skipPromptEnhancement",
    "videoType",
  ]),
  script: new Set([
    ...TEXT_FIELDS,
    "production.scriptType",
    "production.referenceIntent",
    "production.skipPromptEnhancement",
  ]),
  element: new Set([
    ...TEXT_FIELDS,
    "production.elementType",
    "production.aspectRatio",
    "production.resolution",
    "production.quality",
    "production.styleSheetElementId",
    "production.referenceIntent",
    "production.skipPromptEnhancement",
  ]),
};

export function transitionAssistedMode(args: {
  currentMode: AssistedMode;
  nextMode: AssistedMode;
  currentVideoType?: VideoType;
  nextVideoType?: VideoType;
  payload: AssistedBriefPayload;
  lockedFields?: string[];
}): {
  mode: AssistedMode;
  videoType?: VideoType;
  payload: AssistedBriefPayload;
  lockedFields: string[];
  resetFields: string[];
} {
  const switchingMode = args.currentMode !== args.nextMode;
  const switchingVideoType =
    args.nextMode === "video" &&
    (args.currentVideoType ?? "standard") !== (args.nextVideoType ?? "standard");
  if (!switchingMode && !switchingVideoType) {
    return {
      mode: args.nextMode,
      videoType: args.nextMode === "video" ? args.nextVideoType ?? "standard" : undefined,
      payload: args.payload,
      lockedFields: [...(args.lockedFields ?? [])],
      resetFields: [],
    };
  }

  const resetFields: string[] = [];
  const next: AssistedBriefPayload = {
    ...args.payload,
    brand: { ...args.payload.brand },
    audio: { ...args.payload.audio },
    production: { ...args.payload.production },
    timedBeats: args.payload.timedBeats ? [...args.payload.timedBeats] : undefined,
  };

  if (switchingMode) {
    if (args.nextMode !== "video") {
      if (next.timedBeats) resetFields.push("timedBeats");
      next.timedBeats = undefined;
      next.audio = emptyAudioPlan();
      next.brand = emptyBrandDecisions();
      resetFields.push("audio", "brand");
      delete next.production.durationSeconds;
    }
    // Image tiers (1K/2K/4K) must not leak into Seedance video jobs as WxH.
    if (args.nextMode === "video") {
      const res = String(next.production.resolution ?? "");
      if (/^(1k|2k|3k|4k)$/i.test(res.trim())) {
        next.production.resolution = "1280x720";
        resetFields.push("production.resolution");
      } else if (!res.trim()) {
        next.production.resolution = "1280x720";
      }
    }
    if (args.nextMode === "image") {
      const res = String(next.production.resolution ?? "");
      if (/^\d+x\d+$/i.test(res.trim()) || /^(480p|720p|1080p)$/i.test(res.trim())) {
        next.production.resolution = "2K";
        resetFields.push("production.resolution");
      }
    }
    if (args.nextMode !== "script") {
      if (next.production.scriptType) resetFields.push("production.scriptType");
      delete next.production.scriptType;
    }
    if (args.nextMode !== "element") {
      if (next.production.elementType) resetFields.push("production.elementType");
      delete next.production.elementType;
    }
  }

  // Hypermotion beat plans are type-specific; keep resolved brand/CTA/contact.
  if (
    args.nextMode === "video" &&
    (switchingMode || switchingVideoType) &&
    (args.nextVideoType ?? "standard") === "standard"
  ) {
    if (next.timedBeats) resetFields.push("timedBeats");
    next.timedBeats = undefined;
  }

  const compatible = MODE_COMPATIBLE_PATHS[args.nextMode];
  return {
    mode: args.nextMode,
    videoType: args.nextMode === "video" ? args.nextVideoType ?? "standard" : undefined,
    payload: next,
    lockedFields: (args.lockedFields ?? []).filter((path) => compatible.has(path)),
    resetFields: [...new Set(resetFields)],
  };
}

const ANSWERABLE_FIELDS = new Set([
  ...TEXT_FIELDS,
  "brand.productFidelity",
  "brand.logo",
  "brand.ctaMode",
  "brand.ctaText",
  "brand.contactValue",
  "brand.offerText",
  "audio.voiceover",
  "audio.sfx",
  "audio.music",
  "audio.voiceoverCopy",
  "audio.musicMood",
  "audio.sfxNotes",
  "production.durationSeconds",
  "production.aspectRatio",
  "production.resolution",
  "production.quality",
  "production.referenceIntent",
  "production.scriptType",
  "production.elementType",
]);

export function applyQuestionAnswer(args: {
  payload: AssistedBriefPayload;
  questionId: string;
  value?: string;
  values?: string[];
  leaveOut?: boolean;
  /** The actual offered question; enables validated field-based routing. */
  question?: GuidedQuestion;
}): {
  payload: AssistedBriefPayload;
  lockedFields: string[];
  skippedOptionalIds: string[];
  offeredOptionalIds: string[];
  accepted: boolean;
} {
  const lockedFields: string[] = [];
  const skippedOptionalIds: string[] = [];
  const offeredOptionalIds: string[] = [];
  const payload = {
    ...args.payload,
    brand: { ...args.payload.brand },
    audio: { ...args.payload.audio },
    production: { ...args.payload.production },
  };

  const leaveOut = Boolean(args.leaveOut) || args.value === "omit";
  const id = args.questionId;
  const question = args.question?.id === id ? args.question : undefined;
  const field = question?.field;
  const values = question?.kind === "multi"
    ? [...new Set((args.values ?? (args.value ? [args.value] : [])).map((value) => value.trim()).filter(Boolean))]
    : args.value?.trim()
      ? [args.value.trim()]
      : [];
  let accepted = false;

  if (question && field && ANSWERABLE_FIELDS.has(field)) {
    const allowed = new Set(question.options?.map((option) => option.value) ?? []);
    const optionsValid = allowed.size === 0 || values.every((value) => allowed.has(value));
    const value = values.join(", ");
    const optionalId =
      field === "brand.logo"
        ? "logo"
        : field === "brand.ctaMode"
          ? "cta"
          : field === "brand.offerText" || field === "offer"
            ? "offer"
            : undefined;
    if (optionalId) offeredOptionalIds.push(optionalId);

    if (leaveOut && question.allowLeaveOut) {
      if (field === "brand.logo") {
        payload.brand.logo = "omit";
        lockedFields.push(field);
      } else if (field === "brand.ctaMode") {
        payload.brand.ctaMode = "omit";
        lockedFields.push(field);
      }
      if (optionalId) skippedOptionalIds.push(optionalId);
      accepted = true;
    } else if (optionsValid && value) {
      if (field === "brand.productFidelity" && (value === "exact" || value === "conceptual")) {
        payload.brand.productFidelity = value;
        accepted = true;
      } else if (field === "brand.logo" && (value === "include" || value === "omit")) {
        payload.brand.logo = value;
        accepted = true;
      } else if (
        field === "brand.ctaMode" &&
        (value === "custom" || value === "contact" || value === "omit")
      ) {
        payload.brand.ctaMode = value;
        accepted = true;
      } else if (
        (field === "audio.voiceover" || field === "audio.sfx" || field === "audio.music") &&
        (value === "include" || value === "none")
      ) {
        payload.audio[field.split(".")[1] as "voiceover" | "sfx" | "music"] = value;
        accepted = true;
      } else if (field === "production.durationSeconds") {
        const duration = Number(value);
        if (Number.isFinite(duration) && duration > 0 && duration <= 300) {
          payload.production.durationSeconds = duration;
          accepted = true;
        }
      } else if (field.startsWith("brand.")) {
        const key = field.slice(6) as "ctaText" | "contactValue" | "offerText";
        if (key === "ctaText" || key === "contactValue" || key === "offerText") {
          payload.brand[key] = value;
          accepted = true;
        }
      } else if (field.startsWith("audio.")) {
        const key = field.slice(6) as "voiceoverCopy" | "musicMood" | "sfxNotes";
        if (key === "voiceoverCopy" || key === "musicMood" || key === "sfxNotes") {
          payload.audio[key] = value;
          accepted = true;
        }
      } else if (field.startsWith("production.")) {
        const key = field.slice(11) as keyof typeof payload.production;
        (payload.production as Record<string, unknown>)[key] = value;
        accepted = true;
      } else if ((TEXT_FIELDS as readonly string[]).includes(field)) {
        (payload as unknown as Record<string, unknown>)[field] = value;
        accepted = true;
      }
      if (accepted) {
        lockedFields.push(field);
        if (value === "omit" && optionalId) skippedOptionalIds.push(optionalId);
      }
    }
  }

  // Backward compatibility for persisted questions created before fields were required.
  if (!question && (id === "logo" || id === "logo_upload_required")) {
    offeredOptionalIds.push("logo");
    if (leaveOut) {
      payload.brand.logo = "omit";
      skippedOptionalIds.push("logo");
      lockedFields.push("brand.logo");
    } else {
      payload.brand.logo = "include";
      lockedFields.push("brand.logo");
    }
    accepted = true;
  } else if (!question && id === "cta") {
    offeredOptionalIds.push("cta");
    if (leaveOut || args.value === "omit") {
      payload.brand.ctaMode = "omit";
      skippedOptionalIds.push("cta");
      lockedFields.push("brand.ctaMode");
    } else if (args.value === "custom" || args.value === "contact") {
      payload.brand.ctaMode = args.value;
      lockedFields.push("brand.ctaMode");
    }
    accepted = true;
  } else if (!question && id === "cta_text" && args.value) {
    payload.brand.ctaText = args.value.trim();
    lockedFields.push("brand.ctaText");
    accepted = true;
  } else if (!question && id === "cta_contact" && args.value) {
    payload.brand.contactValue = formatNanpContactNumbers(args.value.trim());
    lockedFields.push("brand.contactValue");
    accepted = true;
  } else if (!question && id === "offer") {
    offeredOptionalIds.push("offer");
    if (leaveOut || !args.value?.trim()) {
      skippedOptionalIds.push("offer");
    } else {
      payload.brand.offerText = args.value.trim();
      lockedFields.push("brand.offerText");
    }
    accepted = true;
  } else if (!question && id === "product_fidelity" && (args.value === "exact" || args.value === "conceptual")) {
    payload.brand.productFidelity = args.value;
    lockedFields.push("brand.productFidelity");
    accepted = true;
  } else if (
    !question &&
    (id === "hypermotion_subject" ||
      id === "video_subject" ||
      id === "subject_or_ref" ||
      id === "element_name") &&
    args.value
  ) {
    payload.subject = args.value.trim();
    lockedFields.push("subject");
    accepted = true;
  } else if (!question && (id === "hypermotion_objective" || id === "script_brief") && args.value) {
    payload.objective = args.value.trim();
    lockedFields.push("objective");
    accepted = true;
  }

  return { payload, lockedFields, skippedOptionalIds, offeredOptionalIds, accepted };
}

export function attachmentPresenceFromRoles(
  roles: AttachmentRole[],
): AttachmentPresence {
  return {
    roles,
    hasProduct: roles.includes("product"),
    hasLogo: roles.includes("logo"),
    hasStyle: roles.includes("style"),
    hasAnyMedia: roles.length > 0,
  };
}

export function listVideoTypesForUi(): Array<{
  slug: VideoType;
  label: string;
  description: string;
}> {
  return [
    {
      slug: "hypermotion_ad",
      label: "Hypermotion ad",
      description: "Rapid-cut product ad with macro texture and timed beats",
    },
    {
      slug: "standard",
      label: "Standard video",
      description: "General guided video clip",
    },
  ];
}
