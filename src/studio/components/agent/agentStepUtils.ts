import type { Id } from "../../../../convex/_generated/dataModel";
import {
  deriveStepKind,
  displayToolTitle,
  friendlyErrorLine,
  isAlwaysVisibleTool,
  type AgentStepKind,
} from "./agentToolTitles";

export type AgentToolCallRow = {
  _id: Id<"agentToolCalls">;
  runId: Id<"agentRuns">;
  toolName: string;
  argsJson: string;
  status: "started" | "pending_approval" | "completed" | "failed" | "cancelled";
  resultJson?: string;
  error?: string;
  approvalId?: Id<"agentApprovals">;
  startedAt: number;
  finishedAt?: number;
};

export type AgentMessageRow = {
  _id: Id<"agentMessages">;
  role: string;
  content: string;
  attachmentsJson?: string;
  approvalId?: Id<"agentApprovals">;
  createdAt: number;
};

export type AgentAttachmentChip = {
  id?: string;
  label?: string;
  kind?: string;
  studioKind?: string;
  studioId?: string;
  path?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
};

export type AgentRunRow = {
  _id: Id<"agentRuns">;
  userMessage: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  planJson?: string;
};

export type AgentApprovalRow = {
  _id: Id<"agentApprovals">;
  runId?: Id<"agentRuns">;
  title: string;
  summary: string;
  status: string;
  estimatedCredits?: number;
  toolName?: string;
};

export type StepOutcome = {
  label: string;
  folderId?: Id<"folders">;
  folderName?: string;
  documentId?: Id<"documents">;
  documentTitle?: string;
};

export type AgentMediaPreview = {
  assetId?: string;
  /** When gen is still rendering, follow this Create job until asset lands. */
  generationJobId?: string;
  stillRendering?: boolean;
  kind: "image" | "video" | "audio" | string;
  name?: string;
  url?: string;
  thumbnailUrl?: string;
};

/** While generate is in flight — reserve the output frame. */
export type AgentPendingMedia = {
  kind: "image" | "video" | "audio";
  /** CSS-friendly ratio e.g. "16 / 9" */
  aspectRatio: string;
  /** Original arg e.g. "16:9" */
  aspectLabel?: string;
  /** Create-tab generationJobs id — subscribe until stage=done. */
  generationJobId?: string;
};

export type DisplayStep = {
  id: string;
  toolCallId?: Id<"agentToolCalls">;
  approvalId?: Id<"agentApprovals">;
  toolName?: string;
  kind: AgentStepKind;
  title: string;
  subtitle?: string;
  status: AgentToolCallRow["status"] | "summary";
  durationMs?: number;
  startedAt?: number;
  finishedAt?: number;
  argsJson?: string;
  resultJson?: string;
  error?: string;
  outcome?: StepOutcome;
  media?: AgentMediaPreview[];
  pendingMedia?: AgentPendingMedia;
  collapsedGroupCount?: number;
  isGroupSummary?: boolean;
  isLive?: boolean;
  /** Human segments for group summary strip e.g. ["Explored 5 files", "Generated 2 videos"]. */
  summarySegments?: string[];
};

export type AgentTurn = {
  id: string;
  runId?: Id<"agentRuns">;
  userText: string;
  attachments?: AgentAttachmentChip[];
  userMessageId?: Id<"agentMessages">;
  assistantText?: string;
  assistantMessageId?: Id<"agentMessages">;
  steps: DisplayStep[];
  isLive?: boolean;
  /** Wall time from first tool/run start to last finish — shown after the turn. */
  workedMs?: number;
};

export function parseJsonSafe(raw?: string | null): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function parseAgentAttachments(raw?: string | null): AgentAttachmentChip[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: AgentAttachmentChip[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const chip: AgentAttachmentChip = {
        id: typeof row.id === "string" ? row.id : undefined,
        label: typeof row.label === "string" ? row.label : undefined,
        kind: typeof row.kind === "string" ? row.kind : undefined,
        studioKind: typeof row.studioKind === "string" ? row.studioKind : undefined,
        studioId: typeof row.studioId === "string" ? row.studioId : undefined,
        path: typeof row.path === "string" ? row.path : undefined,
        thumbnailUrl:
          typeof row.thumbnailUrl === "string" ? row.thumbnailUrl : undefined,
        mediaUrl: typeof row.mediaUrl === "string" ? row.mediaUrl : undefined,
      };
      if (chip.studioId || chip.label) out.push(chip);
    }
    return out;
  } catch {
    return [];
  }
}

