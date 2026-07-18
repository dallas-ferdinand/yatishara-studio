/**
 * Assistance agent tool catalog + working-draft session.
 * Tools mutate a turn-local draft; durable commit happens after the loop.
 */
import { jsonSchema, tool } from "ai";
import type { Id } from "../_generated/dataModel";
import type {
  AssistanceAgentState,
  AssistedBriefPayload,
  AssistedMode,
  AttachmentRole,
  GuidedQuestion,
  VideoType,
} from "./guidedVideoTypes";
import { emptyAgentState, normalizeVideoType } from "./guidedVideoTypes";
import {
  attachmentPresenceFromRoles,
  evaluateBrief,
  formatNanpContactNumbers,
  mergeBriefPayload,
  normalizeAssistanceAspectRatio,
  normalizeBriefPatch,
  transitionAssistedMode,
} from "./hypermotionWorkflow";
import { MAX_GENERATION_REFERENCE_ASSETS } from "./elementAssetModel";
import { resolveVideoModel } from "./videoModels";
import { creditCostForGeneration, type MeasuredTextUsage } from "./generationPricing";
import type { ReferenceInput } from "./referenceInput";
import { planVideoDuration } from "./videoDurationPlan";
import { assessFinalPromptForReview } from "./seedancePromptCraft";

export type AssistanceWorkingReference = {
  assetId?: Id<"assets">;
  documentId?: Id<"documents">;
  elementId?: Id<"elements">;
  role: AttachmentRole;
  mediaKind?: "image" | "video" | "audio" | "document";
  label?: string;
  sortOrder: number;
};

export type AssistanceToolTraceEntry = {
  name: string;
  input: unknown;
  output: unknown;
};

export type AssistanceTerminalAsk = {
  kind: "ask";
  message: string;
  questions: GuidedQuestion[];
};

export type AssistanceTerminalReview = {
  kind: "review";
  message: string;
  finalPrompt: string;
  negativePrompt?: string;
  rationale?: string;
};

export type AssistancePendingApproval = {
  toolCallId: string;
  action: "trash" | "move" | "generation" | "element_build";
  title: string;
  summary: string;
  argumentsJson: string;
  estimatedCredits?: number;
};

export type AssistanceTerminalApproval = {
  kind: "approval";
  message: string;
};

export type AssistanceAgentSession = {
  ownerId: Id<"users">;
  turnId: Id<"assistanceTurns">;
  briefId: Id<"guidedBriefs">;
  threadId: Id<"generationThreads">;
  folderId: Id<"folders">;
  mode: AssistedMode;
  videoType?: VideoType;
  entryPoint?: "image_to_video";
  draft: AssistedBriefPayload;
  lockedFields: string[];
  inferredFields: string[];
  agentState: AssistanceAgentState;
  assumptions: string[];
  warnings: string[];
  attachmentSummaries: string[];
  /** Descriptions from inspect_media this turn — critic ground truth for on-image copy. */
  mediaInspectionNotes: Array<{
    assetId?: Id<"assets">;
    name?: string;
    kind?: string;
    description: string;
  }>;
  offeredOptionalIds: string[];
  skippedOptionalIds: string[];
  /** True after any failed prepare_review this turn — unlocks recovery steps. */
  prepareReviewFailedThisTurn: boolean;
  /** Restrict tools to terminal/fixers after the free step budget. */
  recoveryMode: boolean;
  criticCallsThisTurn: number;
  lastCriticInputHash?: string;
  references: AssistanceWorkingReference[];
  conversationContext: string[];
  toolTrace: AssistanceToolTraceEntry[];
  pendingApprovals: AssistancePendingApproval[];
  terminal?:
    | AssistanceTerminalAsk
    | AssistanceTerminalReview
    | AssistanceTerminalApproval;
  expiresUnix: number;
  mutationQueue?: Promise<void>;
  runQuery: <Args extends Record<string, unknown>, Result>(
    name: string,
    args: Args,
  ) => Promise<Result>;
  runMutation: <Args extends Record<string, unknown>, Result>(
    name: string,
    args: Args,
  ) => Promise<Result>;
  inspectMedia: (
    reference: ReferenceInput,
  ) => Promise<{ description: string; usage: MeasuredTextUsage }>;
  /**
   * Independent creative-director critic. Must not be the same tool-loop
   * decision that proposed review; used inside prepare_review as a gate.
   */
  critiqueCreativeReadiness: (input: {
    finalPrompt: string;
    claimedReadiness: CreativeReadinessAssessment;
  }) => Promise<CreativeReadinessCritique>;
  lastReadinessCritique?: CreativeReadinessCritique;
};

export const ASSISTANCE_RECOVERY_TOOLS = new Set([
  "prepare_review",
  "ask_user",
  "set_audio_plan",
  "set_brand_requirements",
  "update_brief",
  "set_video_type",
  "evaluate_brief",
  "get_brief",
]);

type CreativeReadinessInput = {
  intendedOutcome?: string;
  successCriteria?: string[];
  criticalUnknowns?: string[];
  safeAssumptions?: string[];
  rationale?: string;
};

export type CreativeReadinessAssessment = {
  ok: boolean;
  error?: "readiness_assessment_incomplete" | "outcome_not_ready";
  hint?: string;
  blockers: string[];
  intendedOutcome: string;
  successCriteria: string[];
  safeAssumptions: string[];
  rationale: string;
};

export type CreativeReadinessCritique = {
  decision: "ready" | "revise" | "ask";
  rationale: string;
  criticalGaps: string[];
  revisionInstructions: string[];
  suggestedQuestion?: string;
  assumptions: string[];
  usage?: MeasuredTextUsage;
};

function readinessLines(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

/**
 * Generic semantic readiness contract supplied by the agent for the current
 * job. The criteria are intentionally outcome-derived rather than mode- or
 * deliverable-specific.
 */
export function assessCreativeReadiness(
  input: CreativeReadinessInput | undefined,
): CreativeReadinessAssessment {
  const intendedOutcome = String(input?.intendedOutcome ?? "").trim().slice(0, 500);
  const successCriteria = readinessLines(input?.successCriteria, 8);
  const blockers = readinessLines(input?.criticalUnknowns, 8);
  const safeAssumptions = readinessLines(input?.safeAssumptions, 8);
  const rationale = String(input?.rationale ?? "").trim().slice(0, 1_000);

  if (
    intendedOutcome.length < 12 ||
    successCriteria.length < 2 ||
    rationale.length < 20
  ) {
    return {
      ok: false,
      error: "readiness_assessment_incomplete",
      hint:
        "Reassess this specific outcome: state what success means, give at least two job-derived success criteria, separate critical unknowns from safe creative assumptions, and explain why generation is or is not ready.",
      blockers,
      intendedOutcome,
      successCriteria,
      safeAssumptions,
      rationale,
    };
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      error: "outcome_not_ready",
      hint:
        "Do not prepare review yet. Ask the single highest-leverage question needed to resolve these material unknowns; make noncritical creative choices yourself.",
      blockers,
      intendedOutcome,
      successCriteria,
      safeAssumptions,
      rationale,
    };
  }

  return {
    ok: true,
    blockers,
    intendedOutcome,
    successCriteria,
    safeAssumptions,
    rationale,
  };
}

