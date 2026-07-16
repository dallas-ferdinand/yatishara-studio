/**
 * Shared types + Convex validators for Studio Assistance.
 *
 * Assistance is mode-agnostic (image | video | script | element).
 * Video types (e.g. hypermotion_ad) inject specialized requirements
 * into the same brief / question / review pipeline.
 */
import { v } from "convex/values";

export const ASSISTED_MODES = ["image", "video", "script", "element"] as const;
export type AssistedMode = (typeof ASSISTED_MODES)[number];

export const VIDEO_TYPES = ["standard", "hypermotion_ad"] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];

export const BRIEF_STATUSES = [
  "collecting",
  "awaiting_input",
  "review_ready",
  "approved",
  "generating",
  "done",
  "failed",
  "abandoned",
] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const AUDIO_CHOICES = ["include", "none"] as const;
export type AudioChoice = (typeof AUDIO_CHOICES)[number];

export const PRODUCT_FIDELITY = ["exact", "conceptual"] as const;
export type ProductFidelity = (typeof PRODUCT_FIDELITY)[number];

export const LOGO_CHOICES = ["include", "omit", "undecided"] as const;
export type LogoChoice = (typeof LOGO_CHOICES)[number];

export const CTA_MODES = ["custom", "contact", "omit", "undecided"] as const;
export type CtaMode = (typeof CTA_MODES)[number];

export const ATTACHMENT_ROLES = [
  "product",
  "logo",
  "style",
  "motion",
  "audio",
  "start_frame",
  "supporting",
  "reference",
] as const;
export type AttachmentRole = (typeof ATTACHMENT_ROLES)[number];