export function formatStepDuration(startedAt: number, finishedAt?: number): number | undefined {
  if (!finishedAt || finishedAt <= startedAt) return undefined;
  return finishedAt - startedAt;
}

/** Human label for a finished turn, e.g. "Worked 2.5 mins". */
export function formatWorkedLabel(ms: number): string {
  const sec = Math.max(1, ms / 1000);
  if (sec < 60) return `Worked ${Math.round(sec)}s`;
  const min = sec / 60;
  if (min < 60) {
    const rounded = min < 10 ? Math.round(min * 10) / 10 : Math.round(min);
    if (rounded === 1) return "Worked 1 min";
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `Worked ${text} mins`;
  }
  const hrs = min / 60;
  const rounded = hrs < 10 ? Math.round(hrs * 10) / 10 : Math.round(hrs);
  if (rounded === 1) return "Worked 1 hr";
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `Worked ${text} hrs`;
}

export function turnWorkedMs(
  steps: DisplayStep[],
  run?: { createdAt?: number; startedAt?: number; finishedAt?: number } | null,
): number {
  const starts = steps
    .map((step) => step.startedAt)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const ends = steps
    .map((step) => step.finishedAt)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const start =
    run?.startedAt || (starts.length ? Math.min(...starts) : run?.createdAt);
  const end = run?.finishedAt || (ends.length ? Math.max(...ends) : undefined);
  if (!start || !end || end <= start) {
    const fallback = steps.reduce((sum, step) => sum + (step.durationMs || 0), 0);
    return Math.max(1000, fallback);
  }
  return Math.max(1000, end - start);
}

export function extractOutcome(
  toolName: string,
  resultJson?: string | null,
): StepOutcome | undefined {
  const data = parseJsonSafe(resultJson);
  if (!data || typeof data !== "object") return undefined;
  const root = data as Record<string, unknown>;
  const payload =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  if (toolName === "studio_create_folder" || toolName === "studio_ensure_path") {
    const folder =
      payload.folder && typeof payload.folder === "object"
        ? (payload.folder as Record<string, unknown>)
        : payload;
    const name = typeof folder.name === "string" ? folder.name : undefined;
    const idRaw =
      (typeof folder.id === "string" && folder.id) ||
      (typeof folder._id === "string" && folder._id) ||
      (typeof folder.folderId === "string" && folder.folderId) ||
      undefined;
    if (name) {
      return {
        label: `Created ${name}`,
        folderId: idRaw as Id<"folders"> | undefined,
        folderName: name,
      };
    }
  }

  if (
    toolName === "studio_create_document" ||
    toolName === "studio_update_document" ||
    toolName === "studio_patch_document" ||
    toolName === "studio_get_document"
  ) {
    const doc =
      payload.document && typeof payload.document === "object"
        ? (payload.document as Record<string, unknown>)
        : payload;
    const title =
      (typeof doc.title === "string" && doc.title) ||
      (typeof doc.name === "string" && doc.name) ||
      undefined;
    const idRaw =
      (typeof doc.documentId === "string" && doc.documentId) ||
      (typeof doc.id === "string" && doc.id) ||
      (typeof doc._id === "string" && doc._id) ||
      undefined;
    if (idRaw) {
      return {
        label: title ? (toolName === "studio_create_document" ? `Created ${title}` : title) : "Script",
        documentId: idRaw as Id<"documents">,
        documentTitle: title,
        folderId:
          typeof doc.folderId === "string"
            ? (doc.folderId as Id<"folders">)
            : undefined,
      };
    }
  }

  if (toolName === "studio_search") {
    const results = payload.results;
    if (Array.isArray(results)) {
      return { label: `${results.length} result${results.length === 1 ? "" : "s"}` };
    }
  }

  if (toolName === "studio_bulk_move") {
    const moved = Array.isArray(payload.moved) ? payload.moved.length : 0;
    const errors = Array.isArray(payload.errors) ? payload.errors.length : 0;
    if (moved || errors) {
      return {
        label: errors
          ? `Moved ${moved}, ${errors} failed`
          : `Moved ${moved} item${moved === 1 ? "" : "s"}`,
      };
    }
  }

  if (toolName === "studio_list_video_models") {
    const models = Array.isArray(payload.models) ? payload.models : [];
    if (models.length) {
      const bits = models.map((raw) => {
        if (!raw || typeof raw !== "object") return "";
        const m = raw as Record<string, unknown>;
        const label =
          (typeof m.label === "string" && m.label) ||
          (typeof m.slug === "string" && m.slug) ||
          "model";
        const desc = typeof m.description === "string" ? m.description.trim() : "";
        return desc ? `${label} — ${desc}` : label;
      }).filter(Boolean);
      if (bits.length) {
        return { label: bits.join(" · ") };
      }
    }
  }

  if (toolName === "skills") {
    const skillId =
      (typeof payload.skillId === "string" && payload.skillId) ||
      (payload.skill &&
      typeof payload.skill === "object" &&
      typeof (payload.skill as Record<string, unknown>).id === "string"
        ? String((payload.skill as Record<string, unknown>).id)
        : undefined);
    if (skillId) return { label: skillId };
    const skills = Array.isArray(payload.skills) ? payload.skills : [];
    if (skills.length) {
      return { label: `${skills.length} skill${skills.length === 1 ? "" : "s"}` };
    }
  }

  if (toolName === "remember") {
    const title =
      (typeof payload.title === "string" && payload.title) ||
      undefined;
    if (title) return { label: title };
  }

  if (toolName === "recall") {
    const count = typeof payload.count === "number" ? payload.count : undefined;
    if (typeof count === "number") {
      if (count === 0) return { label: "none" };
      const items = Array.isArray(payload.items) ? payload.items : [];
      const titles = items
        .map((row) =>
          row && typeof row === "object" && typeof (row as { title?: unknown }).title === "string"
            ? String((row as { title: string }).title).trim()
            : "",
        )
        .filter(Boolean)
        .slice(0, 3);
      if (titles.length) {
        const more = count > titles.length ? ` +${count - titles.length}` : "";
        return { label: `${titles.join(" · ")}${more}` };
      }
      return { label: `${count} memor${count === 1 ? "y" : "ies"}` };
    }
  }

  if (toolName === "plan") {
    const action = typeof payload.action === "string" ? payload.action : undefined;
    if (action) return { label: action.replace(/_/g, " ") };
  }

  if (toolName === "catalog") {
    const count = typeof payload.count === "number" ? payload.count : undefined;
    if (typeof count === "number") {
      return { label: `${count} tool${count === 1 ? "" : "s"}` };
    }
  }

  // Never label successful tools as generic "Done" — UI uses displayToolTitle.
  return undefined;
}

