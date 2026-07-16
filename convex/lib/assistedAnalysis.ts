/**
 * Multimodal Assistance agent via Gemini (GATEWAY_ASSISTANT_MODEL_ID).
 * Multi-turn plan → one chat reply. Never starts generation.
 */
import { generateObject, jsonSchema } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { ReferenceInput } from "./referenceInput";
import { normalizeAudioMimeType } from "./referenceInput";
import type {
  AssistanceAgentState,
  AssistedBriefPayload,
  AssistedMode,
  AssistantAnalysis,
  GuidedQuestion,
  IntentClassification,
  ProposedModeDecision,
  ProposedStyleDecision,
  ProposedTextDecision,
  VideoType,
} from "./guidedVideoTypes";
import { emptyAgentState, parseAgentState } from "./guidedVideoTypes";
import {
  detectExplicitStyleConflict,
  normalizeBriefPatch,
  workflowSystemContext,
} from "./hypermotionWorkflow";

const assistantResponseSchema = jsonSchema<AssistantAnalysis>({
  type: "object",
  properties: {
    decision: { type: "string", enum: ["ask", "review_ready"] },
    message: { type: "string" },
    agentState: {
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
      required: [
        "goal",
        "knownFacts",
        "missingCritical",
        "missingOptional",
        "nextFocus",
        "unresolvedDecisions",
        "readinessRationale",
        "readyForReview",
        "turnStrategy",
      ],
    },
    intent: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["image", "video", "script", "element"] },
        videoType: { type: "string", enum: ["standard", "hypermotion_ad"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        reason: { type: "string" },
      },
      required: ["mode", "confidence"],
    },
    proposedMode: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["keep", "change", "ask"] },
        mode: { type: "string", enum: ["image", "video", "script", "element"] },
        videoType: { type: "string", enum: ["standard", "hypermotion_ad"] },
        reason: { type: "string" },
      },
      required: ["decision"],
    },
    proposedStyle: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["keep", "change", "ask"] },
        value: { type: "string" },
        reason: { type: "string" },
        conflict: {
          type: "string",
          enum: [
            "none",
            "photoreal_requested_with_illustrated_context",
            "illustrated_requested_with_photoreal_context",
          ],
        },
      },
      required: ["decision", "conflict"],
    },
    briefPatch: {
      type: "object",
      additionalProperties: false,
      properties: {
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
        production: {
          type: "object",
          additionalProperties: false,
          properties: {
            aspectRatio: { type: "string" },
            resolution: { type: "string" },
            quality: { type: "string" },
            referenceIntent: { type: "string" },
          },
        },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["choice", "text", "upload", "multi"] },
          prompt: { type: "string" },
          field: { type: "string" },
          uploadRole: { type: "string" },
          required: { type: "boolean" },
          allowLeaveOut: { type: "boolean" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                label: { type: "string" },
                leaveOut: { type: "boolean" },
              },
              required: ["value", "label"],
            },
          },
        },
        required: ["id", "kind", "prompt"],
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    inferredFields: { type: "array", items: { type: "string" } },
    attachmentRoleHints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          role: { type: "string" },
        },
        required: ["index", "role"],
      },
    },
  },
  required: [
    "decision",
    "message",
    "agentState",
    "intent",
    "proposedMode",
    "proposedStyle",
  ],
});

function assistantModelId(): string {
  // Assistance is multimodal (vision over product/refs). Never fall back to a
  // text-only lite model — that silently breaks image understanding.
  return (
    process.env.GATEWAY_ASSISTANT_MODEL_ID?.trim() || "google/gemini-3-flash"
  );
}

function contentPartForReference(reference: ReferenceInput): Array<
  | { type: "text"; text: string }
  | { type: "image"; image: URL }
  | { type: "file"; data: URL; mediaType: string }
