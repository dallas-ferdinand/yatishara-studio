import type { Id } from "../../../../convex/_generated/dataModel";
import {
  deriveStepKind,
  friendlyErrorLine,
  humanToolTitle,
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
  approvalId?: Id<"agentApprovals">;
  createdAt: number;
};

export type AgentRunRow = {
  _id: Id<"agentRuns">;
  userMessage: string;
  status: string;
  createdAt: number;
};

export type AgentApprovalRow = {
  _id: Id<"agentApprovals">;
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

  if (root.ok === true && typeof payload === "object") {
    return { label: "Done" };
  }

  return undefined;
}

function toolCallToStep(
  row: AgentToolCallRow,
  approval?: AgentApprovalRow,
): DisplayStep {
  const kind = deriveStepKind(row.toolName, row.status, row.error);
  const outcome =
    row.status === "completed" ? extractOutcome(row.toolName, row.resultJson) : undefined;
  const subtitle =
    row.status === "failed"
      ? friendlyErrorLine(row.toolName, row.error)
      : outcome?.label;

  return {
    id: String(row._id),
    toolCallId: row._id,
    approvalId: row.approvalId ?? approval?._id,
    kind: row.status === "pending_approval" ? "approval" : kind,
    title:
      row.status === "pending_approval" && approval?.title
        ? approval.title
        : humanToolTitle(row.toolName),
    subtitle,
    status: row.status,
    durationMs: formatStepDuration(row.startedAt, row.finishedAt),
    argsJson: row.argsJson,
    resultJson: row.resultJson,
    error: row.error,
    outcome,
  };
}

/** Collapse 3+ consecutive successful read/meta steps into one summary row. */
export function collapseQuietSteps(steps: DisplayStep[]): DisplayStep[] {
  const out: DisplayStep[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i]!;
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
    if (count >= 3) {
      out.push({
        id: `summary-${steps[i]!.id}`,
        kind: "read",
        title: "Checked workspace",
        subtitle: `${count} lookups`,
        status: "summary",
        collapsedGroupCount: count,
        isGroupSummary: true,
      });
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
}): AgentTurn[] {
  const { messages, toolCalls, runs, approvals, busy, activeRunId, pendingUserText } =
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
    const steps = collapseQuietSteps(rawSteps);
    const assistant = assistantMessages[idx];

    turns.push({
      id: String(userMsg._id),
      runId,
      userText: userMsg.content,
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
    const liveTurn =
      (pendingText
        ? [...turns].reverse().find((turn) => turn.userText === pendingText)
        : undefined) ?? turns[turns.length - 1];

    if (liveTurn) {
      liveTurn.isLive = true;
      if (liveSteps.length) liveTurn.steps = liveSteps;
      if (liveRunId) liveTurn.runId = liveRunId;
      liveTurn.assistantText = undefined;
    } else if (pendingText) {
      turns.push({
        id: "pending-user",
        userText: pendingText,
        steps: liveSteps,
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