async function mutateSession<T>(
  session: AssistanceAgentSession,
  operation: () => Promise<T> | T,
): Promise<T> {
  const previous = session.mutationQueue ?? Promise.resolve();
  let release!: () => void;
  session.mutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function referenceKey(reference: AssistanceWorkingReference): string {
  if (reference.assetId) return `asset:${reference.assetId}`;
  if (reference.documentId) return `document:${reference.documentId}`;
  if (reference.elementId) return `element:${reference.elementId}`;
  return `unknown:${reference.sortOrder}`;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

export function policyForSession(session: AssistanceAgentSession) {
  return evaluateBrief({
    mode: session.mode,
    videoType: session.videoType,
    payload: session.draft,
    attachments: attachmentPresenceFromRoles(
      session.references.map((reference) => reference.role),
    ),
    offeredOptionalIds: session.offeredOptionalIds,
    skippedOptionalIds: session.skippedOptionalIds,
    lockedFields: session.lockedFields,
  });
}

function markOptionalOffered(session: AssistanceAgentSession, optionalId: string) {
  if (!session.offeredOptionalIds.includes(optionalId)) {
    session.offeredOptionalIds = [...session.offeredOptionalIds, optionalId];
  }
}

function markOptionalSkipped(session: AssistanceAgentSession, optionalId: string) {
  markOptionalOffered(session, optionalId);
  if (!session.skippedOptionalIds.includes(optionalId)) {
    session.skippedOptionalIds = [...session.skippedOptionalIds, optionalId];
  }
}

function syncBrandOptionalMemory(session: AssistanceAgentSession) {
  const brand = session.draft.brand;
  if (brand.logo !== "undecided") {
    if (brand.logo === "omit") markOptionalSkipped(session, "logo");
    else markOptionalOffered(session, "logo");
  }
  if (brand.ctaMode !== "undecided") {
    if (brand.ctaMode === "omit") markOptionalSkipped(session, "cta");
    else markOptionalOffered(session, "cta");
  }
  if (brand.offerText?.trim()) {
    markOptionalOffered(session, "offer");
  }
}

/** True when ask_user should not re-ask for this brief field. */
export function isAssistanceFieldAlreadyAnswered(
  session: Pick<
    AssistanceAgentSession,
    "draft" | "lockedFields" | "inferredFields"
  >,
  field: string,
): boolean {
  if (session.lockedFields.includes(field)) return true;
  if (session.inferredFields.includes(field)) return true;
  const value = valueAtPath(session.draft, field);
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (field.startsWith("audio.") && trimmed === "none") return false;
    if (field.startsWith("brand.") && trimmed === "undecided") return false;
    return true;
  }
  return true;
}

function referenceCapabilityError(session: AssistanceAgentSession): string | undefined {
  const mediaReferences = session.references.filter((reference) => reference.mediaKind);
  if (
    session.mode === "image" &&
    mediaReferences.some((reference) => reference.mediaKind !== "image")
  ) {
    return "Image jobs accept image references only. Remove video/audio references before review.";
  }
  if (
    session.mode === "video" &&
    !resolveVideoModel().supportsMultimodalRefs &&
    mediaReferences.length > 0
  ) {
    return "The selected video model does not support multimodal references.";
  }
  return undefined;
}

const ARTWORK_REFERENCE_HINT =
  /\b(?:flyer|poster|end[\s-]?card|artwork|graphic|layout|design|promo(?:tional)?)\b/i;

export function hasUploadedArtworkReference(
  session: AssistanceAgentSession,
): boolean {
  const conversationBlob = [
    session.draft.subject,
    session.draft.objective,
    ...session.conversationContext,
    ...session.mediaInspectionNotes.map((note) => note.description),
  ]
    .filter(Boolean)
    .join("\n");
  const blobLooksLikeArtwork = ARTWORK_REFERENCE_HINT.test(conversationBlob);
  return session.references.some((reference) => {
    if (reference.mediaKind !== "image") return false;
    if (ARTWORK_REFERENCE_HINT.test(reference.label ?? "")) return true;
    if (
      blobLooksLikeArtwork &&
      (reference.role === "reference" ||
        reference.role === "product" ||
        reference.role === "supporting")
    ) {
      return true;
    }
    return false;
  });
}

function authoritativePromptLayer(session: AssistanceAgentSession): string {
  const payload = session.draft;
  const artworkReference = hasUploadedArtworkReference(session);
  const durationPlan =
    session.mode === "video"
      ? planVideoDuration(payload.production.durationSeconds, session.videoType)
      : null;
  const facts = [
    payload.subject ? `Subject: ${payload.subject}` : undefined,
    payload.objective ? `Objective: ${payload.objective}` : undefined,
    payload.keyMessage ? `Key message: ${payload.keyMessage}` : undefined,
    payload.offer ? `Offer/copy: ${payload.offer}` : undefined,
    payload.brand.offerText
      ? artworkReference
        ? `Offer intent: ${payload.brand.offerText}; preserve the existing flyer wording and typography from the uploaded artwork reference`
        : `Exact offer text: ${payload.brand.offerText}`
      : undefined,
    payload.brand.ctaText
      ? artworkReference
        ? `CTA intent: ${payload.brand.ctaText}; do not re-typeset it over the uploaded flyer`
        : `Exact CTA text: ${payload.brand.ctaText}`
      : undefined,
    payload.brand.contactValue
      ? artworkReference
        ? `Contact value for voiceover/CTA intent: ${payload.brand.contactValue}; preserve the contact text already baked into the uploaded flyer and do not redraw it`
        : `Exact on-screen contact copy (render verbatim, including +, spaces, parentheses, and hyphen): ${payload.brand.contactValue}`
      : undefined,
    payload.production.aspectRatio
      ? `Output aspect ratio: ${payload.production.aspectRatio}`
      : undefined,
    payload.production.resolution
      ? `Output resolution: ${
          session.mode === "video"
            ? String(payload.production.resolution).includes("1920")
              ? "1080p"
              : "720p"
            : payload.production.resolution
        }${session.mode === "video" ? " quality; aspect ratio controls orientation" : ""}`
      : undefined,
    durationPlan
      ? `Output duration: ${durationPlan.durationSeconds}s (${durationPlan.pacing}; target ${durationPlan.beatCount} beats)`
      : undefined,
  ].filter((fact): fact is string => Boolean(fact));
  const audioFacts: string[] = [];
  if (session.mode === "video") {
    const rawVoiceover = payload.audio.voiceoverCopy?.trim() ?? "";
    const directionMatch = rawVoiceover.match(/^\[([^\]]+)\]\s*/);
    const voiceoverDirection = directionMatch?.[1]?.trim();
    const spokenVoiceover = directionMatch
      ? rawVoiceover.slice(directionMatch[0].length).trim()
      : rawVoiceover;
    if (payload.audio.voiceover === "include") {
      if (voiceoverDirection) {
        audioFacts.push(`Voiceover performance: ${voiceoverDirection}.`);
      }
      if (spokenVoiceover) {
        const wordCount = spokenVoiceover.split(/\s+/).filter(Boolean).length;
        audioFacts.push(
          `Exact spoken voiceover script (${wordCount} words; speak verbatim): “${spokenVoiceover}”`,
        );
        if (durationPlan) {
          audioFacts.push(
            `Voiceover timing: deliver naturally within ${durationPlan.durationSeconds}s, synchronized to the visual beats, with enough breathing room for intelligibility.`,
          );
        }
      }
    } else {
      audioFacts.push("Voiceover: none.");
    }
    audioFacts.push(
      payload.audio.music === "include"
        ? `Music: include${payload.audio.musicMood?.trim() ? ` — ${payload.audio.musicMood.trim()}` : ""}.`
        : "Music: none.",
    );
    audioFacts.push(
      payload.audio.sfx === "include"
        ? `Sound effects: include${payload.audio.sfxNotes?.trim() ? ` — ${payload.audio.sfxNotes.trim()}` : ""}.`
        : "Sound effects: none.",
    );
  }
  const references = [...session.references]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (reference, index) =>
        `- Reference ${index + 1}: “${reference.label ?? "Untitled"}” — role=${reference.role}`,
    );
  return [
    "AUTHORITATIVE REVIEWED REQUIREMENTS — do not contradict, omit, or rewrite exact copy:",
    ...facts.map((fact) => `- ${fact}`),
    ...(durationPlan
      ? [
          "DURATION STRUCTURE — fit the prompt to this length:",
          `- ${durationPlan.agentGuidance}`,
        ]
      : []),
    ...(audioFacts.length
      ? [
          "AUDIO DIRECTION — generate and synchronize this audio with the finished video:",
          ...audioFacts.map((fact) => `- ${fact}`),
        ]
      : []),
    ...(artworkReference
      ? [
          "UPLOADED ARTWORK REFERENCE FIDELITY — treat the supplied flyer/poster as finished artwork:",
          "- Preserve its existing text, prices, dates, contact details, logos, and layout when it appears in the generated video.",
          "- Use the uploaded artwork as a numbered multimodal reference; do not convert it into a start frame or unnecessarily redraw, replace, re-typeset, correct, or morph its baked-in text.",
          "- Spoken voiceover may express the CTA without reading a long phone number when that number remains visible in the flyer.",
        ]
      : []),
    ...(references.length
      ? [
          "ORDERED REFERENCE ASSIGNMENTS — use each input only for its stated role:",
          ...references,
        ]
      : []),
  ].join("\n");
}

function voiceoverReviewIssue(
  session: AssistanceAgentSession,
): { error: string; hint: string } | undefined {
  if (
    session.mode !== "video" ||
    session.draft.audio.voiceover !== "include"
  ) {
    return undefined;
  }
  const rawCopy = session.draft.audio.voiceoverCopy?.trim() ?? "";
  const spokenCopy = rawCopy.replace(/^\[[^\]]+\]\s*/, "").trim();
  if (!spokenCopy) {
    return {
      error: "voiceover_script_missing",
      hint:
        "Voiceover is enabled. Write polished exact spoken copy in set_audio_plan before review; use the known goal, offer, brand, CTA, and conversation context.",
    };
  }
  const duration = planVideoDuration(
    session.draft.production.durationSeconds,
    session.videoType,
  ).durationSeconds;
  const wordCount = spokenCopy.split(/\s+/).filter(Boolean).length;
  const maxWords = Math.max(8, Math.floor(duration * 2.5));
  if (wordCount > maxWords) {
    return {
      error: "voiceover_script_too_long",
      hint: `The ${wordCount}-word voiceover is too dense for ${duration}s. Keep it at or below ${maxWords} words (about 2–2.5 spoken words/second), preserve exact user-provided facts, and leave room for natural delivery. If the user supplied exact copy, ask whether to shorten it or increase duration.`,
    };
  }
  return undefined;
}

function videoStructureReviewIssue(
  session: AssistanceAgentSession,
  finalPrompt: string,
): {
  error: string;
  hint: string;
  durationPlan?: {
    beatCount: number;
    minBeats: number;
    maxBeats: number;
    durationSeconds: number;
  };
  timedBeatCount?: number;
} | undefined {
  if (session.mode !== "video") return undefined;
  const durationPlan = planVideoDuration(
    session.draft.production.durationSeconds,
    session.videoType,
  );
  if (durationPlan.kind !== "hypermotion_ad") return undefined;

  if (/\bsingle[\s-]+continuous(?:\s+shot|\s+take|\s+moment)?\b/i.test(finalPrompt)) {
    return {
      error: "video_structure_conflict",
      hint: `This is a Hypermotion ad, so a single continuous shot conflicts with its ${durationPlan.beatCount}-beat pacing. Keep Hypermotion and rewrite the creative prompt as ${durationPlan.beatCount} timed beats, or call set_video_type with standard before using a single continuous shot. Resolve this yourself; do not show this diagnostic to the user.`,
    };
  }

  const timedBeatCount = countTimedBeatRanges(finalPrompt);
  if (timedBeatCount < durationPlan.minBeats) {
    return {
      error: "video_timed_beats_missing",
      hint: `Hypermotion at ${durationPlan.durationSeconds}s needs ${durationPlan.beatCount} concrete timed beats (${durationPlan.minBeats}–${durationPlan.maxBeats} allowed), each with action and one camera move. The current prompt has ${timedBeatCount}. Rewrite the full creative prompt with start–end timestamps that cover the clip; do not ask the user or expose this diagnostic.`,
      durationPlan: {
        beatCount: durationPlan.beatCount,
        minBeats: durationPlan.minBeats,
        maxBeats: durationPlan.maxBeats,
        durationSeconds: durationPlan.durationSeconds,
      },
      timedBeatCount,
    };
  }
  return undefined;
}

