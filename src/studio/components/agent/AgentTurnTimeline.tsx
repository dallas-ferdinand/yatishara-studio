"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  Music,
  Shapes,
  Video,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StudioChatMarkdown } from "../StudioChatMarkdown";
import { AgentApprovalStep } from "./AgentApprovalStep";
import { AgentStepRow } from "./AgentStepRow";
import {
  buildAgentTurns,
  liveProgressLabel,
  type AgentAttachmentChip,
  type AgentApprovalRow,
  type AgentMessageRow,
  type AgentRunRow,
  type AgentToolCallRow,
  type AgentTurn,
} from "./agentStepUtils";
import "./agent-steps.css";

type AgentTurnTimelineProps = {
  messages: AgentMessageRow[];
  toolCalls: AgentToolCallRow[];
  runs: AgentRunRow[];
  approvals: AgentApprovalRow[];
  busy?: boolean;
  activeRunId?: Id<"agentRuns"> | null;
  pendingUserText?: string | null;
  pendingAttachments?: AgentAttachmentChip[] | null;
  onDecideApproval: (
    approvalId: Id<"agentApprovals">,
    decision: "approve" | "deny",
  ) => void;
  onOpenFolder?: (folderId: Id<"folders">) => void;
};

function chipLabel(attachment: AgentAttachmentChip) {
  return (
    attachment.label ||
    attachment.path ||
    attachment.studioId ||
    "Attachment"
  );
}

