import type { Id } from "../../../../convex/_generated/dataModel";
import {
  deriveStepKind,
  displayToolTitle,
  friendlyErrorLine,
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
  argsJson?: string;
  resultJson?: string;
  error?: string;
  outcome?: StepOutcome;
  collapsedGroupCount?: number;
  isGroupSummary?: boolean;
  isLive?: boolean;
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

  // Never label successful tools as generic "Done" — UI uses displayToolTitle.
  return undefined;
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
  const kind = deriveStepKind(toolName, row.status, row.error);
  const outcome =
    row.status === "completed" ? extractOutcome(toolName, row.resultJson) : undefined;
  const title =
    row.status === "pending_approval" && approval?.title
      ? approval.title
      : displayToolTitle(toolName, row.status);
  const subtitle =
    row.status === "failed"
      ? friendlyErrorLine(toolName, row.error)
      : outcome?.label && outcome.label !== title
        ? outcome.label
        : undefined;

  return {
    id: String(row._id),
    toolCallId: row._id,
    approvalId: row.approvalId ?? approval?._id,
    toolName,
    kind: row.status === "pending_approval" ? "approval" : kind,
    title,
    subtitle,
    status: row.status,
    durationMs: formatStepDuration(row.startedAt, row.finishedAt),
    argsJson: row.argsJson,
    resultJson: row.resultJson,
    error: row.error,
    outcome,
  };
}

/** Collapse older quiet read/meta steps, but keep the newest 3 visible. */
export function collapseQuietSteps(steps: DisplayStep[]): DisplayStep[] {
  const out: DisplayStep[] = [];
  const visibleTail = 3;
  let i = 0;
  while (i < steps.length) {
    const step = steps[i]!;
    const next = steps[i + 1];
    const duplicateQuietPair =
      next &&
      step.toolName &&
      next.toolName === step.toolName &&
      next.title === step.title &&
      (step.kind === "read" || step.kind === "meta") &&
      step.status === "completed" &&
      (next.status === "started" ||
        next.status === "pending_approval" ||
        next.status === "completed");
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
      const next = steps[j]!;
      const nextQuiet =
        (next.kind === "read" || next.kind === "meta") &&
        (next.status === "completed" || next.status === "started");
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
    const steps = collapseQuietSteps(rawSteps);
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
      ? collapseQuietSteps(
          (toolsByRun.get(String(liveRunId)) ?? []).map((tc) =>
            toolCallToStep(
              tc,
              tc.approvalId ? approvalById.get(tc.approvalId) : undefined,
            ),
          ),
        )
      : [];
    const pendingText = pendingUserText?.trim();
    const hasPendingAttachments = Boolean(pendingAttachments?.length);
    const liveTurn =
      (pendingText
        ? [...turns].reverse().find((turn) => turn.userText === pendingText)
        : undefined) ??
      (!pendingText && hasPendingAttachments ? undefined : turns[turns.length - 1]);

    if (liveTurn) {
      liveTurn.isLive = true;
      if (liveSteps.length) {
        liveTurn.steps = liveSteps.map((step) => ({
          ...step,
          isLive:
            step.status === "started" ||
            step.status === "queued" ||
            step.status === "pending_approval",
        }));
      }
      if (liveRunId) liveTurn.runId = liveRunId;
      if (pendingAttachments?.length) liveTurn.attachments = pendingAttachments;
      liveTurn.assistantText = undefined;
    } else if (pendingText || hasPendingAttachments) {
      turns.push({
        id: "pending-user",
        userText: pendingText ?? "",
        attachments: pendingAttachments ?? [],
        steps: liveSteps.map((step) => ({
          ...step,
          isLive:
            step.status === "started" ||
            step.status === "queued" ||
            step.status === "pending_approval",
        })),
        isLive: true,
        runId: liveRunId,
      });
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