export const QUESTION_KINDS = [
  "choice",
  "text",
  "upload",
  "multi",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const ASSISTANT_DECISIONS = ["ask", "review_ready"] as const;
export type AssistantDecision = (typeof ASSISTANT_DECISIONS)[number];

export const INTENT_CONFIDENCES = ["low", "medium", "high"] as const;
export type IntentConfidence = (typeof INTENT_CONFIDENCES)[number];

export const PROPOSAL_DECISIONS = ["keep", "change", "ask"] as const;
export type ProposalDecision = (typeof PROPOSAL_DECISIONS)[number];

export const STYLE_CONFLICTS = [
  "none",
  "photoreal_requested_with_illustrated_context",
  "illustrated_requested_with_photoreal_context",
] as const;
export type StyleConflict = (typeof STYLE_CONFLICTS)[number];

export const COMPILER_KINDS = [
  "generic_image",
  "generic_video",
  "generic_script",
  "generic_element",
  "hypermotion_ad",
] as const;
export type CompilerKind = (typeof COMPILER_KINDS)[number];

export type IntentClassification = {
  mode: AssistedMode;
  videoType?: VideoType;
  confidence: IntentConfidence;
  reason?: string;
};

export type ProposedModeDecision = {
  decision: ProposalDecision;
  mode?: AssistedMode;
  videoType?: VideoType;
  reason?: string;
};

export type ProposedTextDecision = {
  decision: ProposalDecision;
  value?: string;
  reason?: string;
};

export type ProposedStyleDecision = ProposedTextDecision & {
  conflict: StyleConflict;
};

export type TimedBeat = {
  startSec: number;
  endSec: number;
  action: string;
  camera?: string;
};

export type AudioPlan = {
  voiceover: AudioChoice;
  sfx: AudioChoice;
  music: AudioChoice;
  voiceoverCopy?: string;
  musicMood?: string;
  sfxNotes?: string;
};

export type BrandDecisions = {
  productFidelity?: ProductFidelity;
  logo: LogoChoice;
  ctaMode: CtaMode;
  ctaText?: string;
  contactValue?: string;
  offerText?: string;
};

export type ProductionSettings = {
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  styleSheetElementId?: string;
  referenceIntent?: string;
  scriptType?: string;
  elementType?: string;
  skipPromptEnhancement?: boolean;
};

export type AssistedBriefPayload = {
  subject?: string;
  objective?: string;
  audience?: string;
  keyMessage?: string;
  offer?: string;
  platform?: string;
  hook?: string;
  setting?: string;
  visualDirection?: string;
  timedBeats?: TimedBeat[];
  brand: BrandDecisions;
  audio: AudioPlan;
  production: ProductionSettings;
  /** Free-form notes the assistant or user adds. */
  notes?: string;
};

export type AssistedBriefPatch = Partial<
  Omit<AssistedBriefPayload, "brand" | "audio" | "production">
> & {
  brand?: Partial<BrandDecisions>;
  audio?: Partial<AudioPlan>;
  production?: Partial<ProductionSettings>;
};

export type QuestionOption = {
  value: string;
  label: string;
  /** When true, choosing this skips further prompts for this topic. */
  leaveOut?: boolean;
};

export type GuidedQuestion = {
  id: string;
  kind: QuestionKind;
  /** User-facing advisory copy — e.g. "Upload your logo (or leave it out)". */
  prompt: string;
  field?: string;
  options?: QuestionOption[];
  /** For upload questions: suggested role of the uploaded asset. */
  uploadRole?: AttachmentRole;
  required?: boolean;
  allowLeaveOut?: boolean;
};

export type GuidedQuestionAnswer = {
  questionId: string;
  /** Single answers use `value`; multi questions may use `values`. */
  value?: string;
  values?: string[];
  leaveOut?: boolean;
};

export type GuidedAttachmentRef = {
  assetId?: string;
  documentId?: string;
  elementId?: string;
  role: AttachmentRole;
  label?: string;
  sortOrder: number;
};

export const AGENT_TURN_STRATEGIES = [
  "clarify",
  "deepen",
  "confirm",
  "review",
] as const;
export type AgentTurnStrategy = (typeof AGENT_TURN_STRATEGIES)[number];

/**
 * Sanitized durable Assistance agent state.
 * Never stores private chain-of-thought / thinking text.
 */
export type AssistanceAgentState = {
  goal: string;
  knownFacts: string[];
  missingCritical: string[];
  missingOptional: string[];
  nextFocus: string;
  unresolvedDecisions: string[];
  readinessRationale: string;
  readyForReview: boolean;
  turnStrategy: AgentTurnStrategy;
};

/** @deprecated Use AssistanceAgentState. */
export type AssistanceAgentPlan = AssistanceAgentState & {
  thinking?: string;
};

export type AssistantAnalysis = {
  decision: AssistantDecision;
  message: string;
  agentState?: AssistanceAgentState;
  /** @deprecated Use agentState. */
  agentPlan?: AssistanceAgentState;
  intent?: IntentClassification;
  proposedMode?: ProposedModeDecision;
  proposedSetting?: ProposedTextDecision;
  proposedStyle?: ProposedStyleDecision;
  briefPatch?: AssistedBriefPatch;
  /** Internal structured hints for the server/model — never rendered as forms. */
  questions?: GuidedQuestion[];
  assumptions?: string[];
  warnings?: string[];
  inferredFields?: string[];
  attachmentRoleHints?: Array<{ index: number; role: AttachmentRole }>;
};

export function emptyAgentState(
  overrides?: Partial<AssistanceAgentState>,
): AssistanceAgentState {
  return {
    goal: overrides?.goal?.trim() || "Understand what to create",
    knownFacts: overrides?.knownFacts ?? [],
    missingCritical: overrides?.missingCritical ?? [
      "What exactly should be created",
      "Hero content / offer",
      "Visual direction",
    ],
    missingOptional: overrides?.missingOptional ?? [],
    nextFocus: overrides?.nextFocus?.trim() || "Clarify the request",
    unresolvedDecisions: overrides?.unresolvedDecisions ?? [],
    readinessRationale: overrides?.readinessRationale?.trim() || "",
    readyForReview: Boolean(overrides?.readyForReview),
    turnStrategy: overrides?.turnStrategy ?? "clarify",
  };
}

/** @deprecated Use emptyAgentState. */
export function emptyAgentPlan(
  overrides?: Partial<AssistanceAgentPlan>,
): AssistanceAgentState {
  return emptyAgentState(overrides);
}

export function parseAgentState(raw: unknown): AssistanceAgentState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const strategy = AGENT_TURN_STRATEGIES.includes(
    value.turnStrategy as AgentTurnStrategy,
  )
    ? (value.turnStrategy as AgentTurnStrategy)
    : "clarify";
  const asLines = (item: unknown) =>
    Array.isArray(item)
      ? item
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
          .slice(0, 12)
      : [];
  return emptyAgentState({
    goal: typeof value.goal === "string" ? value.goal : undefined,
    knownFacts: asLines(value.knownFacts),
    missingCritical: asLines(value.missingCritical),
    missingOptional: asLines(value.missingOptional),
    nextFocus: typeof value.nextFocus === "string" ? value.nextFocus : undefined,
    unresolvedDecisions: asLines(value.unresolvedDecisions),
    readinessRationale:
      typeof value.readinessRationale === "string"
        ? value.readinessRationale
        : undefined,
    readyForReview: Boolean(value.readyForReview),
    turnStrategy: strategy,
  });
}

/** @deprecated Use parseAgentState. */
export function parseAgentPlan(raw: unknown): AssistanceAgentState | undefined {
  return parseAgentState(raw);
}

export const timedBeatValidator = v.object({
  startSec: v.number(),
  endSec: v.number(),
  action: v.string(),
  camera: v.optional(v.string()),
});

export const audioPlanValidator = v.object({
  voiceover: v.union(v.literal("include"), v.literal("none")),
  sfx: v.union(v.literal("include"), v.literal("none")),
  music: v.union(v.literal("include"), v.literal("none")),
  voiceoverCopy: v.optional(v.string()),
  musicMood: v.optional(v.string()),
  sfxNotes: v.optional(v.string()),
});