function ChipGlyph({ attachment }: { attachment: AgentAttachmentChip }) {
  const size = 11;
  if (attachment.kind === "video") return <Video size={size} aria-hidden="true" />;
  if (attachment.kind === "audio") return <Music size={size} aria-hidden="true" />;
  if (attachment.kind === "image") return <ImageIcon size={size} aria-hidden="true" />;
  if (attachment.studioKind === "folder") return <Folder size={size} aria-hidden="true" />;
  if (attachment.studioKind === "document") return <FileText size={size} aria-hidden="true" />;
  if (attachment.studioKind === "element") return <Shapes size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

function AgentBubbleChip({
  attachment,
  previewUrl,
  resolvedKind,
}: {
  attachment: AgentAttachmentChip;
  previewUrl?: string;
  resolvedKind?: string;
}) {
  const label = chipLabel(attachment);
  const kind = resolvedKind || attachment.kind;
  const isVideo = kind === "video";
  const isImage = kind === "image";
  const showThumb = Boolean(previewUrl) && (isImage || isVideo);

  if (showThumb && previewUrl) {
    return (
      <span
        className="studio-inline-tag studio-inline-tag--preview studio-inline-tag--image-only studio-agent-attachment-chip is-static is-inline"
        title={label}
      >
        <span className="studio-inline-tag-kind">
          {isVideo ? (
            <video
              className="studio-inline-tag-media"
              src={previewUrl}
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="studio-inline-tag-media" src={previewUrl} alt="" />
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className="studio-inline-tag studio-agent-attachment-chip is-static is-inline"
      title={label}
    >
      <span className="studio-inline-tag-kind">
        <ChipGlyph attachment={{ ...attachment, kind: kind || attachment.kind }} />
      </span>
      <span className="studio-inline-tag-label">{label}</span>
    </span>
  );
}

function TurnBlock({
  turn,
  expandedStepId,
  onToggleStep,
  approvalById,
  onDecideApproval,
  onOpenFolder,
  thumbById,
}: {
  turn: AgentTurn;
  expandedStepId: string | null;
  onToggleStep: (id: string) => void;
  approvalById: Map<string, AgentApprovalRow>;
  onDecideApproval: AgentTurnTimelineProps["onDecideApproval"];
  onOpenFolder?: (folderId: Id<"folders">) => void;
  thumbById: Map<string, { url: string; kind: string }>;
}) {
  const inline = useMemo(
    () => splitUserTextWithAttachments(turn.userText, turn.attachments ?? []),
    [turn.userText, turn.attachments],
  );

  const previewFor = (attachment: AgentAttachmentChip) => {
    const local = attachment.thumbnailUrl || attachment.mediaUrl;
    if (local) {
      return { url: local, kind: attachment.kind };
    }
    if (attachment.studioKind === "asset" && attachment.studioId) {
      return thumbById.get(attachment.studioId);
    }
    return undefined;
  };

  const hasActiveStep = turn.steps.some(
    (step) =>
      step.status === "started" ||
      step.status === "queued" ||
      step.status === "pending_approval",
  );
  const primaryPreview = (turn.attachments ?? [])
    .map((attachment) => {
      const preview = previewFor(attachment);
      if (!preview?.url) return null;
      return {
        url: preview.url,
        kind: preview.kind || attachment.kind,
      };
    })
    .find(Boolean) as { url: string; kind?: string } | undefined;

  return (
    <section className="studio-agent-turn" aria-label="Agent turn">
      {inline.parts.length || turn.userText ? (
        <article className="studio-chat-bubble is-user studio-agent-user-bubble">
          {inline.parts.length
            ? inline.parts.map((part) => {
                if (part.type === "text") {
                  return <span key={part.key}>{part.value}</span>;
                }
                const preview = previewFor(part.attachment);
                return (
                  <AgentBubbleChip
                    key={part.key}
                    attachment={part.attachment}
                    previewUrl={preview?.url}
                    resolvedKind={preview?.kind || part.attachment.kind}
                  />
                );
              })
            : turn.userText}
        </article>
      ) : null}
      {inline.leftover.length ? (
        <div className="studio-agent-turn-attachments" aria-label="Attached items">
          {inline.leftover.map((attachment, index) => {
            const preview = previewFor(attachment);
            return (
              <AgentBubbleChip
                key={`${attachment.studioId ?? attachment.label ?? "attachment"}-${index}`}
                attachment={attachment}
                previewUrl={preview?.url}
                resolvedKind={preview?.kind || attachment.kind}
              />
            );
          })}
        </div>
      ) : null}

      {turn.steps.length > 0 ? (
        <div className="studio-agent-turn-steps" role="list">
          {turn.steps.map((step) => {
            const approval =
              step.approvalId != null
                ? approvalById.get(String(step.approvalId))
                : undefined;
            if (step.kind === "approval" && approval) {
              return (
                <AgentApprovalStep
                  key={step.id}
                  step={step}
                  approval={approval}
                  expanded={expandedStepId === step.id}
                  onToggle={() => onToggleStep(step.id)}
                  onDecide={onDecideApproval}
                  onOpenFolder={onOpenFolder}
                  previewUrl={primaryPreview?.url}
                  previewKind={primaryPreview?.kind}
                />
              );
            }
            return (
              <AgentStepRow
                key={step.id}
                step={step}
                expanded={expandedStepId === step.id}
                onToggle={() => onToggleStep(step.id)}
                onOpenFolder={onOpenFolder}
              />
            );
          })}
        </div>
      ) : null}

      {turn.isLive && !turn.assistantText && !hasActiveStep ? (
        <div className="studio-agent-live-progress" role="status">
          <span className="studio-agent-step-icon" aria-hidden="true">
            <Loader2 size={13} className="animate-spin" />
          </span>
          <span className="studio-agent-meta">{liveProgressLabel(turn.steps)}</span>
        </div>
      ) : null}

      {turn.assistantText ? (
        <article className="studio-chat-bubble is-assistant">
          <StudioChatMarkdown text={turn.assistantText} />
        </article>
      ) : null}
    </section>
  );
}

function splitUserTextWithAttachments(
  text: string,
  attachments: AgentAttachmentChip[],
) {
  const parts: Array<
    | { type: "text"; key: string; value: string }
    | { type: "chip"; key: string; attachment: AgentAttachmentChip }
  > = [];
  let buffer = "";
  let tokenIndex = 0;
  let partIndex = 0;
  const used = new Set<number>();
  const flush = () => {
    if (!buffer) return;
    parts.push({ type: "text", key: `t-${partIndex++}`, value: buffer });
    buffer = "";
  };
  for (const ch of String(text ?? "")) {
    if (ch === "\uFFFC") {
      flush();
      const attachment = attachments[tokenIndex];
      if (attachment) {
        used.add(tokenIndex);
        parts.push({
          type: "chip",
          key: `c-${partIndex++}-${attachment.studioId ?? tokenIndex}`,
          attachment,
        });
      }
      tokenIndex += 1;
      continue;
    }
    buffer += ch;
  }
  flush();
  const leftover = attachments.filter((_, index) => !used.has(index));
  return { parts, leftover };
}

function collectAssetIds(
  turns: AgentTurn[],
  pendingAttachments?: AgentAttachmentChip[] | null,
): Id<"assets">[] {
  const ids = new Set<string>();
  for (const turn of turns) {
    for (const item of turn.attachments ?? []) {
      if (item.studioKind === "asset" && item.studioId) ids.add(item.studioId);
    }
  }
  for (const item of pendingAttachments ?? []) {
    if (item.studioKind === "asset" && item.studioId) ids.add(item.studioId);
  }
  return [...ids].slice(0, 40) as Id<"assets">[];
}

export function AgentTurnTimeline({
  messages,
  toolCalls,
  runs,
  approvals,
  busy,
  activeRunId,
  pendingUserText,
  pendingAttachments,
  onDecideApproval,
  onOpenFolder,
}: AgentTurnTimelineProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const approvalById = useMemo(
    () => new Map(approvals.map((row) => [String(row._id), row])),
    [approvals],
  );

  const turns = useMemo(
    () =>
      buildAgentTurns({
        messages,
        toolCalls,
        runs,
        approvals,
        busy,
        activeRunId,
        pendingUserText,
        pendingAttachments,
      }),
    [
      messages,
      toolCalls,
      runs,
      approvals,
      busy,
      activeRunId,
      pendingUserText,
      pendingAttachments,
    ],
  );

  const assetIds = useMemo(
    () => collectAssetIds(turns, pendingAttachments),
    [turns, pendingAttachments],
  );
  const assets = useQuery(
    api.assets.listByIds,
    assetIds.length ? { assetIds, quality: "thumb" as const } : "skip",
  );
  const thumbById = useMemo(() => {
    const map = new Map<string, { url: string; kind: string }>();
    for (const asset of assets ?? []) {
      const url =
        asset.signedThumbnailUrl ||
        asset.signedThumbnailLqipUrl ||
        (asset.kind === "image" ? asset.signedReadUrl : undefined);
      if (url) map.set(String(asset._id), { url, kind: asset.kind });
    }
    return map;
  }, [assets]);

  function toggleStep(id: string) {
    setExpandedStepId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      {turns.map((turn) => (
        <TurnBlock
          key={turn.id}
          turn={turn}
          expandedStepId={expandedStepId}
          onToggleStep={toggleStep}
          approvalById={approvalById}
          onDecideApproval={onDecideApproval}
          onOpenFolder={onOpenFolder}
          thumbById={thumbById}
        />
      ))}
    </>
  );
}