export function extractGeneratedMedia(
  toolName: string,
  resultJson?: string | null,
): AgentMediaPreview[] {
  if (!/generate_(image|video|audio)|generate_batch/i.test(toolName)) {
    return [];
  }
  const data = parseJsonSafe(resultJson);
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const payload =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const status = String(payload.status || "").toLowerCase();
  const stillRendering = Boolean(
    payload.stillRendering ||
      status === "queued" ||
      status === "running" ||
      status === "pending",
  );
  const generationJobId =
    (typeof payload.jobId === "string" && payload.jobId) ||
    (stillRendering && typeof payload.id === "string" && payload.id) ||
    (stillRendering && typeof payload._id === "string" && payload._id) ||
    undefined;

  const out: AgentMediaPreview[] = [];
  const pushAsset = (raw: Record<string, unknown>) => {
    const assetId =
      (typeof raw.assetId === "string" && raw.assetId) ||
      (typeof raw.id === "string" && raw.id && !stillRendering ? raw.id : undefined) ||
      (typeof raw._id === "string" && raw._id && !stillRendering ? raw._id : undefined) ||
      undefined;
    const kindRaw = typeof raw.kind === "string" ? raw.kind : undefined;
    const kind =
      kindRaw ||
      (toolName.includes("video")
        ? "video"
        : toolName.includes("audio")
          ? "audio"
          : "image");
    const url = typeof raw.url === "string" ? raw.url : undefined;
    const thumbnailUrl =
      typeof raw.thumbnailUrl === "string" ? raw.thumbnailUrl : undefined;
    if (!assetId && !url && !thumbnailUrl && !generationJobId) return;
    // stillRendering payloads use id=jobId — don't treat job id as assetId.
    if (stillRendering && !assetId && !url && !thumbnailUrl) return;
    out.push({
      assetId,
      generationJobId:
        stillRendering && generationJobId ? generationJobId : undefined,
      stillRendering: stillRendering || undefined,
      kind,
      name: typeof raw.name === "string" ? raw.name : undefined,
      url,
      thumbnailUrl,
    });
  };

  if (Array.isArray(payload.jobs)) {
    for (const job of payload.jobs) {
      if (!job || typeof job !== "object") continue;
      const row = job as Record<string, unknown>;
      const nested =
        row.data && typeof row.data === "object"
          ? (row.data as Record<string, unknown>)
          : row;
      const nestedStatus = String(nested.status || row.status || "").toLowerCase();
      const nestedQueued = Boolean(
        nested.stillRendering ||
          nestedStatus === "queued" ||
          nestedStatus === "running" ||
          nestedStatus === "pending",
      );
      const nestedAssetId =
        (typeof nested.assetId === "string" && nested.assetId) ||
        (typeof row.assetId === "string" && row.assetId) ||
        undefined;
      const nestedJobId =
        (typeof nested.jobId === "string" && nested.jobId) ||
        (typeof row.jobId === "string" && row.jobId) ||
        (nestedQueued && typeof nested.id === "string" && nested.id) ||
        undefined;
      if (nestedAssetId) {
        pushAsset({ ...nested, assetId: nestedAssetId });
      } else if (nestedQueued && nestedJobId) {
        out.push({
          generationJobId: nestedJobId,
          stillRendering: true,
          kind:
            String(row.mode || nested.kind || "").includes("video")
              ? "video"
              : String(row.mode || "").includes("audio")
                ? "audio"
                : "image",
        });
      }
    }
  }
  if (Array.isArray(payload.assets)) {
    for (const item of payload.assets) {
      if (item && typeof item === "object") pushAsset(item as Record<string, unknown>);
    }
  }
  if (
    !out.length &&
    payload.asset &&
    typeof payload.asset === "object"
  ) {
    pushAsset(payload.asset as Record<string, unknown>);
  }
  if (!out.length) {
    const assetId =
      (typeof payload.assetId === "string" && payload.assetId) ||
      (!stillRendering && typeof payload.id === "string" && payload.id) ||
      (!stillRendering && typeof payload._id === "string" && payload._id) ||
      undefined;
    if (assetId || payload.thumbnailUrl || payload.url) {
      pushAsset({
        ...payload,
        ...(assetId ? { assetId } : {}),
      });
    }
  }
  if (Array.isArray(payload.assetIds)) {
    for (const id of payload.assetIds) {
      if (typeof id !== "string" || !id) continue;
      if (out.some((m) => m.assetId === id)) continue;
      out.push({
        assetId: id,
        kind: toolName.includes("video")
          ? "video"
          : toolName.includes("audio")
            ? "audio"
            : "image",
      });
    }
  }

  // Queued / mid-render: no asset yet — return a followable stub for the UI.
  if (!out.length && stillRendering && generationJobId) {
    out.push({
      generationJobId,
      stillRendering: true,
      kind: toolName.includes("video")
        ? "video"
        : toolName.includes("audio")
          ? "audio"
          : "image",
    });
  }

  return out.slice(0, 8);
}

