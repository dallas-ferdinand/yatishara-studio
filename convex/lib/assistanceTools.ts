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
import { emptyAgentState } from "./guidedVideoTypes";
import {
  attachmentPresenceFromRoles,
  evaluateBrief,
  mergeBriefPayload,
  normalizeAssistanceAspectRatio,
  normalizeBriefPatch,
} from "./hypermotionWorkflow";
import { MAX_GENERATION_REFERENCE_ASSETS } from "./elementAssetModel";
import { resolveVideoModel } from "./videoModels";
import { creditCostForGeneration, type MeasuredTextUsage } from "./generationPricing";
import type { ReferenceInput } from "./referenceInput";

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
  draft: AssistedBriefPayload;
  lockedFields: string[];
  inferredFields: string[];
  agentState: AssistanceAgentState;
  assumptions: string[];
  warnings: string[];
  attachmentSummaries: string[];
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
};

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

function policyForSession(session: AssistanceAgentSession) {
  return evaluateBrief({
    mode: session.mode,
    videoType: session.videoType,
    payload: session.draft,
    attachments: attachmentPresenceFromRoles(
      session.references.map((reference) => reference.role),
    ),
    offeredOptionalIds: [],
    skippedOptionalIds: [],
    lockedFields: session.lockedFields,
  });
}

function referenceCapabilityError(session: AssistanceAgentSession): string | undefined {
  const mediaReferences = session.references.filter((reference) => reference.mediaKind);
  if (
    session.mode === "image" &&
    mediaReferences.some((reference) => reference.mediaKind !== "image")
  ) {
    return "Image jobs accept image references only. Remove video/audio references before review.";
  }
  const startFrames = mediaReferences.filter((reference) => reference.role === "start_frame");
  if (
    startFrames.some((reference) => reference.mediaKind !== "image") ||
    (startFrames.length > 0 && session.mode !== "video")
  ) {
    return "A start frame must be one image on a video job.";
  }
  if (
    session.mode === "video" &&
    !resolveVideoModel().supportsMultimodalRefs &&
    mediaReferences.some((reference) => reference.role !== "start_frame")
  ) {
    return "The selected video model does not support multimodal references other than its start frame.";
  }
  return undefined;
}

function authoritativePromptLayer(session: AssistanceAgentSession): string {
  const payload = session.draft;
  const facts = [
    payload.subject ? `Subject: ${payload.subject}` : undefined,
    payload.objective ? `Objective: ${payload.objective}` : undefined,
    payload.keyMessage ? `Key message: ${payload.keyMessage}` : undefined,
    payload.offer ? `Offer/copy: ${payload.offer}` : undefined,
    payload.brand.offerText ? `Exact offer text: ${payload.brand.offerText}` : undefined,
    payload.brand.ctaText ? `Exact CTA text: ${payload.brand.ctaText}` : undefined,
    payload.brand.contactValue ? `Exact contact value: ${payload.brand.contactValue}` : undefined,
    payload.production.aspectRatio
      ? `Output aspect ratio: ${payload.production.aspectRatio}`
      : undefined,
    payload.production.resolution
      ? `Output resolution: ${payload.production.resolution}`
      : undefined,
  ].filter((fact): fact is string => Boolean(fact));
  const references = [...session.references]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (reference, index) =>
        `- Reference ${index + 1}: “${reference.label ?? "Untitled"}” — role=${reference.role}`,
    );
  return [
    "AUTHORITATIVE REVIEWED REQUIREMENTS — do not contradict, omit, or rewrite exact copy:",
    ...facts.map((fact) => `- ${fact}`),
    ...(references.length
      ? [
          "ORDERED REFERENCE ASSIGNMENTS — use each input only for its stated role:",
          ...references,
        ]
      : []),
  ].join("\n");
}