> {
  if (reference.kind === "image") {
    return [{ type: "image", image: new URL(reference.url) }];
  }
  if (reference.kind === "video") {
    return [
      {
        type: "file",
        data: new URL(reference.url),
        mediaType: reference.mimeType?.split(";")[0]?.trim() || "video/mp4",
      },
    ];
  }
  return [
    {
      type: "file",
      data: new URL(reference.url),
      mediaType: normalizeAudioMimeType(reference.mimeType),
    },
  ];
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown, maxLength = 4_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeIntent(value: unknown): IntentClassification | undefined {
  const raw = objectValue(value);
  if (!raw) return undefined;
  const mode = ["image", "video", "script", "element"].includes(String(raw.mode))
    ? (raw.mode as AssistedMode)
    : undefined;
  const confidence = ["low", "medium", "high"].includes(String(raw.confidence))
    ? (raw.confidence as IntentClassification["confidence"])
    : undefined;
  if (!mode || !confidence) return undefined;
  const videoType =
    mode === "video" &&
    (raw.videoType === "standard" || raw.videoType === "hypermotion_ad")
      ? raw.videoType
      : undefined;
  return { mode, videoType, confidence, reason: text(raw.reason, 1_000) };
}

function normalizeModeProposal(value: unknown): ProposedModeDecision | undefined {
  const raw = objectValue(value);
  if (!raw || !["keep", "change", "ask"].includes(String(raw.decision))) {
    return undefined;
  }
  const mode = ["image", "video", "script", "element"].includes(String(raw.mode))
    ? (raw.mode as AssistedMode)
    : undefined;
  const videoType =
    raw.videoType === "standard" || raw.videoType === "hypermotion_ad"
      ? raw.videoType
      : undefined;
  return {
    decision: raw.decision as ProposedModeDecision["decision"],
    mode,
    videoType: mode === "video" ? videoType : undefined,
    reason: text(raw.reason, 1_000),
  };
}

function normalizeTextProposal(value: unknown): ProposedTextDecision | undefined {
  const raw = objectValue(value);
  if (!raw || !["keep", "change", "ask"].includes(String(raw.decision))) {
    return undefined;
  }
  return {
    decision: raw.decision as ProposedTextDecision["decision"],
    value: text(raw.value, 2_000),
    reason: text(raw.reason, 1_000),
  };
}

function normalizeStyleProposal(value: unknown): ProposedStyleDecision | undefined {
  const raw = objectValue(value);
  const base = normalizeTextProposal(value);
  const conflicts = [
    "none",
    "photoreal_requested_with_illustrated_context",
    "illustrated_requested_with_photoreal_context",
  ] as const;
  if (!base || !conflicts.includes(raw?.conflict as (typeof conflicts)[number])) {
    return undefined;
  }
  return { ...base, conflict: raw!.conflict as ProposedStyleDecision["conflict"] };
}

/** User clearly wants to skip remaining optional interviewing and generate. */
export function userExplicitlyProceeds(prompt: string): boolean {
  return /\b(?:just\s+generate|generate\s+(?:it|now|this)|go\s+ahead|looks?\s+good|ship\s+it|that(?:'|’)s\s+enough|thats\s+enough|ready\s+to\s+generate|proceed|no\s+more\s+questions|use\s+your\s+best\s+judgment|this\s+is\s+it|i(?:'|’)m\s+happy(?:\s+with\s+(?:this|that|it))?|happy\s+with\s+(?:this|that|it)|sounds?\s+good|perfect|let(?:'|’)s\s+(?:do|go)\s+it|do\s+it|approved|that(?:'|’)s\s+all|all\s+set|good\s+to\s+go|lfg)\b/i.test(
    prompt.trim(),
  );
}

/** Force review when the user clearly proceeds and no mode/style conflict remains. */
export function applyExplicitProceed(
  analysis: AssistantAnalysis,
  userPrompt: string,
): AssistantAnalysis {
  if (!userExplicitlyProceeds(userPrompt)) return analysis;
  const modeUnresolved = analysis.proposedMode?.decision === "ask";
  const styleUnresolved =
    Boolean(analysis.proposedStyle?.conflict) &&
    analysis.proposedStyle?.conflict !== "none" &&
    analysis.proposedStyle?.decision !== "change" &&
    analysis.proposedStyle?.decision !== "keep";
  if (modeUnresolved || styleUnresolved) return analysis;
  const agentState = analysis.agentState ?? emptyAgentState();
  return {
    ...analysis,
    decision: "review_ready",
    questions: [],
    agentState: {
      ...agentState,
      readyForReview: true,
      missingCritical: [],
      unresolvedDecisions: [],
      turnStrategy: "review",
      readinessRationale: "User confirmed they are ready to generate.",
    },
  };
}

export function formatAssistanceChatMessage(
  message: string,
  questions: GuidedQuestion[] = [],
): string {
  const base = message.trim();
  if (!questions.length) {
    return base || "got more detail? you can attach refs too";
  }
  const lines = questions.map((question) => {
    if (question.kind === "choice" || question.kind === "multi") {
      const options = (question.options ?? [])
        .map((option) => option.label)
        .filter(Boolean);
      return options.length
        ? `${question.prompt} (${options.join(" / ")})`
        : question.prompt;
    }
    if (question.kind === "upload") {
      return `${question.prompt} (attach in chat)`;
    }
    return question.prompt;
  });
  const extras = lines.filter((line) => {
    const needle = line.slice(0, Math.min(48, line.length)).toLowerCase();
    return needle.length > 0 && !base.toLowerCase().includes(needle);
  });
  if (!extras.length) return base;
  // Keep chat short: prefer a single inline question, never a numbered dump.
  const questionLine = extras[0];
  if (!base) return questionLine;
  if (base.toLowerCase().includes(questionLine.slice(0, 24).toLowerCase())) {
    return base;
  }
  return `${base}\n${questionLine}`;
}

function parseQuestions(raw: unknown): GuidedQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(objectValue)
    .filter((q): q is Record<string, unknown> => Boolean(q))
    .filter((q) =>
      Boolean(
        text(q.id, 200) &&
          ["choice", "text", "upload", "multi"].includes(String(q.kind)) &&
          text(q.prompt, 2_000),
      ),
    )
    .slice(0, 3)
    .map((q) => ({
      id: text(q.id, 200)!,
      kind: q.kind as GuidedQuestion["kind"],
      prompt: text(q.prompt, 2_000)!,
      field: text(q.field, 200),
      uploadRole: [
        "product",
        "logo",
        "style",
        "motion",
        "audio",
        "start_frame",
        "supporting",
        "reference",
      ].includes(String(q.uploadRole))
        ? (q.uploadRole as GuidedQuestion["uploadRole"])
        : undefined,
      required: Boolean(q.required),
      allowLeaveOut: Boolean(q.allowLeaveOut),
      options: Array.isArray(q.options)
        ? q.options
            .map(objectValue)
            .filter((option): option is Record<string, unknown> =>
              Boolean(option && text(option.value, 500) && text(option.label, 500)),
            )
            .map((option) => ({
              value: text(option.value, 500)!,
              label: text(option.label, 500)!,
              leaveOut: Boolean(option.leaveOut),
            }))
            .slice(0, 20)
        : undefined,
    }))
    .filter(
      (question) =>
        (question.kind !== "choice" && question.kind !== "multi") ||
        Boolean(question.options?.length),
    );
}