/** Count unique timed beat ranges in a video prompt (Hypermotion structure). */
export function countTimedBeatRanges(finalPrompt: string): number {
  const patterns = [
    /\b\d+(?:\.\d+)?\s*s?\s*[–—-]\s*\d+(?:\.\d+)?\s*s\b/gi,
    /\b\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}\b/g,
    /\b(?:shot|beat)\s*\d+\s*\(\s*\d+(?:\.\d+)?\s*s?\s*[–—-]\s*\d+(?:\.\d+)?\s*s?\s*\)/gi,
    /\b\d+(?:\.\d+)?\s*(?:to|thru|through)\s*\d+(?:\.\d+)?\s*s\b/gi,
  ];
  const starts = new Set<string>();
  for (const pattern of patterns) {
    for (const match of finalPrompt.matchAll(pattern)) {
      const token = match[0].toLowerCase().replace(/\s+/g, " ").slice(0, 40);
      starts.add(token);
    }
  }
  return starts.size;
}

function recordTool(
  session: AssistanceAgentSession,
  name: string,
  input: unknown,
  output: unknown,
) {
  if (
    name === "prepare_review" &&
    output &&
    typeof output === "object" &&
    (output as { ok?: boolean }).ok === false
  ) {
    session.prepareReviewFailedThisTurn = true;
  }
  session.toolTrace.push({
    name,
    input: sanitizeTraceValue(input),
    output: sanitizeTraceValue(output),
  });
  return output;
}

async function performSafeWorkspaceWrite(
  session: AssistanceAgentSession,
  toolCallId: string,
  operation:
    | "create_folder"
    | "update_folder"
    | "create_document"
    | "update_document"
    | "create_element"
    | "update_element"
    | "update_asset"
    | "duplicate_asset",
  input: Record<string, unknown>,
) {
  const argumentsJson = JSON.stringify(input);
  const args = {
    ownerId: session.ownerId,
    threadId: session.threadId,
    turnId: session.turnId,
    toolCallId,
    operation,
    argumentsJson,
  };
  try {
    const response = await session.runMutation<
      typeof args,
      { idempotent: boolean; resultJson: string }
    >("assistanceWorkspace:performSafeWorkspaceToolCall", args);
    return JSON.parse(response.resultJson) as Record<string, unknown>;
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Workspace write failed";
    await session.runMutation(
      "assistanceWorkspace:recordFailedWorkspaceToolCall",
      { ...args, error: message },
    );
    return { ok: false, error: "workspace_write_failed" };
  }
}

function sanitizeTraceValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeTraceValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/url|contentMarkdown|signed|token|data/i.test(key)) {
      sanitized[key] = "[redacted]";
    } else {
      sanitized[key] = sanitizeTraceValue(item, depth + 1);
    }
  }
  return sanitized;
}

function lockPath(
  session: AssistanceAgentSession,
  path: string,
  inferred = true,
) {
  if (!session.lockedFields.includes(path)) {
    session.lockedFields = [...session.lockedFields, path];
  }
  if (inferred && !session.inferredFields.includes(path)) {
    session.inferredFields = [...session.inferredFields, path];
  } else if (!inferred && session.inferredFields.includes(path)) {
    session.inferredFields = session.inferredFields.filter((field) => field !== path);
  }
}