/** Parse "16:9" / "16/9" / "1.777" → CSS aspect-ratio value. */
export function cssAspectRatio(raw?: string | null, fallback = "16 / 9"): string {
  const text = String(raw || "").trim();
  if (!text) return fallback;
  const colon = text.match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i);
  if (colon) return `${colon[1]} / ${colon[2]}`;
  const num = Number(text);
  if (Number.isFinite(num) && num > 0) return `${num} / 1`;
  return fallback;
}

export function extractPendingGenerateMedia(
  toolName: string,
  argsJson?: string | null,
): AgentPendingMedia | undefined {
  if (!/studio_generate_(image|video|audio)|generate_batch/i.test(toolName)) {
    return undefined;
  }
  const kind: AgentPendingMedia["kind"] = toolName.includes("audio")
    ? "audio"
    : toolName.includes("video")
      ? "video"
      : "image";
  const parsed = parseJsonSafe(argsJson);
  const root =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  // invoke wrapper: { name, args: { aspectRatio } } OR direct studio args
  const nested =
    root.args && typeof root.args === "object"
      ? (root.args as Record<string, unknown>)
      : root;
  const label =
    (typeof nested.aspectRatio === "string" && nested.aspectRatio) ||
    (typeof root.aspectRatio === "string" && root.aspectRatio) ||
    undefined;
  const fallback = kind === "audio" ? "3 / 1" : "16 / 9";
  return {
    kind,
    aspectRatio: cssAspectRatio(label, fallback),
    aspectLabel: label || (kind === "audio" ? "3:1" : "16:9"),
  };
}