export function normalizeAssistantAnalysis(
  value: unknown,
  deterministicStyle?: ProposedStyleDecision,
): AssistantAnalysis {
  const raw = objectValue(value) ?? {};
  const hasDeterministicConflict =
    deterministicStyle?.conflict !== undefined &&
    deterministicStyle.conflict !== "none";
  let decision: AssistantAnalysis["decision"] =
    hasDeterministicConflict || raw.decision !== "review_ready"
      ? "ask"
      : "review_ready";

  let questions = parseQuestions(raw.questions);
  const proposedStyle =
    deterministicStyle?.conflict && deterministicStyle.conflict !== "none"
      ? deterministicStyle
      : normalizeStyleProposal(raw.proposedStyle) ?? deterministicStyle;

  if (
    hasDeterministicConflict &&
    !questions.some((question) => question.field === "visualDirection")
  ) {
    const conflictQuestion: GuidedQuestion = {
      id: "resolve_style_conflict",
      kind: "choice",
      field: "visualDirection",
      prompt:
        "The requested look conflicts with the supplied style. Which direction should we use?",
      required: true,
      options:
        deterministicStyle?.conflict ===
        "photoreal_requested_with_illustrated_context"
          ? [
              { value: "photoreal", label: "Photoreal" },
              { value: "illustrated", label: "Keep the illustrated style" },
            ]
          : [
              { value: "illustrated", label: "Illustrated / cartoon world" },
              { value: "photoreal", label: "Keep photoreal" },
            ],
    };
    questions = [conflictQuestion, ...questions].slice(0, 3);
  }

  const briefPatch = normalizeBriefPatch(raw.briefPatch);
  if (hasDeterministicConflict && briefPatch?.visualDirection !== undefined) {
    delete briefPatch.visualDirection;
  }

  let agentState =
    parseAgentState(raw.agentState) ??
    parseAgentState(raw.agentPlan) ??
    emptyAgentState({ goal: text(raw.message, 500) });

  // Gate review when critical gaps or unresolved decisions remain.
  if (
    decision === "review_ready" &&
    (agentState.missingCritical.length > 0 ||
      agentState.unresolvedDecisions.length > 0 ||
      !agentState.readyForReview)
  ) {
    decision = "ask";
    agentState = {
      ...agentState,
      readyForReview: false,
      turnStrategy:
        agentState.turnStrategy === "review" ? "deepen" : agentState.turnStrategy,
    };
  }

  if (decision === "review_ready") {
    agentState = {
      ...agentState,
      readyForReview: true,
      missingCritical: [],
      unresolvedDecisions: [],
      turnStrategy: "review",
    };
    questions = [];
  }

  const message = formatAssistanceChatMessage(
    text(raw.message) ||
      "Tell me a bit more in the chat and I’ll keep shaping this with you.",
    decision === "ask" ? questions : [],
  );

  return {
    decision,
    message,
    agentState,
    agentPlan: agentState,
    intent: normalizeIntent(raw.intent),
    proposedMode: normalizeModeProposal(raw.proposedMode),
    proposedSetting: normalizeTextProposal(raw.proposedSetting),
    proposedStyle,
    briefPatch,
    questions: decision === "ask" ? questions : [],
    assumptions: Array.isArray(raw.assumptions)
      ? raw.assumptions
          .map((item) => text(item, 1_000))
          .filter((item): item is string => Boolean(item))
          .slice(0, 12)
      : [],
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings
          .map((item) => text(item, 1_000))
          .filter((item): item is string => Boolean(item))
          .slice(0, 12)
      : [],
    inferredFields: Array.isArray(raw.inferredFields)
      ? raw.inferredFields
          .map((item) => text(item, 200))
          .filter((item): item is string => Boolean(item))
          .slice(0, 50)
      : [],
    attachmentRoleHints: Array.isArray(raw.attachmentRoleHints)
      ? raw.attachmentRoleHints
          .map(objectValue)
          .filter((hint): hint is Record<string, unknown> =>
            Boolean(
              hint &&
                typeof hint.index === "number" &&
                Number.isInteger(hint.index) &&
                hint.index >= 0 &&
                [
                  "product",
                  "logo",
                  "style",
                  "motion",
                  "audio",
                  "start_frame",
                  "supporting",
                  "reference",
                ].includes(String(hint.role)),
            ),
          )
          .map((hint) => ({
            index: hint.index as number,
            role: hint.role as NonNullable<
              AssistantAnalysis["attachmentRoleHints"]
            >[number]["role"],
          }))
          .slice(0, 20)
      : undefined,
  };
}