export function createAssistanceTools(session: AssistanceAgentSession) {
  const tools = {
    get_brief: tool({
      description:
        "Read the current working brief, mode, locked fields, and agent state for this job.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () =>
        recordTool(session, "get_brief", {}, {
          mode: session.mode,
          videoType: session.videoType,
          draft: session.draft,
          lockedFields: session.lockedFields,
          inferredFields: session.inferredFields,
          agentState: session.agentState,
          attachments: session.attachmentSummaries,
          references: session.references,
        }),
    }),

    get_chat_history: tool({
      description:
        "Read recent chat, generation status, review, and result events for this thread.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          limit: { type: "number" },
          beforeOrder: { type: "number" },
        },
        additionalProperties: false,
      }),
      execute: async (input) => {
        const raw = input as { limit?: number; beforeOrder?: number };
        const history = await session.runQuery(
          "assistanceWorkspace:getThreadHistoryForAgent",
          {
            ownerId: session.ownerId,
            threadId: session.threadId,
            limit: raw.limit,
            beforeOrder: raw.beforeOrder,
          },
        );
        return recordTool(session, "get_chat_history", input, history);
      },
    }),

    list_folders: tool({
      description: "List folders under a parent (omit parentId for the current save folder’s siblings root).",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          parentId: { type: "string" },
        },
        additionalProperties: false,
      }),
      execute: async (input) => {
        const parentId =
          typeof (input as { parentId?: string }).parentId === "string"
            ? ((input as { parentId: string }).parentId as Id<"folders">)
            : session.folderId;
        const folders = await session.runQuery("assistanceWorkspace:listFoldersForAgent", {
          ownerId: session.ownerId,
          parentId,
        });
        return recordTool(session, "list_folders", input, { folders });
      },
    }),

    get_folder: tool({
      description: "Read one owned folder's metadata.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          folderId: { type: "string" },
        },
        required: ["folderId"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const folder = await session.runQuery(
          "assistanceWorkspace:getFolderForAgent",
          {
            ownerId: session.ownerId,
            folderId: (input as { folderId: Id<"folders"> }).folderId,
          },
        );
        return recordTool(session, "get_folder", input, { folder });
      },
    }),

    list_folder_contents: tool({
      description:
        "List subfolders, assets, documents, and elements in a folder. Use this to gather references for the current job.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          folderId: { type: "string" },
        },
        additionalProperties: false,
      }),
      execute: async (input) => {
        const folderId =
          typeof (input as { folderId?: string }).folderId === "string"
            ? ((input as { folderId: string }).folderId as Id<"folders">)
            : session.folderId;
        const contents = await session.runQuery(
          "assistanceWorkspace:getFolderContentsForAgent",
          {
            ownerId: session.ownerId,
            folderId,
            expiresUnix: session.expiresUnix,
          },
        );
        return recordTool(session, "list_folder_contents", input, contents);
      },
    }),

    list_elements: tool({
      description:
        "List owned character, prop, location, document, and style-sheet elements.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["character", "prop", "location", "doc", "style_sheet"],
          },
          limit: { type: "number" },
        },
        additionalProperties: false,
      }),
      execute: async (input) => {
        const raw = input as { type?: string; limit?: number };
        const elements = await session.runQuery(
          "assistanceWorkspace:listElementsForAgent",
          {
            ownerId: session.ownerId,
            type: raw.type,
            limit: raw.limit,
          },
        );
        return recordTool(session, "list_elements", input, { elements });
      },
    }),

    list_style_sheets: tool({
      description: "List owned Style Sheet elements and their build status.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          limit: { type: "number" },
        },
        additionalProperties: false,
      }),
      execute: async (input) => {
        const raw = input as { limit?: number };
        const styleSheets = await session.runQuery(
          "assistanceWorkspace:listElementsForAgent",
          {
            ownerId: session.ownerId,
            type: "style_sheet",
            limit: raw.limit,
          },
        );
        return recordTool(session, "list_style_sheets", input, {
          styleSheets,
        });
      },
    }),

    get_asset: tool({
      description: "Get asset metadata and a signed URL for an image/video/audio file.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          assetId: { type: "string" },
        },
        required: ["assetId"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const assetId = String((input as { assetId: string }).assetId) as Id<"assets">;
        const asset = await session.runQuery("assistanceWorkspace:getAssetForAgent", {
          ownerId: session.ownerId,
          assetId,
          expiresUnix: session.expiresUnix,
        });
        return recordTool(session, "get_asset", input, asset ?? { error: "not_found" });
      },
    }),

    inspect_media: tool({
      description:
        "Visually or audibly inspect an owned image, video, or audio asset. The media is sent to the multimodal model; this is not URL-text inspection.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          assetId: { type: "string" },
        },
        required: ["assetId"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const assetId = String(
          (input as { assetId: string }).assetId,
        ) as Id<"assets">;
        const asset = await session.runQuery<
          { ownerId: Id<"users">; assetId: Id<"assets">; expiresUnix: number },
          {
            name: string;
            kind: string;
            mimeType: string;
            url?: string;
          } | null
        >("assistanceWorkspace:getAssetForAgent", {
          ownerId: session.ownerId,
          assetId,
          expiresUnix: session.expiresUnix,
        });
        if (
          !asset?.url ||
          (asset.kind !== "image" &&
            asset.kind !== "video" &&
            asset.kind !== "audio")
        ) {
          return recordTool(session, "inspect_media", input, {
            ok: false,
            error: "inspectable_media_not_found",
          });
        }
        const inspected = await session.inspectMedia({
          kind: asset.kind,
          url: asset.url,
          mimeType: asset.mimeType,
        });
        const description = inspected.description.trim();
        if (description) {
          session.mediaInspectionNotes = [
            ...session.mediaInspectionNotes.filter(
              (note) => note.assetId !== assetId,
            ),
            {
              assetId,
              name: asset.name,
              kind: asset.kind,
              description,
            },
          ].slice(-8);
        }
        return recordTool(session, "inspect_media", input, {
          ok: true,
          assetId,
          name: asset.name,
          kind: asset.kind,
          description,
          usage: inspected.usage,
        });
      },
    }),

    get_element: tool({
      description: "Get an element (character/prop/location/style sheet) and optional sheet URL.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          elementId: { type: "string" },
        },
        required: ["elementId"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const elementId = String(
          (input as { elementId: string }).elementId,
        ) as Id<"elements">;
        const element = await session.runQuery("assistanceWorkspace:getElementForAgent", {
          ownerId: session.ownerId,
          elementId,
          expiresUnix: session.expiresUnix,
        });
        return recordTool(session, "get_element", input, element ?? { error: "not_found" });
      },
    }),

    get_document: tool({
      description: "Read a Studio document’s markdown content.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          documentId: { type: "string" },
        },
        required: ["documentId"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const documentId = String(
          (input as { documentId: string }).documentId,
        ) as Id<"documents">;
        const document = await session.runQuery(
          "assistanceWorkspace:getDocumentForAgent",
          {
            ownerId: session.ownerId,
            documentId,
          },
        );
        return recordTool(
          session,
          "get_document",
          input,
          document ?? { error: "not_found" },
        );
      },
    }),

    create_folder: tool({
      description:
        "Create a folder immediately. This is a safe idempotent workspace write.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          name: { type: "string" },
          parentId: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const raw = input as { name: string; parentId?: string };
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "create_folder",
          {
            name: raw.name,
            parentId: raw.parentId ?? session.folderId,
          },
        );
        return recordTool(session, "create_folder", input, result);
      },
    }),

    rename_folder: tool({
      description:
        "Rename an owned folder immediately. Moving or trashing folders requires approval.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          folderId: { type: "string" },
          name: { type: "string" },
        },
        required: ["folderId", "name"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "update_folder",
          input as Record<string, unknown>,
        );
        return recordTool(session, "rename_folder", input, result);
      },
    }),

    create_document: tool({
      description:
        "Create a Studio markdown document immediately in an owned folder.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          folderId: { type: "string" },
          title: { type: "string" },
          contentMarkdown: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const raw = input as {
          folderId?: string;
          title: string;
          contentMarkdown?: string;
        };
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "create_document",
          { ...raw, folderId: raw.folderId ?? session.folderId },
        );
        return recordTool(session, "create_document", input, result);
      },
    }),

    update_document: tool({
      description:
        "Rename or update the markdown content of an owned Studio document. Moving or trashing requires approval.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          documentId: { type: "string" },
          title: { type: "string" },
          contentMarkdown: { type: "string" },
        },
        required: ["documentId"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "update_document",
          input as Record<string, unknown>,
        );
        return recordTool(session, "update_document", input, result);
      },
    }),

    create_element: tool({
      description:
        "Create an unbuilt character, prop, location, document, or style-sheet element. Building its paid visual sheet requires approval.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          folderId: { type: "string" },
          type: {
            type: "string",
            enum: ["character", "prop", "location", "doc", "style_sheet"],
          },
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["type", "name"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const raw = input as Record<string, unknown>;
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "create_element",
          { ...raw, folderId: raw.folderId ?? session.folderId },
        );
        return recordTool(session, "create_element", input, result);
      },
    }),

    update_element: tool({
      description:
        "Rename or update the description of an owned element immediately.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          elementId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["elementId"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "update_element",
          input as Record<string, unknown>,
        );
        return recordTool(session, "update_element", input, result);
      },
    }),

    rename_asset: tool({
      description:
        "Rename an owned asset immediately. Moving or trashing assets requires approval.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          assetId: { type: "string" },
          name: { type: "string" },
        },
        required: ["assetId", "name"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "update_asset",
          input as Record<string, unknown>,
        );
        return recordTool(session, "rename_asset", input, result);
      },
    }),

    duplicate_asset: tool({
      description:
        "Create an idempotent copy of an owned asset, optionally in another owned folder.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          assetId: { type: "string" },
          folderId: { type: "string" },
          name: { type: "string" },
        },
        required: ["assetId"],
        additionalProperties: false,
      }),
      execute: async (input, options) => {
        const result = await performSafeWorkspaceWrite(
          session,
          options.toolCallId,
          "duplicate_asset",
          input as Record<string, unknown>,
        );
        return recordTool(session, "duplicate_asset", input, result);
      },
    }),

    list_generations: tool({
      description:
        "List recent generation jobs in this chat thread with statuses and output asset IDs.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          limit: { type: "number" },
        },
        additionalProperties: false,
      }),
      execute: async (input) => {
        const limit =
          typeof (input as { limit?: number }).limit === "number"
            ? (input as { limit: number }).limit
            : 12;
        const jobs = await session.runQuery(
          "assistanceWorkspace:listThreadGenerationsForAgent",
          {
            ownerId: session.ownerId,
            threadId: session.threadId,
            limit,
          },
        );
        return recordTool(session, "list_generations", input, { jobs });
      },
    }),

    get_generation: tool({
      description:
        "Inspect one owned generation job, including the frozen prompt, settings, status, and output assets.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          generationJobId: { type: "string" },
        },
        required: ["generationJobId"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const generation = await session.runQuery(
          "assistanceWorkspace:getGenerationForAgent",
          {
            ownerId: session.ownerId,
            generationJobId: (
              input as { generationJobId: Id<"generationJobs"> }
            ).generationJobId,
          },
        );
        return recordTool(session, "get_generation", input, { generation });
      },
    }),

    get_generation_capabilities: tool({
      description:
        "Read the real reference and duration capabilities for this job before choosing image/video/audio references.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        const videoModel = session.mode === "video" ? resolveVideoModel() : undefined;
        return recordTool(session, "get_generation_capabilities", {}, {
          mode: session.mode,
          maxReferenceAssets: MAX_GENERATION_REFERENCE_ASSETS,
          acceptedReferenceMedia:
            session.mode === "image"
              ? ["image"]
              : session.mode === "video" && videoModel?.supportsMultimodalRefs
                ? ["image", "video", "audio"]
                : [],
          roles: {
            product: "Preserve the exact product, person, prop, or subject identity.",
            logo: "Preserve supplied brand artwork; never invent one.",
            style: "Borrow visual language, palette, typography, or layout—not subject identity.",
            motion: "Video motion, camera, pacing, or choreography reference.",
            audio: "Audio, music, ambience, or timing reference.",
            supporting: "Secondary visual context.",
            reference: "General-purpose reference when a more precise role is not known.",
          },
          videoModel: videoModel
            ? {
                slug: videoModel.slug,
                supportsMultimodalRefs: videoModel.supportsMultimodalRefs,
                requiresStartFrame: videoModel.requiresStartFrame,
                maxDurationSeconds: videoModel.maxDurationSeconds,
              }
            : undefined,
          guidance: [
            "A prior generated image is not automatically used by the next job; add it with set_references.",
            "For 'same design, replace product': mark the prior design as style and the replacement image as product.",
            "Image jobs can use multiple image references, up to the generation limit.",
            "Video references are useful only for video jobs and only on models supporting multimodal references.",
          ],
        });
      },
    }),

    get_credit_balance: tool({
      description:
        "Read the signed-in user's available and reserved Studio credit balance.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        const balance = await session.runQuery(
          "assistanceWorkspace:getCreditBalanceForAgent",
          { ownerId: session.ownerId },
        );
        return recordTool(session, "get_credit_balance", {}, balance);
      },
    }),

    estimate_generation: tool({
      description:
        "Estimate the reviewed media generation cost from the current mode, settings, references, and audio choices.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        if (session.mode !== "image" && session.mode !== "video") {
          return recordTool(session, "estimate_generation", {}, {
            ok: false,
            error: "media_estimate_not_available_for_mode",
          });
        }
        const media = session.references.filter((reference) => reference.mediaKind);
        const videoModel =
          session.mode === "video" ? resolveVideoModel().slug : undefined;
        const credits = creditCostForGeneration({
          tier: session.mode === "video" ? "pro_video" : "image",
          resolution: session.draft.production.resolution,
          quality: session.draft.production.quality,
          aspectRatio: session.draft.production.aspectRatio,
          durationSeconds: session.draft.production.durationSeconds,
          hasReferenceInput: media.length > 0,
          hasVideoReferenceInput: media.some(
            (reference) => reference.mediaKind === "video",
          ),
          hasNonVideoReferenceInput: media.some(
            (reference) =>
              reference.mediaKind === "image" || reference.mediaKind === "audio",
          ),
          audioEnabled:
            session.draft.audio.voiceover === "include" ||
            session.draft.audio.sfx === "include" ||
            session.draft.audio.music === "include",
          videoModel,
        });
        return recordTool(session, "estimate_generation", {}, {
          ok: true,
          credits,
          mode: session.mode,
          settings: session.draft.production,
        });
      },
    }),

    list_references: tool({
      description:
        "List the references currently attached to the reviewed job, including each reference's semantic role.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () =>
        recordTool(session, "list_references", {}, {
          references: session.references,
          count: session.references.length,
          maxReferenceAssets: MAX_GENERATION_REFERENCE_ASSETS,
        }),
    }),

    set_references: tool({
      description:
        "Add or reclassify one or more owned assets/elements/documents as generation references. Use asset IDs from current references, folder tools, or list_generations. Reusing a prior output requires adding its assetId here.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          references: {
            type: "array",
            minItems: 1,
            maxItems: MAX_GENERATION_REFERENCE_ASSETS,
            items: {
              type: "object",
              properties: {
                assetId: { type: "string" },
                documentId: { type: "string" },
                elementId: { type: "string" },
                role: {
                  type: "string",
                  enum: ASSISTANCE_ATTACHMENT_ROLES,
                },
                label: { type: "string" },
              },
              required: ["role"],
              additionalProperties: false,
            },
          },
        },
        required: ["references"],
        additionalProperties: false,
      }),
      execute: async (input) =>
        mutateSession(session, async () => {
          const requested = (
            input as {
              references: Array<{
                assetId?: string;
                documentId?: string;
                elementId?: string;
                role: AttachmentRole;
                label?: string;
              }>;
            }
          ).references;
          const next = [...session.references];
          for (const item of requested) {
            const role: AttachmentRole =
              item.role === "start_frame" ? "reference" : item.role;
            const ids = [item.assetId, item.documentId, item.elementId].filter(Boolean);
            if (ids.length !== 1) {
              return recordTool(session, "set_references", input, {
                ok: false,
                error: "exactly_one_reference_id_required",
              });
            }
            let reference: AssistanceWorkingReference;
            if (item.assetId) {
              const assetId = item.assetId as Id<"assets">;
              const asset = await session.runQuery<
                { ownerId: Id<"users">; assetId: Id<"assets">; expiresUnix: number },
                { name?: string; kind?: string } | null
              >("assistanceWorkspace:getAssetForAgent", {
                ownerId: session.ownerId,
                assetId,
                expiresUnix: session.expiresUnix,
              });
              if (!asset) {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "asset_not_found",
                  id: item.assetId,
                });
              }
              if (session.mode === "image" && asset.kind !== "image") {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "image_jobs_accept_image_references_only",
                  id: item.assetId,
                });
              }
              if (role === "audio" && asset.kind !== "audio") {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "audio_role_requires_audio_asset",
                  id: item.assetId,
                });
              }
              if (
                session.mode === "video" &&
                !resolveVideoModel().supportsMultimodalRefs
              ) {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "video_model_does_not_support_multimodal_references",
                });
              }
              reference = {
                assetId,
                role,
                mediaKind:
                  asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"
                    ? asset.kind
                    : undefined,
                label: item.label?.trim() || asset.name,
                sortOrder: next.length,
              };
            } else if (item.elementId) {
              const elementId = item.elementId as Id<"elements">;
              const element = await session.runQuery<
                { ownerId: Id<"users">; elementId: Id<"elements">; expiresUnix: number },
                { name?: string } | null
              >("assistanceWorkspace:getElementForAgent", {
                ownerId: session.ownerId,
                elementId,
                expiresUnix: session.expiresUnix,
              });
              if (!element) {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "element_not_found",
                  id: item.elementId,
                });
              }
              reference = {
                elementId,
                role,
                label: item.label?.trim() || element.name,
                sortOrder: next.length,
              };
            } else {
              const documentId = item.documentId as Id<"documents">;
              const document = await session.runQuery<
                { ownerId: Id<"users">; documentId: Id<"documents"> },
                { title?: string } | null
              >("assistanceWorkspace:getDocumentForAgent", {
                ownerId: session.ownerId,
                documentId,
              });
              if (!document) {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "document_not_found",
                  id: item.documentId,
                });
              }
              reference = {
                documentId,
                role,
                label: item.label?.trim() || document.title,
                sortOrder: next.length,
              };
            }
            const key = referenceKey(reference);
            const existingIndex = next.findIndex((candidate) => referenceKey(candidate) === key);
            if (existingIndex >= 0) {
              next[existingIndex] = { ...reference, sortOrder: next[existingIndex]!.sortOrder };
            } else {
              next.push(reference);
            }
          }
          const assetCount = next.filter((reference) => reference.assetId).length;
          if (assetCount > MAX_GENERATION_REFERENCE_ASSETS) {
            return recordTool(session, "set_references", input, {
              ok: false,
              error: "too_many_reference_assets",
              max: MAX_GENERATION_REFERENCE_ASSETS,
            });
          }
          session.references = next.map((reference, index) => ({
            ...reference,
            sortOrder: index,
          }));
          return recordTool(session, "set_references", input, {
            ok: true,
            references: session.references,
          });
        }),
    }),

    remove_references: tool({
      description:
        "Remove references that should not be sent to the generation model. Supply exact asset, document, or element IDs.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          ids: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
        },
        required: ["ids"],
        additionalProperties: false,
      }),
      execute: async (input) =>
        mutateSession(session, async () => {
          const ids = new Set(
            (input as { ids: string[] }).ids
              .map(String)
              .map((id) => id.trim())
              .filter(Boolean),
          );
          const before = session.references.length;
          session.references = session.references
            .filter((reference) => {
              const referenceIds = [
                reference.assetId,
                reference.documentId,
                reference.elementId,
              ]
                .filter(Boolean)
                .map(String);
              return !referenceIds.some((id) => ids.has(id));
            })
            .map((reference, sortOrder) => ({ ...reference, sortOrder }));
          return recordTool(session, "remove_references", input, {
            ok: true,
            removed: before - session.references.length,
            references: session.references,
          });
        }),
    }),

    evaluate_brief: tool({
      description:
        "Check the current working brief and selected references against deterministic readiness rules before asking or preparing review.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () =>
        recordTool(session, "evaluate_brief", {}, policyForSession(session)),
    }),

    update_brief: tool({
      description:
        "Persist creative facts into the working brief (subject, offer, copy, look, notes, brand). Call this whenever you learn something needed for the deliverable.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["user_explicit", "inferred"],
            description:
              "Use user_explicit only when the current user message directly states or corrects the value.",
          },
          subject: { type: "string" },
          objective: { type: "string" },
          audience: { type: "string" },
          keyMessage: { type: "string" },
          offer: { type: "string" },
          platform: { type: "string" },
          hook: { type: "string" },
          setting: { type: "string" },
          visualDirection: { type: "string" },
          notes: { type: "string" },
          brand: {
            type: "object",
            additionalProperties: false,
            properties: {
              productFidelity: { type: "string", enum: ["exact", "conceptual"] },
              logo: { type: "string", enum: ["include", "omit", "undecided"] },
              ctaMode: {
                type: "string",
                enum: ["custom", "contact", "omit", "undecided"],
              },
              ctaText: { type: "string" },
              contactValue: { type: "string" },
              offerText: { type: "string" },
            },
          },
        },
        additionalProperties: false,
      }),
      execute: async (input) => mutateSession(session, async () => {
        const patch = normalizeBriefPatch(input);
        if (!patch) {
          return recordTool(session, "update_brief", input, {
            ok: false,
            error: "empty_or_invalid_patch",
          });
        }
        const merged = mergeBriefPayload({
          current: session.draft,
          patch,
          lockedFields: session.lockedFields,
          forceUnlock:
            (input as { source?: string }).source === "user_explicit"
              ? Object.keys(patch).flatMap((key) => {
                  if (key === "brand" && patch.brand) {
                    return Object.keys(patch.brand).map((field) => `brand.${field}`);
                  }
                  return key === "source" ? [] : [key];
                })
              : [],
        });
        session.draft = merged.payload;
        const inferred = (input as { source?: string }).source !== "user_explicit";
        for (const path of merged.newlyInferred) lockPath(session, path, inferred);
        syncBrandOptionalMemory(session);
        const known = new Set(session.agentState.knownFacts);
        if (patch.subject) known.add(`Subject: ${patch.subject}`);
        if (patch.offer) known.add(`Offer: ${patch.offer}`);
        if (patch.visualDirection) known.add(`Look: ${patch.visualDirection}`);
        session.agentState = {
          ...session.agentState,
          knownFacts: [...known].slice(0, 40),
        };
        return recordTool(session, "update_brief", input, {
          ok: true,
          draft: session.draft,
          newlyInferred: merged.newlyInferred,
        });
      }),
    }),

    set_output_mode: tool({
      description:
        "Confirm the composer-scoped output mode. A turn cannot silently switch to another deliverable type.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["image", "video", "script", "element"],
          },
        },
        required: ["mode"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const requested = (input as { mode: AssistedMode }).mode;
        return recordTool(session, "set_output_mode", input, {
          ok: requested === session.mode,
          mode: session.mode,
          error:
            requested === session.mode
              ? undefined
              : "mode_locked_to_composer",
        });
      },
    }),

    set_video_type: tool({
      description:
        "Set the video workflow type for this job: standard (general Seedance clip) or hypermotion_ad (fast promotional/product ad with denser beats and brand/CTA structure). Use when the user asks for an ad, promo, product spot, or hypermotion treatment — or explicitly asks for standard/cinematic. Do not switch providers; Studio video stays on Seedance.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["user_explicit", "inferred"],
            description:
              "Use user_explicit when the current message clearly chooses the workflow; otherwise inferred.",
          },
          videoType: {
            type: "string",
            enum: ["standard", "hypermotion_ad"],
          },
        },
        required: ["source", "videoType"],
        additionalProperties: false,
      }),
      execute: async (input) =>
        mutateSession(session, async () => {
          if (session.mode !== "video") {
            return recordTool(session, "set_video_type", input, {
              ok: false,
              error: "video_mode_required",
              mode: session.mode,
            });
          }
          const raw = input as {
            source: "user_explicit" | "inferred";
            videoType: VideoType;
          };
          const nextVideoType = normalizeVideoType(raw.videoType);
          const currentVideoType = session.videoType ?? "standard";
          if (
            raw.source !== "user_explicit" &&
            session.lockedFields.includes("videoType") &&
            currentVideoType !== nextVideoType
          ) {
            return recordTool(session, "set_video_type", input, {
              ok: false,
              error: "video_type_locked",
              videoType: currentVideoType,
            });
          }
          if (currentVideoType === nextVideoType) {
            lockPath(session, "videoType", raw.source !== "user_explicit");
            return recordTool(session, "set_video_type", input, {
              ok: true,
              videoType: currentVideoType,
              unchanged: true,
            });
          }
          const transitioned = transitionAssistedMode({
            currentMode: "video",
            nextMode: "video",
            currentVideoType,
            nextVideoType,
            payload: session.draft,
            lockedFields: session.lockedFields,
          });
          session.videoType = transitioned.videoType;
          session.draft = transitioned.payload;
          session.lockedFields = transitioned.lockedFields;
          lockPath(session, "videoType", raw.source !== "user_explicit");
          const known = new Set(session.agentState.knownFacts);
          known.add(
            nextVideoType === "hypermotion_ad"
              ? "Video workflow: hypermotion ad"
              : "Video workflow: standard",
          );
          session.agentState = {
            ...session.agentState,
            knownFacts: [...known].slice(0, 40),
            nextFocus:
              nextVideoType === "hypermotion_ad"
                ? "Shape a dense product/ad beat plan"
                : "Shape a standard Seedance clip",
          };
          return recordTool(session, "set_video_type", input, {
            ok: true,
            videoType: session.videoType,
            resetFields: transitioned.resetFields,
          });
        }),
    }),

    set_brand_requirements: tool({
      description:
        "Set exact brand, offer, CTA, contact, logo, and product-fidelity requirements.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["user_explicit", "inferred"],
          },
          productFidelity: {
            type: "string",
            enum: ["exact", "conceptual"],
          },
          logo: {
            type: "string",
            enum: ["include", "omit", "undecided"],
          },
          ctaMode: {
            type: "string",
            enum: ["custom", "contact", "omit", "undecided"],
          },
          ctaText: { type: "string" },
          contactValue: { type: "string" },
          offerText: { type: "string" },
        },
        additionalProperties: false,
      }),
      execute: async (input) =>
        mutateSession(session, async () => {
          const raw = input as Record<string, unknown>;
          const source = raw.source;
          const brand = Object.fromEntries(
            Object.entries(raw).filter(
              ([key, value]) =>
                key !== "source" &&
                value !== undefined &&
                (typeof value !== "string" || value.trim()),
            ),
          ) as Partial<AssistedBriefPayload["brand"]>;
          if (typeof brand.contactValue === "string") {
            brand.contactValue = formatNanpContactNumbers(brand.contactValue);
          }
          if (!Object.keys(brand).length) {
            return recordTool(session, "set_brand_requirements", input, {
              ok: false,
              error: "empty_brand_patch",
            });
          }
          const paths = Object.keys(brand).map((field) => `brand.${field}`);
          const merged = mergeBriefPayload({
            current: session.draft,
            patch: { brand },
            lockedFields: session.lockedFields,
            forceUnlock: source === "user_explicit" ? paths : [],
          });
          session.draft = merged.payload;
          for (const path of paths) {
            if (valueAtPath(session.draft, path) !== undefined) {
              lockPath(session, path, source !== "user_explicit");
            }
          }
          syncBrandOptionalMemory(session);
          return recordTool(session, "set_brand_requirements", input, {
            ok: true,
            brand: session.draft.brand,
          });
        }),
    }),

    set_audio_plan: tool({
      description:
        "Set voiceover, music, sound effects, exact voiceover copy, and audio notes for the current job. When voiceover is included, write polished spoken copy from the full conversation and brief context—not a placeholder. Fit it to production.durationSeconds at roughly 2–2.5 spoken words/second maximum, preserve all exact user facts, and coordinate its emphasis with the visual beats. For short ads, do not spend the script reading a long phone number unless the user explicitly asks; when the number is already visible in an uploaded flyer/end card, use a natural spoken CTA such as “WhatsApp us to reserve” and preserve the number visually. Put performance direction such as [warm female voice] before the spoken copy; it will be separated from the words to speak.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["user_explicit", "inferred"],
          },
          voiceover: {
            type: "string",
            enum: ["include", "none"],
          },
          sfx: {
            type: "string",
            enum: ["include", "none"],
          },
          music: {
            type: "string",
            enum: ["include", "none"],
          },
          voiceoverCopy: { type: "string" },
          musicMood: { type: "string" },
          sfxNotes: { type: "string" },
        },
        additionalProperties: false,
      }),
      execute: async (input) =>
        mutateSession(session, async () => {
          const raw = input as Record<string, unknown>;
          const source = raw.source;
          const audio = Object.fromEntries(
            Object.entries(raw).filter(
              ([key, value]) =>
                key !== "source" &&
                value !== undefined &&
                (typeof value !== "string" || value.trim()),
            ),
          ) as Partial<AssistedBriefPayload["audio"]>;
          if (!Object.keys(audio).length) {
            return recordTool(session, "set_audio_plan", input, {
              ok: false,
              error: "empty_audio_patch",
            });
          }
          const paths = Object.keys(audio).map((field) => `audio.${field}`);
          const merged = mergeBriefPayload({
            current: session.draft,
            patch: { audio },
            lockedFields: session.lockedFields,
            forceUnlock: source === "user_explicit" ? paths : [],
          });
          session.draft = merged.payload;
          for (const path of paths) {
            if (valueAtPath(session.draft, path) !== undefined) {
              lockPath(session, path, source !== "user_explicit");
            }
          }
          return recordTool(session, "set_audio_plan", input, {
            ok: true,
            audio: session.draft.audio,
          });
        }),
    }),

    set_production_settings: tool({
      description:
        "Update production settings for the current mode (aspect ratio, resolution, quality, duration, script/element type). When the user asks to change resolution/quality/format, ALWAYS call this with source=user_explicit. Image resolution must be exactly 1K, 2K, or 4K. Video resolution must be 1280x720 (720p) or 1920x1080 (1080p) — Seedance 2.0 on Vercel AI Gateway. Image quality must be low, medium, or high. Video aspect ratio must be one of 16:9, 9:16, 1:1, 4:3, 3:4, 21:9. Duration 4–15s.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["user_explicit", "inferred"],
            description:
              "Use user_explicit only when the current user message directly states or corrects the setting.",
          },
          aspectRatio: { type: "string" },
          resolution: { type: "string" },
          quality: { type: "string" },
          durationSeconds: { type: "number" },
          scriptType: { type: "string" },
          elementType: { type: "string" },
          referenceIntent: { type: "string" },
        },
        additionalProperties: false,
      }),
      execute: async (input) => mutateSession(session, async () => {
        const raw = input as Record<string, unknown>;
        const inferred = raw.source !== "user_explicit";
        const allowedResolutions =
          session.mode === "image"
            ? new Set(["1K", "2K", "4K"])
            : new Set(["1280x720", "1920x1080"]);
        const normalizeResolution = (value: string): string | null => {
          const compact = value.trim().toUpperCase().replace(/\s+/g, "");
          if (session.mode === "image") {
            if (allowedResolutions.has(compact)) return compact;
            if (compact === "1" || compact === "1024" || compact === "1024X1024") return "1K";
            if (compact === "2" || compact === "2048" || compact === "2048X2048") return "2K";
            if (compact === "4" || compact === "4096" || compact === "4096X4096") return "4K";
            return null;
          }
          const lower = value.trim().toLowerCase();
          // Seedance 2.0 (Vercel catalog): 720p / 1080p only. Draft 480p upgrades to 720p.
          if (
            lower === "480p" ||
            lower === "480" ||
            lower === "854x480" ||
            lower === "864x480" ||
            lower === "720p" ||
            lower === "720" ||
            lower === "hd"
          ) {
            return "1280x720";
          }
          if (lower === "1080p" || lower === "1080" || lower === "fhd") return "1920x1080";
          if (allowedResolutions.has(value.trim())) return value.trim();
          return null;
        };
        let normalizedResolution: string | undefined;
        if (typeof raw.resolution === "string" && raw.resolution.trim()) {
          const next = normalizeResolution(raw.resolution);
          if (!next) {
            return recordTool(session, "set_production_settings", input, {
              ok: false,
              error: "unsupported_resolution",
              allowed: [...allowedResolutions],
            });
          }
          normalizedResolution = next;
        }
        if (
          raw.quality !== undefined &&
          (session.mode !== "image" ||
            typeof raw.quality !== "string" ||
            !["low", "medium", "high"].includes(raw.quality.trim().toLowerCase()))
        ) {
          return recordTool(session, "set_production_settings", input, {
            ok: false,
            error: "unsupported_quality",
            allowed: ["low", "medium", "high"],
          });
        }
        if (raw.durationSeconds !== undefined) {
          const duration = Number(raw.durationSeconds);
          const maxDuration =
            session.mode === "video"
              ? (resolveVideoModel().maxDurationSeconds ?? 15)
              : undefined;
          if (
            session.mode !== "video" ||
            !Number.isFinite(duration) ||
            duration < 4 ||
            duration > maxDuration!
          ) {
            return recordTool(session, "set_production_settings", input, {
              ok: false,
              error: "unsupported_duration",
              allowed:
                maxDuration !== undefined ? { minSeconds: 4, maxSeconds: maxDuration } : undefined,
            });
          }
        }
        const canSet = (path: string) =>
          raw.source === "user_explicit" || !session.lockedFields.includes(path);
        const production: AssistedBriefPayload["production"] = {
          ...session.draft.production,
        };
        if (raw.aspectRatio !== undefined) {
          const aspectRatio = normalizeAssistanceAspectRatio(raw.aspectRatio);
          if (!aspectRatio) {
            return recordTool(session, "set_production_settings", input, {
              ok: false,
              error: "unsupported_aspect_ratio",
            });
          }
          if (canSet("production.aspectRatio")) {
            production.aspectRatio = aspectRatio;
            lockPath(session, "production.aspectRatio", inferred);
          }
        }
        if (canSet("production.resolution") && normalizedResolution) {
          production.resolution = normalizedResolution;
          lockPath(session, "production.resolution", inferred);
        }
        if (
          canSet("production.quality") &&
          typeof raw.quality === "string" &&
          raw.quality.trim()
        ) {
          production.quality = raw.quality.trim().toLowerCase();
          lockPath(session, "production.quality", inferred);
        }
        let durationPlanHint: ReturnType<typeof planVideoDuration> | undefined;
        if (canSet("production.durationSeconds") && typeof raw.durationSeconds === "number") {
          const previousDuration = session.draft.production.durationSeconds;
          production.durationSeconds = raw.durationSeconds;
          lockPath(session, "production.durationSeconds", inferred);
          if (
            session.mode === "video" &&
            previousDuration !== raw.durationSeconds
          ) {
            // Old beat timings no longer match — replan from the new length.
            session.draft = { ...session.draft, timedBeats: undefined };
            durationPlanHint = planVideoDuration(
              raw.durationSeconds,
              session.videoType,
            );
          }
        }
        if (
          canSet("production.scriptType") &&
          typeof raw.scriptType === "string" &&
          raw.scriptType.trim()
        ) {
          production.scriptType = raw.scriptType.trim();
          lockPath(session, "production.scriptType", inferred);
        }
        if (
          canSet("production.elementType") &&
          typeof raw.elementType === "string" &&
          raw.elementType.trim()
        ) {
          production.elementType = raw.elementType.trim();
          lockPath(session, "production.elementType", inferred);
        }
        if (
          canSet("production.referenceIntent") &&
          typeof raw.referenceIntent === "string" &&
          raw.referenceIntent.trim()
        ) {
          production.referenceIntent = raw.referenceIntent.trim();
          lockPath(session, "production.referenceIntent", inferred);
        }
        session.draft = { ...session.draft, production };
        return recordTool(session, "set_production_settings", input, {
          ok: true,
          production: session.draft.production,
          ...(durationPlanHint
            ? {
                durationPlan: {
                  durationSeconds: durationPlanHint.durationSeconds,
                  beatCount: durationPlanHint.beatCount,
                  pacing: durationPlanHint.pacing,
                  guidance: durationPlanHint.agentGuidance,
                },
              }
            : {}),
        });
      }),
    }),

    update_agent_state: tool({
      description:
        "Update sanitized durable agent memory: goal, known facts, missing items, next focus. Never store private chain-of-thought.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          goal: { type: "string" },
          knownFacts: { type: "array", items: { type: "string" } },
          missingCritical: { type: "array", items: { type: "string" } },
          missingOptional: { type: "array", items: { type: "string" } },
          nextFocus: { type: "string" },
          unresolvedDecisions: { type: "array", items: { type: "string" } },
          readinessRationale: { type: "string" },
          readyForReview: { type: "boolean" },
          turnStrategy: {
            type: "string",
            enum: ["clarify", "deepen", "confirm", "review"],
          },
        },
        additionalProperties: false,
      }),
      execute: async (input) => mutateSession(session, async () => {
        const raw = input as Partial<AssistanceAgentState>;
        session.agentState = emptyAgentState({
          ...session.agentState,
          ...raw,
          knownFacts: Array.isArray(raw.knownFacts)
            ? raw.knownFacts.map(String).slice(0, 40)
            : session.agentState.knownFacts,
          missingCritical: Array.isArray(raw.missingCritical)
            ? raw.missingCritical.map(String).slice(0, 20)
            : session.agentState.missingCritical,
          missingOptional: Array.isArray(raw.missingOptional)
            ? raw.missingOptional.map(String).slice(0, 20)
            : session.agentState.missingOptional,
          unresolvedDecisions: Array.isArray(raw.unresolvedDecisions)
            ? raw.unresolvedDecisions.map(String).slice(0, 20)
            : session.agentState.unresolvedDecisions,
        });
        return recordTool(session, "update_agent_state", input, {
          ok: true,
          agentState: session.agentState,
        });
      }),
    }),

    request_approval: tool({
      description:
        "End the turn by staging a user approval for trash, a workspace move, or a paid element-sheet build. Media generation must use prepare_review instead. Never execute these actions directly.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["trash", "move", "element_build"],
          },
          title: { type: "string" },
          summary: { type: "string" },
          kind: {
            type: "string",
            enum: ["folder", "asset", "document", "element"],
          },
          id: { type: "string" },
          destinationFolderId: { type: "string" },
          elementId: { type: "string" },
        },
        required: ["action", "title", "summary"],
        additionalProperties: false,
      }),
      execute: async (input, options) =>
        mutateSession(session, async () => {
          if (session.terminal) {
            return recordTool(session, "request_approval", input, {
              ok: false,
              error: "terminal_already_selected",
            });
          }
          const raw = input as {
            action: "trash" | "move" | "element_build";
            title: string;
            summary: string;
            kind?: "folder" | "asset" | "document" | "element";
            id?: string;
            destinationFolderId?: string;
            elementId?: string;
          };
          if (
            raw.action === "trash" &&
            (!raw.kind || !raw.id)
          ) {
            return recordTool(session, "request_approval", input, {
              ok: false,
              error: "trash_requires_kind_and_id",
            });
          }
          if (
            raw.action === "move" &&
            (!raw.kind || !raw.id || !raw.destinationFolderId)
          ) {
            return recordTool(session, "request_approval", input, {
              ok: false,
              error: "move_requires_kind_id_and_destination",
            });
          }
          if (raw.action === "element_build" && !raw.elementId) {
            return recordTool(session, "request_approval", input, {
              ok: false,
              error: "element_build_requires_element_id",
            });
          }
          let authoritativeEstimate: number | undefined;
          try {
            const validation = await session.runQuery<
              Record<string, unknown>,
              { ok: boolean; estimatedCredits?: number }
            >(
              "assistanceWorkspace:validateApprovalTargetForAgent",
              {
                ownerId: session.ownerId,
                action: raw.action,
                kind: raw.kind,
                id: raw.id,
                destinationFolderId: raw.destinationFolderId,
                elementId: raw.elementId,
              },
            );
            authoritativeEstimate = validation.estimatedCredits;
          } catch {
            return recordTool(session, "request_approval", input, {
              ok: false,
              error: "approval_target_not_found",
            });
          }
          session.pendingApprovals = [
            {
              toolCallId: options.toolCallId,
              action: raw.action,
              title: raw.title.trim().slice(0, 160),
              summary: raw.summary.trim().slice(0, 1_000),
              argumentsJson: JSON.stringify({
                kind: raw.kind,
                id: raw.id,
                destinationFolderId: raw.destinationFolderId,
                elementId: raw.elementId,
              }),
              estimatedCredits: authoritativeEstimate,
            },
          ];
          session.terminal = {
            kind: "approval",
            message: "Review the requested action below.",
          };
          return recordTool(session, "request_approval", input, {
            ok: true,
            terminal: "approval",
          });
        }),
    }),

    ask_user: tool({
      description:
        "End this turn with one short casual chat message that asks a single high-leverage question. Do not ask for values you already stored with tools. Do not narrate tool updates.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          message: {
            type: "string",
            description:
              "1 short sentence (max 2). Casual human chat. Light emoji ok. No \"I've updated…\" recaps or filler openers.",
          },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["choice", "text", "upload", "multi"],
                },
                prompt: { type: "string" },
                field: { type: "string" },
                required: { type: "boolean" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      value: { type: "string" },
                      label: { type: "string" },
                    },
                    required: ["value", "label"],
                  },
                },
              },
              required: ["id", "kind", "prompt"],
            },
          },
        },
        required: ["message"],
        additionalProperties: false,
      }),
      execute: async (input) => mutateSession(session, async () => {
        if (session.terminal) {
          return recordTool(session, "ask_user", input, {
            ok: false,
            error: "terminal_already_selected",
          });
        }
        const raw = input as {
          message: string;
          questions?: GuidedQuestion[];
        };
        const questions = (raw.questions ?? [])
          .filter((question) => question?.id && question?.prompt)
          .slice(0, 1);
        // Drop questions whose field is already answered in the brief.
        const filtered = questions.filter((question) => {
          if (!question.field) return true;
          return !isAssistanceFieldAlreadyAnswered(session, question.field);
        });
        if (!filtered.length) {
          return recordTool(session, "ask_user", input, {
            ok: false,
            error: "no_unanswered_question",
            hint: "That field is already set. Call evaluate_brief and prepare_review if ready.",
          });
        }
        session.terminal = {
          kind: "ask",
          message: String(raw.message || "").trim().slice(0, 280) || "what’s next?",
          questions: filtered,
        };
        session.agentState = {
          ...session.agentState,
          readyForReview: false,
          turnStrategy: "clarify",
          nextFocus: filtered[0]?.prompt ?? "Clarify the request",
        };
        return recordTool(session, "ask_user", input, {
          ok: true,
          terminal: "ask",
          questions: filtered,
        });
      }),
    }),

    prepare_review: tool({
      description:
        "End this turn with a genuinely ready-to-generate review. First provide an adaptive outcome-readiness assessment derived from this specific job, not a generic mode checklist. Any factual/identity/usability unknown that could materially weaken or mislead the result belongs in criticalUnknowns and blocks review. Put ALL production detail in finalPrompt. For video, write a Seedance-ready director brief sized to durationSeconds (Shot beats, concrete action, one camera move each). The chat message must stay short and casual.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          message: {
            type: "string",
            description:
              "Short casual chat note for the review bubble — the real reply the user sees (e.g. \"nice — sushi wraps flyer ready\"). Never a generic ready filler. Details belong in finalPrompt, not here.",
          },
          finalPrompt: {
            type: "string",
            description:
              "Full production prompt. Video: subject/traits, scene/light, Shot list or timed beats with verbs + one camera move each, audio if needed, constraints, and explicit numbered reference mapping. Not vibe-only copy.",
          },
          negativePrompt: { type: "string" },
          rationale: { type: "string" },
          readiness: {
            type: "object",
            description:
              "Fresh semantic self-review of whether this exact deliverable will accomplish the user's intended outcome. Derive criteria from the job; do not copy a fixed checklist.",
            properties: {
              intendedOutcome: {
                type: "string",
                description:
                  "What the finished deliverable must accomplish for the user or audience.",
              },
              successCriteria: {
                type: "array",
                items: { type: "string" },
                description:
                  "Two to eight concrete, job-specific tests the output must pass.",
              },
              criticalUnknowns: {
                type: "array",
                items: { type: "string" },
                description:
                  "Unresolved facts or decisions that affect truth, identity, usability, or the core outcome. Must be empty to review; never hide a blocker as an assumption.",
              },
              safeAssumptions: {
                type: "array",
                items: { type: "string" },
                description:
                  "Noncritical creative decisions Studio can make confidently without interrogating the user.",
              },
              rationale: {
                type: "string",
                description:
                  "Short public-safe explanation of why generation is ready now.",
              },
            },
            required: [
              "intendedOutcome",
              "successCriteria",
              "criticalUnknowns",
              "safeAssumptions",
              "rationale",
            ],
            additionalProperties: false,
          },
        },
        required: ["message", "finalPrompt", "readiness"],
        additionalProperties: false,
      }),
      execute: async (input) => mutateSession(session, async () => {
        if (session.terminal) {
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "terminal_already_selected",
          });
        }
        if (session.entryPoint === "image_to_video") {
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "image_to_video_discovery_required",
            hint:
              "Inspect the source image and use ask_user to clarify the intended video treatment before preparing a review.",
          });
        }
        const raw = input as {
          message: string;
          finalPrompt: string;
          negativePrompt?: string;
          rationale?: string;
          readiness?: CreativeReadinessInput;
        };
        const finalPrompt = String(raw.finalPrompt || "").trim();
        const readiness = assessCreativeReadiness(raw.readiness);
        const voiceoverIssue = voiceoverReviewIssue(session);
        const structureIssue = videoStructureReviewIssue(session, finalPrompt);
        const craft = assessFinalPromptForReview({
          mode: session.mode,
          finalPrompt,
          hasStartFrame: false,
          videoType: session.videoType,
        });
        const policy = policyForSession(session);
        const capabilityError = referenceCapabilityError(session);

        const blockerLines: string[] = [];
        if (!readiness.ok) {
          if (readiness.blockers.length) {
            blockerLines.push(...readiness.blockers);
          } else {
            blockerLines.push(
              readiness.hint ||
                readiness.error ||
                "Complete the readiness assessment.",
            );
          }
        }
        if (voiceoverIssue) blockerLines.push(voiceoverIssue.hint);
        if (structureIssue) blockerLines.push(structureIssue.hint);
        if (!craft.ok) {
          blockerLines.push(
            craft.hint || craft.error || "Strengthen the production prompt.",
          );
        }
        if (capabilityError) blockerLines.push(capabilityError);
        if (!policy.complete) {
          blockerLines.push(
            ...policy.blockers,
            ...policy.questions
              .filter((question) => question.required)
              .map((question) => question.prompt),
          );
        }

        if (blockerLines.length > 0) {
          const primaryError = !readiness.ok
            ? readiness.error
            : voiceoverIssue?.error
              ? voiceoverIssue.error
              : structureIssue?.error
                ? structureIssue.error
                : !craft.ok
                  ? craft.error ?? "final_prompt_too_thin"
                  : capabilityError
                    ? "incompatible_references"
                    : "brief_not_ready";
          const durationPlan =
            session.mode === "video"
              ? planVideoDuration(
                  session.draft.production.durationSeconds,
                  session.videoType,
                )
              : null;
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: primaryError,
            reviewError: "review_not_ready",
            blockers: blockerLines.slice(0, 12),
            policyBlockers: policy.blockers,
            policyQuestions: policy.questions,
            ...(structureIssue
              ? {
                  structure: {
                    error: structureIssue.error,
                    hint: structureIssue.hint,
                  },
                }
              : {}),
            ...(!craft.ok
              ? {
                  craft: {
                    error: craft.error ?? "final_prompt_too_thin",
                    hint: craft.hint,
                  },
                }
              : {}),
            ...(voiceoverIssue
              ? {
                  voiceover: {
                    error: voiceoverIssue.error,
                    hint: voiceoverIssue.hint,
                  },
                }
              : {}),
            ...(durationPlan
              ? {
                  durationPlan: {
                    beatCount: durationPlan.beatCount,
                    minBeats: durationPlan.minBeats,
                    maxBeats: durationPlan.maxBeats,
                    durationSeconds: durationPlan.durationSeconds,
                  },
                }
              : {}),
            warnings: policy.warnings,
            hint: `Fix all listed issues in one rewrite, then retry prepare_review once. Issues: ${blockerLines.slice(0, 6).join(" | ")}`,
          });
        }

        const reviewedFinalPrompt = [
          authoritativePromptLayer(session),
          finalPrompt,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 12_000);

        const criticHash = JSON.stringify({
          finalPrompt: reviewedFinalPrompt,
          brand: session.draft.brand,
          audio: session.draft.audio,
          production: session.draft.production,
          readiness,
        });
        let critique: CreativeReadinessCritique;
        if (
          session.lastReadinessCritique &&
          session.lastCriticInputHash === criticHash
        ) {
          critique = session.lastReadinessCritique;
        } else if (session.criticCallsThisTurn >= 1) {
          // Critic is called at most once per turn for cost. A hard "revise"
          // replay on every later attempt made prepare_review unreachable and
          // forced the useless "what's still missing?" fallback. After one
          // revise pass, accept a rewritten candidate that already cleared
          // deterministic gates. Sticky "ask" stays sticky.
          if (session.lastReadinessCritique?.decision === "ask") {
            critique = session.lastReadinessCritique;
          } else {
            critique = {
              decision: "ready",
              rationale:
                "Accepted after one critic revision pass — prompt was rewritten under prior instructions.",
              criticalGaps: [],
              revisionInstructions: [],
              assumptions: [
                "Creative polish applied from the prior readiness revision pass.",
              ],
            };
            session.lastCriticInputHash = criticHash;
          }
        } else {
          try {
            session.criticCallsThisTurn += 1;
            critique = await session.critiqueCreativeReadiness({
              finalPrompt: reviewedFinalPrompt,
              claimedReadiness: readiness,
            });
            session.lastCriticInputHash = criticHash;
          } catch {
            session.agentState = {
              ...session.agentState,
              readyForReview: false,
              turnStrategy: "clarify",
              nextFocus: "Recover readiness judgment",
              readinessRationale: "Independent readiness critic failed",
            };
            return recordTool(session, "prepare_review", input, {
              ok: false,
              error: "readiness_critic_failed",
              hint: "Ask the highest-leverage clarifying question, then try review again.",
            });
          }
        }
        session.lastReadinessCritique = critique;
        if (critique.decision === "ask") {
          const gaps = critique.criticalGaps.slice(0, 8);
          session.agentState = {
            ...session.agentState,
            readyForReview: false,
            missingCritical: gaps.length
              ? gaps
              : ["One material decision still needs the user"],
            turnStrategy: "clarify",
            nextFocus:
              critique.suggestedQuestion?.trim() ||
              gaps[0] ||
              "Resolve a material unknown",
            readinessRationale: critique.rationale.slice(0, 1_000),
          };
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "brief_needs_user_input",
            blockers: gaps,
            suggestedQuestion: critique.suggestedQuestion,
            hint:
              critique.suggestedQuestion?.trim() ||
              "Ask the single highest-leverage question for the remaining material unknown.",
          });
        }
        if (critique.decision === "revise") {
          session.agentState = {
            ...session.agentState,
            readyForReview: false,
            turnStrategy: "deepen",
            nextFocus: "Strengthen the production prompt",
            readinessRationale: critique.rationale.slice(0, 1_000),
          };
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "review_candidate_needs_revision",
            revisionInstructions: critique.revisionInstructions,
            hint:
              critique.revisionInstructions[0] ||
              "Improve the finalPrompt yourself — do not ask the user for optional polish.",
          });
        }

        const negativePrompt = raw.negativePrompt?.trim().slice(0, 2_000);
        session.assumptions = Array.from(
          new Set([
            ...session.assumptions,
            ...readiness.safeAssumptions,
            ...critique.assumptions,
          ]),
        ).slice(0, 20);
        const compiledFinalPrompt = [
          reviewedFinalPrompt,
          negativePrompt ? `Negative constraints: ${negativePrompt}` : undefined,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 12_000);
        session.terminal = {
          kind: "review",
          message:
            String(raw.message || "").trim().slice(0, 280) ||
            "looks set — hit generate when you want",
          finalPrompt: compiledFinalPrompt,
          negativePrompt,
          rationale:
            raw.rationale?.trim().slice(0, 1_000) || readiness.rationale,
        };
        session.agentState = {
          ...session.agentState,
          readyForReview: true,
          missingCritical: [],
          unresolvedDecisions: [],
          turnStrategy: "review",
          readinessRationale:
            critique.rationale ||
            session.terminal.rationale ||
            readiness.rationale,
        };
        return recordTool(session, "prepare_review", input, {
          ok: true,
          terminal: "review",
          finalPromptLength: compiledFinalPrompt.length,
          ...(craft.warnings?.length ? { craftWarnings: craft.warnings } : {}),
        });
      }),
    }),
  };

  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const originalExecute = definition.execute;
      if (!originalExecute) return [name, definition];
      return [
        name,
        {
          ...definition,
          execute: async (input: never, options: never) => {
            if (
              session.recoveryMode &&
              !ASSISTANCE_RECOVERY_TOOLS.has(name)
            ) {
              return recordTool(session, name, input, {
                ok: false,
                error: "recovery_tools_only",
                hint: "Recovery mode: use prepare_review, ask_user, set_audio_plan, set_brand_requirements, update_brief, set_video_type, or evaluate_brief.",
              });
            }
            return originalExecute(input, options);
          },
        },
      ];
    }),
  ) as typeof tools;
}

export type AssistanceToolSet = ReturnType<typeof createAssistanceTools>;

/** Attachment role helper kept for future set_references tool. */
export const ASSISTANCE_ATTACHMENT_ROLES: AttachmentRole[] = [
  "product",
  "logo",
  "style",
  "motion",
  "audio",
  "supporting",
  "reference",
];