function resolveToolName(row: AgentToolCallRow): string {
  const raw = String(row.toolName || "").trim();
  if (raw && raw !== "invoke") return raw;
  const args = parseJsonSafe(row.argsJson);
  if (args && typeof args === "object") {
    const name = (args as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return raw || "invoke";
}

function toolCallToStep(
  row: AgentToolCallRow,
  approval?: AgentApprovalRow,
): DisplayStep {
  const toolName = resolveToolName(row);
  const outcome =
    row.status === "completed" || row.status === "failed"
      ? extractOutcome(toolName, row.resultJson)
      : undefined;
  const media =
    row.status === "completed" || row.status === "failed"
      ? extractGeneratedMedia(toolName, row.resultJson)
      : [];
  // False-failure salvage: Convex ReturnsValidationError after a real generate
  const salvaged =
    row.status === "failed" &&
    media.length > 0 &&
    /ReturnsValidationError/i.test(String(row.error || ""));
  const effectiveStatus = salvaged ? "completed" : row.status;
  const kind = deriveStepKind(
    toolName,
    effectiveStatus,
    salvaged ? undefined : row.error,
  );
  const title =
    row.status === "pending_approval" && approval?.title
      ? approval.title
      : displayToolTitle(toolName, effectiveStatus);
  let subtitle =
    effectiveStatus === "failed"
      ? friendlyErrorLine(toolName, row.error)
      : outcome?.label && outcome.label !== title
        ? outcome.label
        : undefined;
  if (!subtitle && effectiveStatus !== "failed") {
    const args = parseJsonSafe(row.argsJson);
    if (args && typeof args === "object") {
      const a = args as Record<string, unknown>;
      if (toolName === "skills" && typeof a.id === "string" && a.id.trim()) {
        subtitle = a.id.trim();
      } else if (toolName === "remember" && typeof a.title === "string" && a.title.trim()) {
        subtitle = a.title.trim();
      } else if (toolName === "plan" && typeof a.action === "string" && a.action.trim()) {
        subtitle = a.action.trim().replace(/_/g, " ");
      } else if (toolName === "describe" && typeof a.name === "string" && a.name.trim()) {
        subtitle = a.name.trim().replace(/^studio_/, "").replace(/_/g, " ");
      }
    }
  }
  const pendingFromArgs =
    effectiveStatus === "started" || effectiveStatus === "pending_approval"
      ? extractPendingGenerateMedia(toolName, row.argsJson)
      : undefined;

  // Queued gen already recorded (stillRendering + jobId) — keep the pending plate
  // until Create finishes, even if the tool call is marked completed / run failed.
  const renderingMedia = (media || []).find((m) => m.stillRendering && m.generationJobId);
  const jobIdFromResult =
    renderingMedia?.generationJobId ||
    (() => {
      if (row.status !== "completed" && row.status !== "failed") return undefined;
      const parsed = parseJsonSafe(row.resultJson);
      if (!parsed || typeof parsed !== "object") return undefined;
      const root = parsed as Record<string, unknown>;
      const payload =
        root.data && typeof root.data === "object"
          ? (root.data as Record<string, unknown>)
          : root;
      if (!payload.stillRendering) return undefined;
      return (
        (typeof payload.id === "string" && payload.id) ||
        (typeof payload.jobId === "string" && payload.jobId) ||
        undefined
      );
    })();

  const pendingMedia: AgentPendingMedia | undefined = pendingFromArgs
    ? {
        ...pendingFromArgs,
        generationJobId: pendingFromArgs.generationJobId || jobIdFromResult,
      }
    : renderingMedia
      ? {
          kind:
            renderingMedia.kind === "audio" || renderingMedia.kind === "video"
              ? renderingMedia.kind
              : "image",
          aspectRatio: "16 / 9",
          aspectLabel: "16:9",
          generationJobId: renderingMedia.generationJobId,
        }
      : jobIdFromResult
        ? {
            kind: /video/i.test(toolName)
              ? "video"
              : /audio/i.test(toolName)
                ? "audio"
                : "image",
            aspectRatio: "16 / 9",
            aspectLabel: "16:9",
            generationJobId: jobIdFromResult,
          }
        : undefined;

  const readyMedia = (media || []).filter(
    (m) => !m.stillRendering && (m.assetId || m.url || m.thumbnailUrl),
  );

  return {
    id: String(row._id),
    toolCallId: row._id,
    approvalId: row.approvalId ?? approval?._id,
    toolName,
    kind: row.status === "pending_approval" ? "approval" : kind,
    title,
    subtitle,
    status: effectiveStatus,
    durationMs: formatStepDuration(row.startedAt, row.finishedAt),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    argsJson: row.argsJson,
    resultJson: row.resultJson,
    error: salvaged ? undefined : row.error,
    outcome,
    media: readyMedia.length ? readyMedia : undefined,
    pendingMedia,
  };
}

/** Name/kind bucket — ignores live vs completed so a finished turn can fold leftovers. */
export function summaryBucketKey(step: DisplayStep): string | null {
  if (
    step.status === "failed" ||
    step.status === "pending_approval" ||
    step.status === "summary" ||
    step.kind === "error" ||
    step.kind === "approval"
  ) {
    return null;
  }
  const name = String(step.toolName || "");
  if (name === "ask") return null;
  if (
    /search|workspace_tree|folder_contents|list_folders|list_elements|resolve_path|project_context|bootstrap|catalog|describe/.test(
      name,
    )
  ) {
    return "explore";
  }
  if (/get_document|get_asset|get_folder|view_media|^inspect$/.test(name)) {
    return "read";
  }
  if (/generate_video/.test(name)) return "gen_video";
  if (/generate_audio/.test(name)) return "gen_audio";
  if (/generate_image|generate_batch|generate_script/.test(name)) return "gen_image";
  if (/create_document|create_folder|create_element|upload_asset|ensure_path/.test(name)) {
    return "create";
  }
  if (/patch_document|update_document|update_element|update_folder|update_asset|bulk_move/.test(name)) {
    return "edit";
  }
  if (name === "plan") return "plan";
  if (name === "skills") return "skills";
  if (name === "remember" || name === "recall") return "memory";
  if (/estimate/.test(name)) return "estimate";
  if (/trash|restore/.test(name)) return "trash";
  if (/send_|share|unshare/.test(name)) return "share";
  if (step.kind === "read" || step.kind === "meta") return "explore";
  if (step.kind === "write") return "edit";
  if (step.kind === "generate") return "gen_image";
  return "other";
}

/** Bucket a completed (or optionally leftover live) step into a summary key. */
export function summaryBucketForStep(
  step: DisplayStep,
  opts?: { includeActive?: boolean },
): string | null {
  if (
    !opts?.includeActive &&
    (step.status === "started" || step.status === "queued")
  ) {
    return null;
  }
  return summaryBucketKey(step);
}

function formatSummarySegments(counts: Record<string, number>): string[] {
  const parts: string[] = [];
  const push = (n: number, one: string, many: string) => {
    if (n <= 0) return;
    parts.push(n === 1 ? one : many.replace("{n}", String(n)));
  };
  push(counts.explore || 0, "Explored workspace", "Explored {n} places");
  push(counts.read || 0, "Read 1 script", "Read {n} scripts");
  push(counts.gen_video || 0, "Generated 1 video", "Generated {n} videos");
  push(counts.gen_image || 0, "Generated 1 image", "Generated {n} images");
  push(counts.gen_audio || 0, "Generated 1 voiceover", "Generated {n} voiceovers");
  push(counts.create || 0, "Created 1 item", "Created {n} items");
  push(counts.edit || 0, "Edited 1 item", "Edited {n} items");
  push(counts.plan || 0, "Updated plan", "Updated plan {n}×");
  push(counts.skills || 0, "Loaded 1 skill", "Loaded {n} skills");
  push(counts.memory || 0, "Used memory", "Memory {n}×");
  push(counts.estimate || 0, "Checked cost", "Checked cost {n}×");
  push(counts.trash || 0, "Cleaned up 1 item", "Cleaned up {n} items");
  push(counts.share || 0, "Shared 1 item", "Shared {n} items");
  push(counts.other || 0, "Finished 1 step", "Finished {n} steps");
  return parts;
}

/**
 * Fold settled completed steps into one horizontal human summary.
 * Live / unsettled / errors / approvals stay as full rows outside the summary.
 */
export function foldSettledSteps(
  steps: DisplayStep[],
  settledIds: ReadonlySet<string>,
  opts?: { includeActive?: boolean },
): DisplayStep[] {
  const foldable: DisplayStep[] = [];
  const kept: DisplayStep[] = [];
  const foldableIds = new Set<string>();

  for (const step of steps) {
    if (step.isGroupSummary) continue;
    const bucket = summaryBucketForStep(step, opts);
    const canFold =
      Boolean(bucket) &&
      (step.status === "completed" ||
        (opts?.includeActive &&
          (step.status === "started" || step.status === "queued"))) &&
      settledIds.has(step.id);
    if (canFold) {
      foldable.push(step);
      foldableIds.add(step.id);
    } else {
      kept.push(step);
    }
  }

  if (foldable.length === 0) return kept;

  const counts: Record<string, number> = {};
  for (const step of foldable) {
    const bucket = summaryBucketForStep(step, opts);
    if (!bucket) continue;
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  const segments = formatSummarySegments(counts);
  if (!segments.length) return kept;

  const summary: DisplayStep = {
    id: `fold-summary-${foldable[0]!.id}`,
    kind: "meta",
    title: segments.join(" · "),
    subtitle: undefined,
    status: "summary",
    collapsedGroupCount: foldable.length,
    isGroupSummary: true,
    summarySegments: segments,
  };

  // Summary first, then live/error/unsettled rows in original order.
  const out: DisplayStep[] = [summary];
  for (const step of steps) {
    if (step.isGroupSummary) continue;
    if (foldableIds.has(step.id)) continue;
    out.push(step);
  }
  return out;
}

/** Ids that are eligible to fold once settled (completed, or leftovers after the turn). */
export function foldableCompletedIds(
  steps: DisplayStep[],
  opts?: { includeActive?: boolean },
): string[] {
  return steps
    .filter((step) => {
      if (!summaryBucketForStep(step, opts)) return false;
      if (step.status === "completed") return true;
      return Boolean(
        opts?.includeActive &&
          (step.status === "started" || step.status === "queued"),
      );
    })
    .map((step) => step.id);
}

/** Collapse only long runs of quiet folder peeks — never hide skills/memory/plan/tools. */
export function collapseQuietSteps(steps: DisplayStep[]): DisplayStep[] {
  // Kept for tests / legacy; live UI shows vertical rows, then a Worked disclosure.
  const out: DisplayStep[] = [];
  const visibleTail = 3;
  let i = 0;
  while (i < steps.length) {
    const step = steps[i]!;
    if (
      isAlwaysVisibleTool(step.toolName) ||
      step.kind === "write" ||
      step.kind === "generate" ||
      step.kind === "approval" ||
      step.kind === "error" ||
      step.status === "failed" ||
      step.status === "pending_approval"
    ) {
      out.push(step);
      i += 1;
      continue;
    }

    const next = steps[i + 1];
    const duplicateQuietPair =
      next &&
      step.toolName &&
      next.toolName === step.toolName &&
      next.title === step.title &&
      (step.kind === "read" || step.kind === "meta") &&
      (next.kind === "read" || next.kind === "meta") &&
      !isAlwaysVisibleTool(next.toolName);
    if (duplicateQuietPair) {
      i += 1;
      continue;
    }
    const isQuiet =
      (step.kind === "read" || step.kind === "meta") &&
      (step.status === "completed" || step.status === "started");
    if (!isQuiet) {
      out.push(step);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < steps.length) {
      const peek = steps[j]!;
      const nextQuiet =
        !isAlwaysVisibleTool(peek.toolName) &&
        (peek.kind === "read" || peek.kind === "meta") &&
        (peek.status === "completed" || peek.status === "started");
      if (!nextQuiet) break;
      j += 1;
    }
    const count = j - i;
    if (count > visibleTail) {
      const hiddenCount = count - visibleTail;
      out.push({
        id: `summary-${steps[i]!.id}`,
        kind: "read",
        title: "Checked workspace",
        subtitle: `${hiddenCount} earlier lookup${hiddenCount === 1 ? "" : "s"}`,
        status: "summary",
        collapsedGroupCount: hiddenCount,
        isGroupSummary: true,
      });
      out.push(...steps.slice(j - visibleTail, j));
      i = j;
    } else {
      out.push(step);
      i += 1;
    }
  }
  return out;
}

export function buildAgentTurns(args: {
  messages: AgentMessageRow[];
  toolCalls: AgentToolCallRow[];
  runs: AgentRunRow[];
  approvals: AgentApprovalRow[];
  busy?: boolean;
  activeRunId?: Id<"agentRuns"> | null;
  pendingUserText?: string | null;
  pendingAttachments?: AgentAttachmentChip[] | null;
}): AgentTurn[] {
  const {
    messages,
    toolCalls,
    runs,
    approvals,
    busy,
    activeRunId,
    pendingUserText,
    pendingAttachments,
  } =
    args;
  const approvalById = new Map(approvals.map((a) => [a._id, a]));
  const toolsByRun = new Map<string, AgentToolCallRow[]>();
  for (const tc of toolCalls) {
    const key = String(tc.runId);
    const list = toolsByRun.get(key) ?? [];
    list.push(tc);
    toolsByRun.set(key, list);
  }
  for (const [key, list] of toolsByRun) {
    toolsByRun.set(
      key,
      [...list].sort((a, b) => a.startedAt - b.startedAt),
    );
  }

  const runsAsc = [...runs].sort((a, b) => a.createdAt - b.createdAt);
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantByRun = new Map<string, string>();
  for (const run of runsAsc) {
    if (run.userMessage) {
      assistantByRun.set(String(run._id), "");
    }
  }
  // Pair assistant messages to runs by order
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  runsAsc.forEach((run, idx) => {
    const assistant = assistantMessages[idx];
    if (assistant) {
      assistantByRun.set(String(run._id), assistant.content);
    }
  });

  const turns: AgentTurn[] = [];

  userMessages.forEach((userMsg, idx) => {
    const run = runsAsc[idx];
    const runId = run?._id;
    const rawSteps = runId
      ? (toolsByRun.get(String(runId)) ?? []).map((tc) =>
          toolCallToStep(tc, tc.approvalId ? approvalById.get(tc.approvalId) : undefined),
        )
      : [];
    if (runId) {
      const linkedApprovalIds = new Set(
        rawSteps
          .map((step) => step.approvalId)
          .filter(Boolean)
          .map((id) => String(id)),
      );
      const orphanApprovalSteps = approvals
        .filter(
          (approval) =>
            approval.runId === runId &&
            approval.status === "pending" &&
            !linkedApprovalIds.has(String(approval._id)),
        )
        .map((approval) => ({
          id: `approval-${String(approval._id)}`,
          approvalId: approval._id,
          toolName: approval.toolName,
          kind: "approval" as const,
          title: approval.title,
          subtitle: undefined,
          status: "pending_approval" as const,
          isLive: true,
        }));
      rawSteps.push(...orphanApprovalSteps);
    }
    const steps = rawSteps;
    const assistant = assistantMessages[idx];

    turns.push({
      id: String(userMsg._id),
      runId,
      userText: userMsg.content,
      attachments: parseAgentAttachments(userMsg.attachmentsJson),
      userMessageId: userMsg._id,
      assistantText: assistant?.content,
      assistantMessageId: assistant?._id,
      steps,
      isLive: false,
      workedMs: steps.length ? turnWorkedMs(steps, run) : undefined,
    });
  });

  if (busy) {
    const liveRun =
      (activeRunId ? runsAsc.find((r) => r._id === activeRunId) : undefined) ??
      [...runsAsc]
        .reverse()
        .find((r) =>
          ["running", "queued", "awaiting_approval"].includes(r.status),
        );
    const liveRunId = liveRun?._id;
    const liveSteps = liveRunId
      ? (toolsByRun.get(String(liveRunId)) ?? []).map((tc) =>
          toolCallToStep(
            tc,
            tc.approvalId ? approvalById.get(tc.approvalId) : undefined,
          ),
        )
      : [];
    const pendingText = pendingUserText?.trim();
    const hasPendingAttachments = Boolean(pendingAttachments?.length);
    const hasOptimisticSend = Boolean(pendingText) || hasPendingAttachments;
    const lastTurn = turns[turns.length - 1];
    // Convex caught up: newest user row is this send and still has no assistant.
    // Never fall back to an older completed turn — that blanks prior reply/steps for a beat.
    const lastIsThisSend =
      hasOptimisticSend &&
      Boolean(lastTurn) &&
      (!pendingText || lastTurn!.userText === pendingText) &&
      !lastTurn!.assistantText;

    const markLiveSteps = (steps: DisplayStep[]) =>
      steps.map((step) => ({
        ...step,
        isLive:
          step.status === "started" ||
          step.status === "queued" ||
          step.status === "pending_approval",
      }));

    if (hasOptimisticSend && !lastIsThisSend) {
      turns.push({
        id: "pending-user",
        userText: pendingText ?? "",
        attachments: pendingAttachments ?? [],
        steps: markLiveSteps(liveSteps),
        isLive: true,
        runId: liveRunId,
      });
    } else if (lastTurn) {
      lastTurn.isLive = true;
      if (liveSteps.length) {
        lastTurn.steps = markLiveSteps(liveSteps);
      }
      if (liveRunId) lastTurn.runId = liveRunId;
      if (pendingAttachments?.length) lastTurn.attachments = pendingAttachments;
      // Keep any assistant text already synced — do not wipe completed prior turns.
    }
  }

  return turns;
}

export function liveProgressLabel(steps: DisplayStep[]): string {
  const active = steps.filter(
    (s) => s.status === "started" || s.status === "pending_approval",
  );
  const count = steps.length;
  if (!count) return "Working…";
  const last = active[active.length - 1] ?? steps[steps.length - 1];
  if (!last) return "Working…";
  if (count === 1) return last.title;
  return `${count} steps · ${last.title}`;
}