export const brandDecisionsValidator = v.object({
  productFidelity: v.optional(
    v.union(v.literal("exact"), v.literal("conceptual")),
  ),
  logo: v.union(
    v.literal("include"),
    v.literal("omit"),
    v.literal("undecided"),
  ),
  ctaMode: v.union(
    v.literal("custom"),
    v.literal("contact"),
    v.literal("omit"),
    v.literal("undecided"),
  ),
  ctaText: v.optional(v.string()),
  contactValue: v.optional(v.string()),
  offerText: v.optional(v.string()),
});

export const productionSettingsValidator = v.object({
  durationSeconds: v.optional(v.number()),
  aspectRatio: v.optional(v.string()),
  resolution: v.optional(v.string()),
  quality: v.optional(v.string()),
  styleSheetElementId: v.optional(v.string()),
  referenceIntent: v.optional(v.string()),
  scriptType: v.optional(v.string()),
  elementType: v.optional(v.string()),
  skipPromptEnhancement: v.optional(v.boolean()),
});

export const assistedBriefPayloadValidator = v.object({
  subject: v.optional(v.string()),
  objective: v.optional(v.string()),
  audience: v.optional(v.string()),
  keyMessage: v.optional(v.string()),
  offer: v.optional(v.string()),
  platform: v.optional(v.string()),
  hook: v.optional(v.string()),
  setting: v.optional(v.string()),
  visualDirection: v.optional(v.string()),
  timedBeats: v.optional(v.array(timedBeatValidator)),
  brand: brandDecisionsValidator,
  audio: audioPlanValidator,
  production: productionSettingsValidator,
  notes: v.optional(v.string()),
});

export const questionOptionValidator = v.object({
  value: v.string(),
  label: v.string(),
  leaveOut: v.optional(v.boolean()),
});

export const guidedQuestionValidator = v.object({
  id: v.string(),
  kind: v.union(
    v.literal("choice"),
    v.literal("text"),
    v.literal("upload"),
    v.literal("multi"),
  ),
  prompt: v.string(),
  field: v.optional(v.string()),
  options: v.optional(v.array(questionOptionValidator)),
  uploadRole: v.optional(
    v.union(
      v.literal("product"),
      v.literal("logo"),
      v.literal("style"),
      v.literal("motion"),
      v.literal("audio"),
      v.literal("start_frame"),
      v.literal("supporting"),
      v.literal("reference"),
    ),
  ),
  required: v.optional(v.boolean()),
  allowLeaveOut: v.optional(v.boolean()),
});

export const guidedQuestionAnswerValidator = v.object({
  questionId: v.string(),
  value: v.optional(v.string()),
  values: v.optional(v.array(v.string())),
  leaveOut: v.optional(v.boolean()),
});

export const assistedModeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("script"),
  v.literal("element"),
);

export const videoTypeValidator = v.union(
  v.literal("standard"),
  v.literal("hypermotion_ad"),
);

export const briefStatusValidator = v.union(
  v.literal("collecting"),
  v.literal("awaiting_input"),
  v.literal("review_ready"),
  v.literal("approved"),
  v.literal("generating"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("abandoned"),
);

export const attachmentRoleValidator = v.union(
  v.literal("product"),
  v.literal("logo"),
  v.literal("style"),
  v.literal("motion"),
  v.literal("audio"),
  v.literal("start_frame"),
  v.literal("supporting"),
  v.literal("reference"),
);

export function emptyBrandDecisions(): BrandDecisions {
  return {
    logo: "undecided",
    ctaMode: "undecided",
  };
}

export function emptyAudioPlan(): AudioPlan {
  return {
    voiceover: "none",
    sfx: "none",
    music: "none",
  };
}

export function emptyBriefPayload(
  production?: Partial<ProductionSettings>,
): AssistedBriefPayload {
  return {
    brand: emptyBrandDecisions(),
    audio: emptyAudioPlan(),
    production: {
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1280x720",
      ...production,
    },
  };
}

export function normalizeVideoType(value?: string | null): VideoType {
  const slug = String(value ?? "standard").trim().toLowerCase();
  if ((VIDEO_TYPES as readonly string[]).includes(slug)) {
    return slug as VideoType;
  }
  return "standard";
}

export function normalizeAssistedMode(value?: string | null): AssistedMode {
  const slug = String(value ?? "video").trim().toLowerCase();
  if ((ASSISTED_MODES as readonly string[]).includes(slug)) {
    return slug as AssistedMode;
  }
  return "video";
}

export function isGuidedVideoAssistanceEnabled(): boolean {
  const raw = process.env.GUIDED_VIDEO_ASSISTANCE_ENABLED;
  if (raw === undefined || raw === "") return true;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}