const AGENT_SYSTEM_RULES = [
  "You are Studio Assistance — one multi-turn creative director agent.",
  "Users answer only in the chat composer (attachments welcome). Never invent form UIs.",
  "Each turn returns exactly one natural chat message. Put follow-ups inside that message.",
  "Keep messages short. Do not restate the full brief every turn — acknowledge only what changed.",
  "Always write briefPatch with the facts you just learned (subject, offer, visualDirection, etc.).",
  "briefPatch must preserve every known requirement needed for the deliverable, especially exact promotional copy, dates, old/new prices, layout type, and aspect ratio. Rebuild these from conversation history when continuing after a generation.",
  "Treat generation history and generated media as authoritative context. If the user critiques a result, inspect that result and revise the brief instead of repeating the same prompt.",
  "A flyer/poster/promo is a designed graphic with readable on-image copy, not merely a hero product photo.",
  "Do not claim you changed a setting (such as aspect ratio) unless the same response writes that value into briefPatch.production.",
  "If a flyer/poster format or placement is ambiguous, ask which format to use; never silently claim a ratio was changed.",
  "When a product/reference photo is attached, set brand.productFidelity=exact and treat it as the hero product.",
  "Update agentState with confirmed facts, critical gaps, unresolved decisions, and next focus.",
  "Do NOT store private chain-of-thought. readinessRationale must be a short public-safe summary.",
  "Ask at most ONE high-leverage question per turn. Prefer shipping a review over optional polish.",
  "If the user says they are done / happy / this is it / go ahead, set decision=review_ready when critical facts exist.",
  "decision=review_ready when critical requirements are covered OR the user explicitly says to proceed.",
  "Never invent logo, CTA, contact, offer text, or exact product identity.",
  "Classify intent. Propose mode/style changes as typed proposedMode/proposedStyle commands.",
  "Unresolved mode/style conflicts stay decision=ask with proposed*.decision=ask.",
  "When the user confirms a mode/style change in chat, set proposed*.decision=change.",
].join("\n");