function recordTool(
  session: AssistanceAgentSession,
  name: string,
  input: unknown,
  output: unknown,
) {
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
  return {
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
        return recordTool(session, "inspect_media", input, {
          ok: true,
          assetId,
          name: asset.name,
          kind: asset.kind,
          description: inspected.description,
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
            start_frame: "Exact opening image for a video; only one should be selected.",
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
              if (item.role === "start_frame" && (session.mode !== "video" || asset.kind !== "image")) {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "start_frame_requires_image_for_video_job",
                  id: item.assetId,
                });
              }
              if (item.role === "audio" && asset.kind !== "audio") {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "audio_role_requires_audio_asset",
                  id: item.assetId,
                });
              }
              if (
                session.mode === "video" &&
                item.role !== "start_frame" &&
                !resolveVideoModel().supportsMultimodalRefs
              ) {
                return recordTool(session, "set_references", input, {
                  ok: false,
                  error: "video_model_does_not_support_multimodal_references",
                });
              }
              reference = {
                assetId,
                role: item.role,
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
                role: item.role,
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
                role: item.role,
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
          const startFrameCount = next.filter(
            (reference) => reference.role === "start_frame",
          ).length;
          if (startFrameCount > 1) {
            return recordTool(session, "set_references", input, {
              ok: false,
              error: "only_one_start_frame_allowed",
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
          const ids = new Set((input as { ids: string[] }).ids.map(String));
          const before = session.references.length;
          session.references = session.references
            .filter(
              (reference) =>
                !ids.has(String(reference.assetId ?? "")) &&
                !ids.has(String(reference.documentId ?? "")) &&
                !ids.has(String(reference.elementId ?? "")),
            )
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
          return recordTool(session, "set_brand_requirements", input, {
            ok: true,
            brand: session.draft.brand,
          });
        }),
    }),

    set_audio_plan: tool({
      description:
        "Set voiceover, music, sound effects, exact voiceover copy, and audio notes for the current job.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["user_explicit", "inferred"],
          },
          voiceover: {
            type: "string",
            enum: ["include", "omit", "undecided"],
          },
          sfx: {
            type: "string",
            enum: ["include", "omit", "undecided"],
          },
          music: {
            type: "string",
            enum: ["include", "omit", "undecided"],
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
        "Update production settings for the current mode (aspect ratio, resolution, quality, duration, script/element type). When the user asks to change resolution/quality/format, ALWAYS call this with source=user_explicit. Image resolution must be exactly 1K, 2K, or 4K. Video resolution must be 854x480, 1280x720, or 1920x1080. Image quality must be low, medium, or high. Use canonical ratios like 9:16.",
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
            : new Set(["854x480", "1280x720", "1920x1080"]);
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
          if (lower === "480p" || lower === "480") return "854x480";
          if (lower === "720p" || lower === "720" || lower === "hd") return "1280x720";
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
        if (canSet("production.durationSeconds") && typeof raw.durationSeconds === "number") {
          production.durationSeconds = raw.durationSeconds;
          lockPath(session, "production.durationSeconds", inferred);
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
        // Drop questions whose field is already filled.
        const filtered = questions.filter((question) => {
          if (!question.field) return true;
          const value = valueAtPath(session.draft, question.field);
          return value === undefined || value === "";
        });
        if (!filtered.length) {
          return recordTool(session, "ask_user", input, {
            ok: false,
            error: "no_unanswered_question",
            hint: "Evaluate the brief and prepare review if it is ready.",
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
        "End this turn with a ready-to-generate review. Put ALL production detail in finalPrompt. The chat message must stay short and casual — never dump the prompt into chat.",
      inputSchema: jsonSchema<object>({
        type: "object",
        properties: {
          message: {
            type: "string",
            description:
              "Brief friendly chat note only (e.g. \"ready when you are 🙂\"). Details belong in finalPrompt, not here.",
          },
          finalPrompt: { type: "string" },
          negativePrompt: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["message", "finalPrompt"],
        additionalProperties: false,
      }),
      execute: async (input) => mutateSession(session, async () => {
        if (session.terminal) {
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "terminal_already_selected",
          });
        }
        const raw = input as {
          message: string;
          finalPrompt: string;
          negativePrompt?: string;
          rationale?: string;
        };
        const finalPrompt = String(raw.finalPrompt || "").trim();
        if (finalPrompt.length < 80) {
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "final_prompt_too_thin",
            hint: "Expand into a detailed production prompt before review.",
          });
        }
        const policy = policyForSession(session);
        const capabilityError = referenceCapabilityError(session);
        if (capabilityError) {
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "incompatible_references",
            hint: capabilityError,
          });
        }
        if (!policy.complete) {
          return recordTool(session, "prepare_review", input, {
            ok: false,
            error: "brief_not_ready",
            blockers: policy.questions,
            warnings: policy.warnings,
            hint: "Resolve a blocker with tools, or ask the user one unresolved critical question.",
          });
        }
        const negativePrompt = raw.negativePrompt?.trim().slice(0, 2_000);
        const compiledFinalPrompt = [
          authoritativePromptLayer(session),
          finalPrompt,
          negativePrompt ? `Negative constraints: ${negativePrompt}` : undefined,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 12_000);
        session.terminal = {
          kind: "review",
          message:
            String(raw.message || "").trim().slice(0, 280) ||
            "ready when you are 🙂",
          finalPrompt: compiledFinalPrompt,
          negativePrompt,
          rationale: raw.rationale?.trim().slice(0, 1_000),
        };
        session.agentState = {
          ...session.agentState,
          readyForReview: true,
          missingCritical: [],
          unresolvedDecisions: [],
          turnStrategy: "review",
          readinessRationale:
            session.terminal.rationale ||
            "Critical requirements captured; ready for user approval.",
        };
        return recordTool(session, "prepare_review", input, {
          ok: true,
          terminal: "review",
          finalPromptLength: compiledFinalPrompt.length,
        });
      }),
    }),
  };
}

export type AssistanceToolSet = ReturnType<typeof createAssistanceTools>;

/** Attachment role helper kept for future set_references tool. */
export const ASSISTANCE_ATTACHMENT_ROLES: AttachmentRole[] = [
  "product",
  "logo",
  "style",
  "motion",
  "audio",
  "start_frame",
  "supporting",
  "reference",
];