export async function analyzeAssistedTurn(input: {
  mode: AssistedMode;
  videoType?: VideoType;
  userPrompt: string;
  currentPayload: AssistedBriefPayload;
  lockedFields: string[];
  offeredOptionalIds: string[];
  skippedOptionalIds: string[];
  attachmentSummaries?: string[];
  styleContext?: string[];
  generationContext?: string[];
  conversationContext?: string[];
  previousAgentState?: AssistanceAgentState | null;
  referenceInputs?: ReferenceInput[];
}): Promise<{
  analysis: AssistantAnalysis;
  modelId: string;
  repaired: boolean;
  failed: boolean;
}> {
  const modelId = assistantModelId();
  const deterministicStyle = detectExplicitStyleConflict({
    userRequest: input.userPrompt,
    currentVisualDirection: input.currentPayload.visualDirection,
    styleContext:
      input.styleContext?.length ? input.styleContext : input.attachmentSummaries,
  });
  const previousState =
    input.previousAgentState ??
    emptyAgentState({
      goal: `Create a strong ${input.mode} for the user`,
    });
  const userProceeds = userExplicitlyProceeds(input.userPrompt);
  const proceedHint = userProceeds
    ? "User explicitly said they are done / happy / ready — set decision=review_ready and readyForReview=true unless a hard conflict remains. Do not ask another optional question."
    : "User did not explicitly ask to skip interviewing.";

  const system = [
    workflowSystemContext(input.mode, input.videoType),
    AGENT_SYSTEM_RULES,
    "Respond with a single JSON object matching the schema.",
  ].join("\n");

  const userText = [
    input.conversationContext?.length
      ? `Recent conversation (oldest → newest):\n${input.conversationContext.join("\n")}`
      : "Recent conversation: none (first turn)",
    `Previous agent state JSON:\n${JSON.stringify(previousState)}`,
    `User message:\n${input.userPrompt.trim() || "(attachments only)"}`,
    proceedHint,
    `Current brief JSON:\n${JSON.stringify(input.currentPayload)}`,
    `Locked fields (do not overwrite): ${input.lockedFields.join(", ") || "(none)"}`,
    `Already offered optionals: ${input.offeredOptionalIds.join(", ") || "(none)"}`,
    `Skipped optionals: ${input.skippedOptionalIds.join(", ") || "(none)"}`,
    input.attachmentSummaries?.length
      ? `Attachments:\n${input.attachmentSummaries.join("\n")}`
      : "Attachments: none",
    input.generationContext?.length
      ? `Generation context (authoritative):\n${input.generationContext.join("\n")}`
      : "Generation context: defaults",
  ].join("\n\n");

  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: userText },
        ...(input.referenceInputs ?? []).flatMap(contentPartForReference),
      ],
    },
  ];

  let repaired = false;
  try {
    const result = await generateObject({
      model: gateway.languageModel(modelId),
      schema: assistantResponseSchema,
      system,
      messages,
    });
    return {
      analysis: applyExplicitProceed(
        normalizeAssistantAnalysis(result.object, deterministicStyle),
        input.userPrompt,
      ),
      modelId,
      repaired,
      failed: false,
    };
  } catch (firstError) {
    repaired = true;
    try {
      const repair = await generateObject({
        model: gateway.languageModel(modelId),
        schema: assistantResponseSchema,
        system: `${system}\nPrevious response failed schema validation. Repair and return valid JSON only.`,
        messages: [
          ...messages,
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: `Schema repair required. Error: ${
                  firstError instanceof Error
                    ? firstError.message.slice(0, 300)
                    : "invalid"
                }`,
              },
            ],
          },
        ],
      });
      return {
        analysis: applyExplicitProceed(
          normalizeAssistantAnalysis(repair.object, deterministicStyle),
          input.userPrompt,
        ),
        modelId,
        repaired,
        failed: false,
      };
    } catch {
      return {
        modelId,
        repaired,
        failed: true,
        analysis: normalizeAssistantAnalysis(
          {
            decision: "ask",
            message:
              "I hit a snag reading that. Reply in the chat with what you want to create — attach references if you have them.",
            agentState: emptyAgentState({
              turnStrategy: "clarify",
              nextFocus: "What to create",
              readinessRationale: "Assistant unavailable; keep interviewing.",
            }),
            assumptions: [],
            warnings: ["Assistant schema repair failed — draft preserved."],
            inferredFields: [],
          },
          deterministicStyle,
        ),
      };
    }
  }
}
